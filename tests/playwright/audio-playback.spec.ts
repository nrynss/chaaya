import { expect, test, type Page } from "@playwright/test"

const SEEK_SECONDS = 250
/** The byte offset a seek to the target lands on, for one frame per sample. */
const SEEK_BYTE = SEEK_SECONDS * 48000 * 2

/** The wait that lets a settled element speak before the test reads it. 500 ms
 * is about thirty frames at sixty hertz, well past the 100 ms frame budget the
 * assertion allows. */
const SETTLE_MS = 500

/** The start byte of a logged range request, or -1 when it has none. */
function rangeStart(entry: string): number {
	const match = /range=bytes=(\d+)/.exec(entry)
	return match ? Number(match[1]) : -1
}

async function readNumber(page: Page, id: string): Promise<number> {
	return Number(await page.getByTestId(id).textContent())
}

/** Log every range request the page makes for its media. */
function watchRanges(page: Page): string[] {
	const ranges: string[] = []
	page.on("request", (request) => {
		if (!request.url().includes("/tests/audio-playback/media/")) return
		const range = request.headers()["range"]
		if (range) ranges.push(`${request.method()} ${request.url()} range=${range}`)
	})
	return ranges
}

/** Open the harness page once its buttons answer a click. A server rendered
 * button ignores a click until hydration attaches the handler. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/audio-playback")
	await expect(page.getByTestId("play")).toBeEnabled()
}

/** Wait for real frames to pass, then report the worst gap between them. A
 * wall clock wait alone would not show the element had frames to move. */
async function settle(page: Page, ms: number): Promise<number> {
	return page.evaluate(async (duration) => {
		const gaps: number[] = []
		let previous = performance.now()
		const start = previous
		await new Promise<void>((resolve) => {
			const tick = (): void => {
				const now = performance.now()
				gaps.push(now - previous)
				previous = now
				if (now - start >= duration) resolve()
				else requestAnimationFrame(tick)
			}
			requestAnimationFrame(tick)
		})
		return Math.max(...gaps)
	}, ms)
}

test("a seek into unbuffered audio sends a range request and lands on the target", async ({
	page
}) => {
	const ranges = watchRanges(page)
	await open(page)
	await page.getByTestId("load").click()
	await expect.poll(() => readNumber(page, "duration")).toBeGreaterThan(299)

	const beforeSeek = ranges.length
	await page.getByTestId("seek-target").fill(String(SEEK_SECONDS))
	await page.getByTestId("seek").click()

	await expect
		.poll(() =>
			ranges
				.slice(beforeSeek)
				.some((entry) => Math.abs(rangeStart(entry) - SEEK_BYTE) < 2_000_000)
		)
		.toBe(true)

	/** Read after the element has had frames to move, so the value comes from
	 * the element and not the synchronous echo a seek publishes. */
	const worstGap = await settle(page, SETTLE_MS)
	const settled = await readNumber(page, "current-time")
	console.log(
		JSON.stringify({ target: SEEK_SECONDS, settled, settleMs: SETTLE_MS, worstGap, ranges })
	)

	expect(settled).toBeGreaterThan(SEEK_SECONDS - 0.1)
	expect(settled).toBeLessThan(SEEK_SECONDS + 0.1)
})

test("one gesture plays the source", async ({ page }) => {
	await open(page)
	await page.getByTestId("play").click()

	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect(page.getByTestId("refused")).toHaveText("false")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0)
})

test("a missing source is a network failure and unreadable bytes are a decode failure", async ({
	page
}) => {
	await open(page)

	await page.getByTestId("source").fill("/tests/audio-playback/media/missing.wav")
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("network")

	await page.getByTestId("source").fill("/tests/audio-playback/media/broken.wav")
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("decode")
})

test("a refused first gesture does not stop a later gesture", async ({ page }) => {
	await open(page)
	await page.evaluate(() => {
		const proto = HTMLMediaElement.prototype
		const original = proto.play
		let calls = 0
		;(window as unknown as Record<string, unknown>).__playCalls = () => calls
		proto.play = function (this: HTMLMediaElement, ...args: []): Promise<void> {
			calls += 1
			if (calls === 1) return Promise.reject(new DOMException("blocked", "NotAllowedError"))
			return original.apply(this, args)
		}
	})

	await page.getByTestId("play").click()
	await expect(page.getByTestId("refused")).toHaveText("true")
	const afterFirst = await page.evaluate(() =>
		((window as unknown as Record<string, unknown>).__playCalls as () => number)()
	)

	await page.getByTestId("play").click()
	await expect(page.getByTestId("refused")).toHaveText("false")
	const afterSecond = await page.evaluate(() =>
		((window as unknown as Record<string, unknown>).__playCalls as () => number)()
	)

	console.log(JSON.stringify({ afterFirst, afterSecond }))
	expect(afterFirst).toBe(1)
	expect(afterSecond).toBeGreaterThan(afterFirst)
})

test("a blob no decoder reads reports a decode failure", async ({ page }) => {
	await open(page)
	const blob = await page.evaluate(() => {
		const bytes = new Uint8Array(400_000)
		for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 97) % 256
		return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }))
	})

	await page.getByTestId("source").fill(blob)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("decode")
})
