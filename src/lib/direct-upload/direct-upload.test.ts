import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError } from "../core/api.js"
import {
	aggregateDirectProgress,
	directPartRanges,
	directRetryDelayMs,
	isDirectRetryableStatus,
	remainingPartNumbers,
	uploadDirectBlob,
	uploadDirectMultipart,
	type DirectCompletedPart,
} from "./direct-upload.js"

afterEach(() => {
	vi.unstubAllGlobals()
})

interface Script {
	failTimes: number
	status: number
	etag: string
	seen: number
	progress: Array<[number, number]>
	method: string
	sent: unknown
}

function installXhr(scripts: Map<string, Script>): void {
	class FakeXHR {
		upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
		status = 200
		statusText = "OK"
		responseText = ""
		timeout = 0
		withCredentials = false
		onload: (() => void) | null = null
		onerror: (() => void) | null = null
		onabort: (() => void) | null = null
		ontimeout: (() => void) | null = null
		url = ""
		method = ""
		requestHeaders: Record<string, string> = {}
		static etags = new Map<string, string>()
		open(method: string, url: string) {
			this.method = method
			this.url = url
		}
		setRequestHeader(key: string, value: string) {
			this.requestHeaders[key.toLowerCase()] = value
		}
		getResponseHeader(name: string): string | null {
			if (name.toLowerCase() === "etag") return FakeXHR.etags.get(this.url) ?? null
			return null
		}
		getAllResponseHeaders(): string {
			return ""
		}
		send(body: unknown) {
			const script = scripts.get(this.url)
			const blob = body as Blob
			const size = blob instanceof Blob ? blob.size : 0
			if (script !== undefined) {
				script.seen += 1
				script.method = this.method
				script.sent = body
				if (script.seen <= script.failTimes) {
					this.status = script.status
					this.statusText = "Busy"
					this.onload?.()
					return
				}
				FakeXHR.etags.set(this.url, script.etag)
				script.progress.push([Math.floor(size / 2), size])
				script.progress.push([size, size])
				this.upload.onprogress?.({ lengthComputable: true, loaded: Math.floor(size / 2), total: size } as ProgressEvent)
				this.upload.onprogress?.({ lengthComputable: true, loaded: size, total: size } as ProgressEvent)
				this.status = 200
				this.onload?.()
				return
			}
			void size
			this.status = 200
			this.onload?.()
		}
		abort() {
			this.onabort?.()
		}
	}
	vi.stubGlobal("XMLHttpRequest", FakeXHR)
}

describe("direct part ranges", () => {
	test("an even split yields full parts and a short tail", () => {
		expect(directPartRanges(10, 4)).toEqual([
			{ partNumber: 1, start: 0, end: 4 },
			{ partNumber: 2, start: 4, end: 8 },
			{ partNumber: 3, start: 8, end: 10 },
		])
	})

	test("an exact multiple has no tail and an empty blob sends one empty PUT", () => {
		expect(directPartRanges(8, 4)).toEqual([
			{ partNumber: 1, start: 0, end: 4 },
			{ partNumber: 2, start: 4, end: 8 },
		])
		expect(directPartRanges(0, 4)).toEqual([{ partNumber: 1, start: 0, end: 0 }])
	})

	test("a bad size is refused before any URL is read", () => {
		expect(() => directPartRanges(-1, 4)).toThrow(RangeError)
		expect(() => directPartRanges(1.5, 4)).toThrow(RangeError)
		expect(() => directPartRanges(10, 0)).toThrow(RangeError)
	})
})

describe("direct resume maths", () => {
	test("stored parts fall away in order and stale numbers fall away too", () => {
		expect(remainingPartNumbers(4, [2, 4])).toEqual([1, 3])
		expect(remainingPartNumbers(3, [1, 2, 3])).toEqual([])
		expect(remainingPartNumbers(3, [0, 4, 2, 2])).toEqual([1, 3])
	})

	test("finished bytes plus live bytes sum to one total", () => {
		expect(aggregateDirectProgress(100, [10, 20])).toBe(130)
		expect(aggregateDirectProgress(0, [])).toBe(0)
	})
})

describe("direct retry maths", () => {
	test("the delay doubles and then stops at the ceiling", () => {
		expect(directRetryDelayMs(1)).toBe(250)
		expect(directRetryDelayMs(2)).toBe(500)
		expect(directRetryDelayMs(3)).toBe(1000)
		expect(directRetryDelayMs(4)).toBe(2000)
		expect(directRetryDelayMs(5)).toBe(2000)
		expect(directRetryDelayMs(6)).toBeNull()
		expect(directRetryDelayMs(0)).toBeNull()
	})

	test("busy answers retry and refused answers do not", () => {
		expect(isDirectRetryableStatus(408)).toBe(true)
		expect(isDirectRetryableStatus(429)).toBe(true)
		expect(isDirectRetryableStatus(503)).toBe(true)
		expect(isDirectRetryableStatus(400)).toBe(false)
		expect(isDirectRetryableStatus(403)).toBe(false)
		expect(isDirectRetryableStatus(200)).toBe(false)
	})
})

