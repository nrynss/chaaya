import { expect, test, type Page } from "@playwright/test"

const SEEK_SECONDS = 250
/** The byte offset a seek to the target lands on, for one frame per sample. */
const SEEK_BYTE = SEEK_SECONDS * 48000 * 2

/** The wait that lets a settled element speak before the test reads it. 500 ms
 * is about thirty frames at sixty hertz, well past the 100 ms frame budget the
 * assertion allows. */
const SETTLE_MS = 500
/** The wait that gives a sink error time to land. The defect fires about ten
 * milliseconds in, and two seconds leaves it no room to hide. */
const SINK_SETTLE_MS = 2_000

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
	await expect(page.getByTestId("refusal-name")).toHaveText("")
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
	await expect(page.getByTestId("refusal-name")).toHaveText("NotAllowedError")
	await expect(page.getByTestId("refusal-message")).toHaveText("blocked")
	const afterFirst = await page.evaluate(() =>
		((window as unknown as Record<string, unknown>).__playCalls as () => number)()
	)

	await page.getByTestId("play").click()
	await expect(page.getByTestId("refused")).toHaveText("false")
	await expect(page.getByTestId("refusal-name")).toHaveText("")
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

/** Only the firefox sink project drives a browser whose sink dies, so the
 * error class differs there and stays null on the other engines. */
test("a sink error mid play is an output failure and the element plays on", async ({
	page
}, testInfo) => {
	const sinkLeg = testInfo.project.name === "firefox-sink"
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("refused")).toHaveText("false")

	const worstGap = await settle(page, SINK_SETTLE_MS)
	console.log(JSON.stringify({ project: testInfo.project.name, worstGap }))

	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0)
	if (sinkLeg) {
		await expect(page.getByTestId("failure")).toHaveText("output")
		await expect(page.getByTestId("message")).toContainText("OnMediaSinkAudioError")
	} else {
		await expect(page.getByTestId("failure")).toHaveText("none")
	}
})

/** Only the firefox sink project raises an element error when a transfer
 * dies under its own declared length. Chromium measures the same shape by
 * re-requesting the body instead of failing it, so there is no error to
 * classify there. */
test("a connection that dies mid play is a network failure and stops the player", async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== "firefox-sink",
		"chromium re-requests a truncated transfer instead of raising an element error, so the failure class only exists on firefox"
	)
	await open(page)
	// The repeat and attempt numbers ride in the query, so the route serves
	// the dying transfer fresh to every attempt of every repeat and the
	// shape lands mid play each time.
	await page
		.getByTestId("source")
		.fill(
			`/tests/audio-playback/media/trunc.wav?repeat=${testInfo.repeatEachIndex}&attempt=${testInfo.retry}`
		)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("network", { timeout: 15_000 })
	await expect(page.getByTestId("playing")).toHaveText("false")
})

/** The corrupt MP4 decodes until the flipped bytes reach the decoder, so the
 * error lands mid play with the element unpaused. Its words name the
 * decoder, never the sink, so the source classify path runs and playing
 * clears. Only chromium raises that error: under the dead sink the sink
 * error latches first and the element never reports the later decode
 * failure, and webkit never reports a decode failure for these bytes at
 * all. */
test("bytes that fail mid play are a decode failure and stop the player", async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name !== "chromium",
		"only chromium raises the mid play decode failure: the dead sink latches its own error first and webkit never reports one"
	)
	await open(page)
	await page.getByTestId("source").fill("/tests/audio-playback/media/bad.mp4")
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("decode", { timeout: 20_000 })
	await expect(page.getByTestId("playing")).toHaveText("false")
})

/** An element that has stopped never takes the output branch, whatever its
 * error says. The stub latches a sink named error onto a paused element,
 * the shape a browser reports when it gave up on playback before the error
 * surfaced. */
test("an error on a stopped element never takes the output branch", async ({
	page
}, testInfo) => {
	test.skip(
		testInfo.project.name === "firefox-sink",
		"the live sink error latches before the stub can fire, so the stub only reads cleanly where the sink lives"
	)
	await page.addInitScript(() => {
		const native = window.Audio
		const wrapped = function (...args: ConstructorParameters<typeof Audio>) {
			const element = new native(...args)
			;(window as unknown as Record<string, unknown>).__stoppedElement = element
			return element
		}
		wrapped.prototype = native.prototype
		window.Audio = wrapped as unknown as typeof Audio
	})
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0)

	await page.evaluate(() => {
		const element = (window as unknown as Record<string, unknown>).__stoppedElement as
			| HTMLMediaElement
			| undefined
		if (!element) throw new Error("no element")
		Object.defineProperty(element, "paused", { configurable: true, get: () => true })
		Object.defineProperty(element, "error", {
			configurable: true,
			get: () => ({ code: 3, message: "OnMediaSinkAudioError" })
		})
		element.dispatchEvent(new Event("error"))
	})

	await expect(page.getByTestId("failure")).toHaveText("decode")
	await expect(page.getByTestId("playing")).toHaveText("false")
})
