import { afterEach, describe, expect, test, vi } from "vitest"
import { ApiError, type ApiErrorParser } from "./api"
import { UploadSizeUnknown, UploadTooLarge, uploadBlob, uploadBlobWithProgress } from "./upload-blob"

afterEach(() => {
	vi.unstubAllGlobals()
})

function captured(init: RequestInit | undefined): RequestInit {
	if (init === undefined) throw new Error("fetch was called without init")
	return init
}

describe("one-shot upload", () => {
	test("a short sample is one multipart POST with the caller's headers", async () => {
		const seen: RequestInit[] = []
		const progress: number[] = []
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				seen.push(captured(init))
				return new Response('{"id":"v1"}', { status: 200 })
			}),
		)
		const blob = new Blob(["hello"], { type: "audio/webm" })
		const saved = await uploadBlob<{ id: string }>("/sample", blob, {
			field: "sample",
			filename: "sample.webm",
			fields: { note: "adult" },
			headers: { Authorization: "Bearer token" },
			maxBytes: 1024,
			onProgress: (loaded) => {
				progress.push(loaded)
			},
		})
		expect(saved).toEqual({ id: "v1" })
		const init = captured(seen[0])
		expect(init.method).toBe("POST")
		expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token")
		expect(new Headers(init.headers).has("content-type")).toBe(false)
		expect(init.body).toBeInstanceOf(FormData)
		const form = init.body as FormData
		expect(form.get("note")).toBe("adult")
		const sample = form.get("sample")
		expect(sample).toBeInstanceOf(File)
		expect((sample as File).name).toBe("sample.webm")
		expect(await (sample as File).text()).toBe("hello")
		expect(progress).toEqual([blob.size])
	})

	test("a raw blob keeps its content type and a FormData body is sent as given", async () => {
		const seen: RequestInit[] = []
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				seen.push(captured(init))
				return new Response('{"ok":true}', { status: 200 })
			}),
		)
		const blob = new Blob(["raw"], { type: "audio/wav" })
		await uploadBlob("/blob", blob, { formData: false })
		expect(captured(seen[0]).body).toBe(blob)
		expect(new Headers(captured(seen[0]).headers).get("content-type")).toBe("audio/wav")
		const form = new FormData()
		form.append("note", "yes")
		await uploadBlob("/blob", form)
		expect(captured(seen[1]).body).toBe(form)
	})

	test("a blob past the limit never leaves the caller", async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const blob = new Blob(["too-big"])
		await expect(uploadBlob("/blob", blob, { maxBytes: 3 })).rejects.toBeInstanceOf(UploadTooLarge)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	test("maxBytes on FormData refuses before the request instead of skipping the limit", async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		const form = new FormData()
		form.append("note", "yes")
		await expect(uploadBlob("/blob", form, { maxBytes: 10 })).rejects.toThrow(
			"set maxBytes only for Blob bodies, or pass an explicit size.",
		)
		await expect(uploadBlobWithProgress("/blob", form, { maxBytes: 10 })).rejects.toBeInstanceOf(UploadSizeUnknown)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	test("an explicit size lets maxBytes apply to FormData on both entry points", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
		vi.stubGlobal("fetch", fetchMock)
		let opened = 0
		class FakeXHR {
			upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
			status = 200
			statusText = "OK"
			responseText = "{}"
			timeout = 0
			withCredentials = false
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			ontimeout: (() => void) | null = null
			open() {
				opened += 1
			}
			setRequestHeader() {}
			getResponseHeader() {
				return null
			}
			send() {
				this.onload?.()
			}
			abort() {
				this.onabort?.()
			}
		}
		vi.stubGlobal("XMLHttpRequest", FakeXHR)
		const form = new FormData()
		form.append("note", "yes")
		await uploadBlob("/blob", form, { maxBytes: 10, size: 4 })
		expect(fetchMock).toHaveBeenCalledTimes(1)
		await expect(uploadBlob("/blob", form, { maxBytes: 3, size: 4 })).rejects.toBeInstanceOf(UploadTooLarge)
		expect(fetchMock).toHaveBeenCalledTimes(1)
		await uploadBlobWithProgress("/blob", form, { maxBytes: 10, size: 4 })
		expect(opened).toBe(1)
		await expect(uploadBlobWithProgress("/blob", form, { maxBytes: 3, size: 4 })).rejects.toBeInstanceOf(UploadTooLarge)
		expect(opened).toBe(1)
		expect(fetchMock).toHaveBeenCalledTimes(1)
	})

	test("uploadBlob stays on fetch when XMLHttpRequest exists and passes credentials through", async () => {
		let opened = 0
		class FakeXHR {
			constructor() {
				opened += 1
			}
		}
		vi.stubGlobal("XMLHttpRequest", FakeXHR)
		const seen: RequestInit[] = []
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init?: RequestInit) => {
				seen.push(captured(init))
				return new Response("{}", { status: 200 })
			}),
		)
		const progress: number[] = []
		await uploadBlob("/blob", new Blob(["hello"]), {
			credentials: "include",
			onProgress: (loaded) => {
				progress.push(loaded)
			},
		})
		expect(opened).toBe(0)
		expect(captured(seen[0]).credentials).toBe("include")
		expect(progress).toEqual([5])
	})

	test("a refused upload stays http_error unless the caller passes a parser", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response('{"error":{"code":"forbidden","message":"no"}}', { status: 403 })),
		)
		const plain = await uploadBlob("/sample", new Blob(["x"])).then(
			() => {
				throw new Error("the upload resolved")
			},
			(cause: unknown) => cause,
		)
		expect(plain).toBeInstanceOf(ApiError)
		expect(plain).toMatchObject({ code: "http_error", status: 403 })
		const parser: ApiErrorParser = (text) => {
			const body = JSON.parse(text) as { error?: { code?: string; message?: string } }
			if (typeof body.error?.code !== "string" || typeof body.error.message !== "string") return undefined
			return { code: body.error.code, message: body.error.message }
		}
		const parsed = await uploadBlob("/sample", new Blob(["x"]), { parseError: parser }).then(
			() => {
				throw new Error("the upload resolved")
			},
			(cause: unknown) => cause,
		)
		expect(parsed).toMatchObject({ code: "forbidden", status: 403 })
	})

	test("a browser reports upload progress and a presigned PUT sends the raw body", async () => {
		const progress: Array<[number, number]> = []
		let method = ""
		let sent: unknown
		let withCredentials = true
		const headers: Record<string, string> = {}
		class FakeXHR {
			upload = {
				onprogress: null as ((event: ProgressEvent) => void) | null,
			}
			status = 200
			statusText = "OK"
			responseText = '{"stored":true}'
			timeout = 0
			withCredentials = false
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			ontimeout: (() => void) | null = null
			open(next: string) {
				method = next
			}
			setRequestHeader(key: string, value: string) {
				headers[key.toLowerCase()] = value
			}
			getResponseHeader() {
				return null
			}
			send(body: unknown) {
				sent = body
				withCredentials = this.withCredentials
				this.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 } as ProgressEvent)
				this.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 4 } as ProgressEvent)
				this.onload?.()
			}
			abort() {
				this.onabort?.()
			}
		}
		vi.stubGlobal("XMLHttpRequest", FakeXHR)
		const blob = new Blob(["wave"], { type: "audio/wav" })
		const saved = await uploadBlobWithProgress<{ stored: boolean }>("https://store.example/signed", blob, {
			method: "PUT",
			formData: false,
			credentials: "omit",
			onProgress: (loaded, total) => {
				progress.push([loaded, total])
			},
		})
		expect(saved).toEqual({ stored: true })
		expect(method).toBe("PUT")
		expect(sent).toBe(blob)
		expect(withCredentials).toBe(false)
		expect(headers.authorization).toBeUndefined()
		await uploadBlobWithProgress("https://app.example/file", blob, {
			credentials: "include",
			formData: false,
		})
		expect(withCredentials).toBe(true)
		expect(headers["content-type"]).toBe("audio/wav")
		expect(progress).toEqual([
			[2, 4],
			[4, 4],
		])
	})

	test("uploadBlobWithProgress rejects when the host has no XMLHttpRequest", async () => {
		vi.stubGlobal("XMLHttpRequest", undefined)
		await expect(uploadBlobWithProgress("/blob", new Blob(["x"]))).rejects.toThrow(/XMLHttpRequest/)
	})

	test("timeoutMs of zero is refused before either transport sends", async () => {
		const fetchMock = vi.fn()
		vi.stubGlobal("fetch", fetchMock)
		let opened = 0
		class FakeXHR {
			open() {
				opened += 1
			}
		}
		vi.stubGlobal("XMLHttpRequest", FakeXHR)
		const blob = new Blob(["x"])
		await expect(uploadBlob("/blob", blob, { timeoutMs: 0 })).rejects.toThrow(/positive number/)
		await expect(uploadBlobWithProgress("/blob", blob, { timeoutMs: 0 })).rejects.toThrow(/positive number/)
		expect(fetchMock).not.toHaveBeenCalled()
		expect(opened).toBe(0)
	})

	test("a refused XHR gives parseError the headers the response carried", async () => {
		class FakeXHR {
			upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
			status = 429
			statusText = "Too Many Requests"
			responseText = "{}"
			timeout = 0
			withCredentials = false
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			ontimeout: (() => void) | null = null
			open() {}
			setRequestHeader() {}
			getAllResponseHeaders() {
				return "retry-after: 7\r\nx-request-id: req-1\r\n"
			}
			send() {
				this.onload?.()
			}
			abort() {
				this.onabort?.()
			}
		}
		vi.stubGlobal("XMLHttpRequest", FakeXHR)
		const seen: Array<string | null> = []
		const parser: ApiErrorParser = (_text, response) => {
			seen.push(response.headers.get("retry-after"))
			seen.push(response.headers.get("x-request-id"))
			return undefined
		}
		const error = await uploadBlobWithProgress("/blob", new Blob(["x"]), { parseError: parser }).then(
			() => {
				throw new Error("the upload resolved")
			},
			(cause: unknown) => cause,
		)
		expect(seen).toEqual(["7", "req-1"])
		expect(error).toBeInstanceOf(ApiError)
		expect(error).toMatchObject({ code: "http_error", status: 429, retryAfterSeconds: 7 })
	})

	test("an aborted XHR rejects with the signal reason and does not send a pre-aborted body", async () => {
		let sent = 0
		class FakeXHR {
			upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
			status = 200
			statusText = "OK"
			responseText = "{}"
			timeout = 0
			withCredentials = false
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			ontimeout: (() => void) | null = null
			open() {}
			setRequestHeader() {}
			getAllResponseHeaders() {
				return ""
			}
			send() {
				sent += 1
			}
			abort() {
				this.onabort?.()
			}
		}
		vi.stubGlobal("XMLHttpRequest", FakeXHR)
		const reason = new Error("stopped")
		await expect(
			uploadBlobWithProgress("/blob", new Blob(["x"]), { signal: AbortSignal.abort(reason) }),
		).rejects.toBe(reason)
		expect(sent).toBe(0)
		let markSent: () => void = () => {}
		const started = new Promise<void>((resolve) => {
			markSent = resolve
		})
		FakeXHR.prototype.send = function send() {
			sent += 1
			markSent()
		}
		const controller = new AbortController()
		const pending = uploadBlobWithProgress("/blob", new Blob(["x"]), { signal: controller.signal })
		await started
		controller.abort(new Error("later"))
		await expect(pending).rejects.toMatchObject({ message: "later" })
		expect(sent).toBe(1)
	})

	test("an XHR timeout and a network error reject before a body is parsed", async () => {
		class FakeXHR {
			upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
			status = 200
			statusText = "OK"
			responseText = '{"ok":true}'
			timeout = 0
			withCredentials = false
			onload: (() => void) | null = null
			onerror: (() => void) | null = null
			onabort: (() => void) | null = null
			ontimeout: (() => void) | null = null
			mode: "timeout" | "error" = "timeout"
			open() {}
			setRequestHeader() {}
			getAllResponseHeaders() {
				return ""
			}
			send() {
				if (this.mode === "timeout") this.ontimeout?.()
				else this.onerror?.()
			}
			abort() {
				this.onabort?.()
			}
		}
		const xhr = new FakeXHR()
		vi.stubGlobal(
			"XMLHttpRequest",
			class extends FakeXHR {
				constructor() {
					super()
					return xhr
				}
			},
		)
		const timedOut = await uploadBlobWithProgress("/blob", new Blob(["x"]), { timeoutMs: 5 }).then(
			() => {
				throw new Error("the upload resolved")
			},
			(cause: unknown) => cause,
		)
		expect(timedOut).toMatchObject({ code: "timeout", status: 0 })
		xhr.mode = "error"
		const offline = await uploadBlobWithProgress("/blob", new Blob(["x"])).then(
			() => {
				throw new Error("the upload resolved")
			},
			(cause: unknown) => cause,
		)
		expect(offline).toMatchObject({ code: "network", status: 0 })
	})
})