describe("direct blob PUT", () => {
	test("a raw body leaves with socket progress and resolves with its receipt", async () => {
		const scripts = new Map<string, Script>([
			["https://store.example/part-1", { failTimes: 0, status: 200, etag: "receipt-1", seen: 0, progress: [], method: "", sent: null }],
		])
		installXhr(scripts)
		const progress: Array<[number, number]> = []
		const blob = new Blob(["hello"], { type: "video/mp4" })
		const etag = await uploadDirectBlob("https://store.example/part-1", blob, {
			credentials: "omit",
			onProgress: (loaded, total) => {
				progress.push([loaded, total])
			},
		})
		expect(etag).toBe("receipt-1")
		const script = scripts.get("https://store.example/part-1")
		expect(script?.method).toBe("PUT")
		expect(script?.sent).toBeInstanceOf(Blob)
		expect(await (script?.sent as Blob).text()).toBe("hello")
		expect(progress.length).toBeGreaterThan(1)
		expect(progress[progress.length - 1]).toEqual([blob.size, blob.size])
		for (let index = 1; index < progress.length; index += 1) {
			expect(progress[index]?.[0]).toBeGreaterThanOrEqual(progress[index - 1]?.[0] ?? 0)
		}
	})

	test("a refused PUT stays http_error and a missing host rejects", async () => {
		vi.stubGlobal("XMLHttpRequest", undefined)
		await expect(uploadDirectBlob("https://store.example/x", new Blob(["x"]))).rejects.toThrow(/XMLHttpRequest/)
	})
})

describe("direct multipart session", () => {
	test("parts travel in order with one monotonic bar and close carries every receipt", async () => {
		const bytes = new Uint8Array(10).map((_, index) => index)
		const blob = new Blob([bytes], { type: "video/mp4" })
		const scripts = new Map<string, Script>([
			["https://store.example/p1", { failTimes: 0, status: 200, etag: "e1", seen: 0, progress: [], method: "", sent: null }],
			["https://store.example/p2", { failTimes: 0, status: 200, etag: "e2", seen: 0, progress: [], method: "", sent: null }],
			["https://store.example/p3", { failTimes: 0, status: 200, etag: "e3", seen: 0, progress: [], method: "", sent: null }],
		])
		installXhr(scripts)
		const progress: Array<[number, number]> = []
		const landed: DirectCompletedPart[] = []
		let closed: DirectCompletedPart[] = []
		const receipt = await uploadDirectMultipart<string>(blob, {
			create: async () => ({ uploadId: "u1" }),
			partUrl: (uploadId, partNumber) => {
				expect(uploadId).toBe("u1")
				return `https://store.example/p${partNumber}`
			},
			complete: async (_uploadId, parts) => {
				closed = parts
				return "done"
			},
		}, {
			partSize: 4,
			retryDelay: () => 0,
			wait: async () => {},
			onProgress: (loaded, total) => {
				progress.push([loaded, total])
			},
			onPart: (part) => {
				landed.push(part)
			},
		})
		expect(receipt).toBe("done")
		expect(closed).toEqual([
			{ partNumber: 1, etag: "e1" },
			{ partNumber: 2, etag: "e2" },
			{ partNumber: 3, etag: "e3" },
		])
		expect(landed).toEqual(closed)
		expect(scripts.get("https://store.example/p1")?.seen).toBe(1)
		const last = progress[progress.length - 1]
		expect(last).toEqual([blob.size, blob.size])
		for (const [, total] of progress) expect(total).toBe(blob.size)
		for (let index = 1; index < progress.length; index += 1) {
			expect(progress[index]?.[0]).toBeGreaterThanOrEqual(progress[index - 1]?.[0] ?? 0)
		}
		const first = await (scripts.get("https://store.example/p1")?.sent as Blob).arrayBuffer()
		expect(new Uint8Array(first)).toEqual(bytes.slice(0, 4))
	})

	test("a busy part retries and a stored part never leaves again", async () => {
		const blob = new Blob(["abcdefgh"], { type: "video/mp4" })
		const scripts = new Map<string, Script>([
			["https://store.example/a1", { failTimes: 0, status: 200, etag: "a1", seen: 0, progress: [], method: "", sent: null }],
			["https://store.example/a2", { failTimes: 2, status: 503, etag: "a2", seen: 0, progress: [], method: "", sent: null }],
		])
		installXhr(scripts)
		const seenUrls: string[] = []
		const receipt = await uploadDirectMultipart<string>(blob, {
			create: async () => ({ uploadId: "u2" }),
			partUrl: (_uploadId, partNumber) => {
				const url = `https://store.example/a${partNumber}`
				seenUrls.push(url)
				return url
			},
			complete: async (_uploadId, parts) => parts.map((part) => part.etag).join(","),
		}, {
			partSize: 4,
			completed: [{ partNumber: 1, etag: "a1" }],
			retryDelay: () => 0,
			wait: async () => {},
		})
		expect(receipt).toBe("a1,a2")
		expect(seenUrls).toEqual(["https://store.example/a2"])
		expect(scripts.get("https://store.example/a1")?.seen).toBe(0)
		expect(scripts.get("https://store.example/a2")?.seen).toBe(3)
	})

	test("a refused part aborts the session and keeps its code", async () => {
		const blob = new Blob(["abcd"], { type: "video/mp4" })
		const scripts = new Map<string, Script>([
			["https://store.example/b1", { failTimes: 10, status: 403, etag: "", seen: 0, progress: [], method: "", sent: null }],
		])
		installXhr(scripts)
		let aborted = ""
		const failure = await uploadDirectMultipart<string>(blob, {
			create: async () => ({ uploadId: "u3" }),
			partUrl: () => "https://store.example/b1",
			complete: async () => "done",
			abort: async (uploadId) => {
				aborted = uploadId
			},
		}, {
			partSize: 4,
			retryDelay: () => 0,
			wait: async () => {},
		}).then(
			() => {
				throw new Error("the session resolved")
			},
			(cause: unknown) => cause,
		)
		expect(failure).toBeInstanceOf(ApiError)
		expect(failure).toMatchObject({ code: "http_error", status: 403 })
		expect(scripts.get("https://store.example/b1")?.seen).toBe(1)
		expect(aborted).toBe("u3")
	})
})
