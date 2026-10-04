import { expect, test, type Page } from "@playwright/test"

/** The seek target sits far from the head of the clip. */
const SEEK_SECONDS = 250
/** The wait that lets a settled element speak before the test reads it. */
const SETTLE_MS = 500

async function readNumber(page: Page, id: string): Promise<number> {
	return Number(await page.getByTestId(id).textContent())
}

/** Open the harness page once its buttons answer a click. A button without
 * its player ignores a click, so the test waits for it to enable. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/video-playback")
	await expect(page.getByTestId("play")).toBeEnabled()
}

/** Wait for real frames to pass, then report the worst gap between them. */
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

test("one gesture plays the caller's video element", async ({ page }) => {
	await open(page)
	await page.getByTestId("play").click()

	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect(page.getByTestId("refused")).toHaveText("false")
	await expect(page.getByTestId("refusal-name")).toHaveText("")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0)
	/** The element's own clock moves with the player's only when the player
	 * adopted that element, so this read is the adoption pin. */
	await expect.poll(() => readNumber(page, "video-time")).toBeGreaterThan(0)
})

test("a pause stops the caller's video element", async ({ page }) => {
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")

	await page.getByTestId("pause").click()
	await expect(page.getByTestId("playing")).toHaveText("false")
	await expect(page.getByTestId("video-paused")).toHaveText("true")
})

test("a seek lands on the target on the player's clock and the element's", async ({
	page
}, testInfo) => {
	await open(page)
	await page.getByTestId("load").click()
	await page.getByTestId("play").click()
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0.5)
	await page.getByTestId("pause").click()
	await expect(page.getByTestId("playing")).toHaveText("false")

	await page.getByTestId("seek-target").fill(String(SEEK_SECONDS))
	await page.getByTestId("seek").click()

	await expect
		.poll(() => readNumber(page, "current-time"), { timeout: 15_000 })
		.toBeGreaterThan(SEEK_SECONDS - 1.5)

	const worstGap = await settle(page, SETTLE_MS)
	const settled = await readNumber(page, "current-time")
	const elementTime = await readNumber(page, "video-time")
	console.log(
		JSON.stringify({ project: testInfo.project.name, target: SEEK_SECONDS, settled, elementTime, worstGap })
	)

	expect(settled).toBeLessThan(SEEK_SECONDS + 1.5)
	expect(elementTime).toBeGreaterThan(SEEK_SECONDS - 1.5)
	expect(elementTime).toBeLessThan(SEEK_SECONDS + 1.5)
})

test("a missing source is a network failure and unreadable bytes are a decode failure", async ({
	page
}) => {
	await open(page)

	await page.getByTestId("source").fill("/tests/video-playback/media/missing.webm")
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("network")

	await page.getByTestId("source").fill("/tests/video-playback/media/broken.webm")
	await page.getByTestId("play").click()
	await expect(page.getByTestId("failure")).toHaveText("decode")
})

test("loading a new source resets the published state", async ({ page }) => {
	await open(page)
	await page.getByTestId("play").click()
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0.5)
	await page.getByTestId("pause").click()
	await expect(page.getByTestId("playing")).toHaveText("false")

	await page.getByTestId("load").click()
	await expect.poll(() => readNumber(page, "current-time")).toBe(0)
	await expect(page.getByTestId("failure")).toHaveText("none")
	await expect(page.getByTestId("playing")).toHaveText("false")
})

test("the first gesture preserves the element's mute state in both directions", async ({
	page
}) => {
	/** A muted adopted element comes out of the prime as it went in. The
	 * prime mutes for its silent clip and must not force an unmute past
	 * what the element carried. */
	await open(page)
	await page.evaluate(() => {
		const video = document.querySelector("video")
		if (!video) throw new Error("no video element")
		video.muted = true
	})
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0.5)
	await page.waitForTimeout(500)
	const mutedAfter = await page.evaluate(() => {
		const video = document.querySelector("video")
		return video ? video.muted : null
	})
	expect(mutedAfter).toBe(true)

	/** The reverse direction pins the restore against an overcorrection.
	 * The reload builds a fresh player, so the prime runs again on an
	 * element nobody muted. */
	await page.reload()
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(0.5)
	await page.waitForTimeout(500)
	const unmutedAfter = await page.evaluate(() => {
		const video = document.querySelector("video")
		return video ? video.muted : null
	})
	expect(unmutedAfter).toBe(false)
})
