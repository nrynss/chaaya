import { expect, test, type Page } from "@playwright/test"
import { createHash, randomUUID } from "node:crypto"

/** Deterministic bytes the harness uploads. Must match the page. */
function expectedBytes(): Buffer {
	const bytes = Buffer.alloc(512_000)
	for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251
	return bytes
}

function digestOf(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex")
}

async function count(page: Page, testId: string): Promise<number> {
	return Number(await page.getByTestId(testId).textContent())
}

async function text(page: Page, testId: string): Promise<string> {
	return (await page.getByTestId(testId).textContent()) ?? ""
}

/** One run token per test. The server scopes every part under it, so
 * concurrent projects never share a part, a counter, or a forced failure. */
function scopeOf(testName: string, project: string, index: number): string {
	return `${project}-${index}-${testName.replace(/[^a-z0-9]+/gi, "-")}-${randomUUID()}`
}

async function reset(page: Page, scope: string): Promise<void> {
	const response = await page.request.post(`/tests/direct-upload/reset?scope=${encodeURIComponent(scope)}`)
	expect(response.ok()).toBe(true)
}

async function open(page: Page, scope: string): Promise<void> {
	await page.goto(`/tests/direct-upload?run=${encodeURIComponent(scope)}`)
	await expect(page.getByTestId("hydrated")).toHaveText("ready")
}

test.describe("direct upload", () => {
test("a direct multipart upload lands byte exact with a moving bar", async ({ page }, testInfo) => {
	const scope = scopeOf("exact", testInfo.project.name, testInfo.parallelIndex)
	await reset(page, scope)
	await open(page, scope)

	await page.getByTestId("upload").click()
	await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 60_000 })
	expect(await text(page, "failure")).toBe("")

	const loaded = await count(page, "loaded")
	const total = await count(page, "total")
	const samples = await count(page, "samples")
	expect(total).toBe(512_000)
	expect(loaded).toBe(total)
	expect(samples).toBeGreaterThanOrEqual(4)
	expect(await text(page, "monotonic")).toBe("yes")
	expect(await count(page, "parts")).toBe(4)

	const wanted = expectedBytes()
	const log = await page.request.get(`/tests/direct-upload/log?scope=${encodeURIComponent(scope)}`)
	expect(log.ok()).toBe(true)
	const logBody = (await log.json()) as { writes: Record<string, number>; attempts: Record<string, number>; received: number[] }
	expect(logBody.received).toEqual([1, 2, 3, 4])
	expect(Object.values(logBody.writes).every((writes) => writes === 1)).toBe(true)
	expect(Object.values(logBody.attempts).every((attempts) => attempts === 1)).toBe(true)

	const bytes = await page.request.get(`/tests/direct-upload/bytes?scope=${encodeURIComponent(scope)}`)
	expect(bytes.ok()).toBe(true)
	const body = (await bytes.json()) as { size: number; sha256: string; base64: string; received: number[] }
	expect(body.size).toBe(wanted.length)
	expect(body.sha256).toBe(digestOf(wanted))
	expect(Buffer.from(body.base64, "base64").equals(wanted)).toBe(true)
	expect(await text(page, "receipt")).toBe(body.sha256)
	expect(await text(page, "assembled")).toBe(body.sha256)

	const partLengths: number[] = []
	for (const partNumber of [1, 2, 3, 4]) {
		const part = await page.request.get(`/tests/direct-upload/parts/${encodeURIComponent(scope)}/${partNumber}`)
		expect(part.ok()).toBe(true)
		partLengths.push(((await part.json()) as { size: number }).size)
	}
	expect(partLengths).toEqual([128_000, 128_000, 128_000, 128_000])
})

test("an interrupted multipart session resumes without resending stored parts", async ({ page }, testInfo) => {
	const scope = scopeOf("resume", testInfo.project.name, testInfo.parallelIndex)
	await reset(page, scope)
	await open(page, scope)

	await page.getByTestId("partial").click()
	await expect(page.getByTestId("phase")).toHaveText("partial", { timeout: 60_000 })
	expect(await count(page, "parts")).toBe(2)

	const before = (await (await page.request.get(`/tests/direct-upload/log?scope=${encodeURIComponent(scope)}`)).json()) as {
		writes: Record<string, number>
		attempts: Record<string, number>
		received: number[]
	}
	expect(before.received).toEqual([1, 2])
	expect(before.writes).toEqual({ "1": 1, "2": 1 })

	await page.getByTestId("resume").click()
	await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 60_000 })
	expect(await text(page, "failure")).toBe("")
	expect(await count(page, "parts")).toBe(4)

	const after = (await (await page.request.get(`/tests/direct-upload/log?scope=${encodeURIComponent(scope)}`)).json()) as {
		writes: Record<string, number>
		attempts: Record<string, number>
		received: number[]
	}
	expect(after.received).toEqual([1, 2, 3, 4])
	expect(after.writes["1"]).toBe(1)
	expect(after.writes["2"]).toBe(1)
	expect(after.writes["3"]).toBe(1)
	expect(after.writes["4"]).toBe(1)
	expect(after.attempts["1"]).toBe(1)
	expect(after.attempts["2"]).toBe(1)

	const wanted = expectedBytes()
	const bytes = await page.request.get(`/tests/direct-upload/bytes?scope=${encodeURIComponent(scope)}`)
	const body = (await bytes.json()) as { size: number; sha256: string; base64: string }
	expect(body.size).toBe(wanted.length)
	expect(body.sha256).toBe(digestOf(wanted))
	expect(Buffer.from(body.base64, "base64").equals(wanted)).toBe(true)
	expect(await text(page, "receipt")).toBe(body.sha256)
})

test("a busy part retries and still lands whole", async ({ page }, testInfo) => {
	const scope = scopeOf("retry", testInfo.project.name, testInfo.parallelIndex)
	await reset(page, scope)
	const control = await page.request.post(`/tests/direct-upload/control?scope=${encodeURIComponent(scope)}`, {
		data: { index: 3, times: 2 },
	})
	expect(control.ok()).toBe(true)

	await open(page, scope)
	await page.getByTestId("upload").click()
	await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 60_000 })
	expect(await text(page, "failure")).toBe("")

	const log = (await (await page.request.get(`/tests/direct-upload/log?scope=${encodeURIComponent(scope)}`)).json()) as {
		writes: Record<string, number>
		attempts: Record<string, number>
		received: number[]
	}
	expect(log.received).toEqual([1, 2, 3, 4])
	expect(log.attempts["3"]).toBe(3)
	expect(log.writes["3"]).toBe(1)
	expect(log.writes["1"]).toBe(1)

	const wanted = expectedBytes()
	const bytes = await page.request.get(`/tests/direct-upload/bytes?scope=${encodeURIComponent(scope)}`)
	const body = (await bytes.json()) as { size: number; sha256: string; base64: string }
	expect(body.sha256).toBe(digestOf(wanted))
	expect(Buffer.from(body.base64, "base64").equals(wanted)).toBe(true)
})
})
