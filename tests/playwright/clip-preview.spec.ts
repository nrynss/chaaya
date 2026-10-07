import { expect, test, type Page } from "@playwright/test"

/** The gap between the two marker beeps, in seconds. The absolute start
 * latency moves both onsets together, so only this gap reaches the pin. */
const BEEP_GAP = 1
/** The onset gap window in seconds. It covers onset detection jitter only,
 * never host speed: capture and playback share one context clock. */
const GAP_WINDOW = 0.05

async function open(page: Page): Promise<void> {
	await page.goto("/tests/clip-preview")
	await expect(page.getByTestId("run")).toBeEnabled()
}

test("the gap between two marker tones reads one second by sample count", async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === "firefox-sink",
		"the dead sink project runs the playback spec alone and carries no usable capture path"
	)
	await open(page)
	await page.getByTestId("run").click()
	await expect(page.getByTestId("status")).toHaveText("done", { timeout: 30_000 })

	const first = Number(await page.getByTestId("beep-first").textContent())
	const second = Number(await page.getByTestId("beep-second").textContent())
	const expected = Number(await page.getByTestId("beep-gap-expected").textContent())
	const rate = Number(await page.getByTestId("sample-rate").textContent())
	const recorded = Number(await page.getByTestId("recorded-samples").textContent())
	console.log(JSON.stringify({ first, second, expected, rate, recorded, project: testInfo.project.name }))

	// The pin compares sample counts from the captured mix. Both beeps ride
	// one context clock, so their gap reads one exact second whatever the
	// start latency was. The window covers onset detection jitter only, and
	// it reads in samples so host speed never enters it.
	expect(first).toBeGreaterThanOrEqual(0)
	expect(second).toBeGreaterThan(first)
	expect(Math.abs(second - first - expected)).toBeLessThan(Math.round(GAP_WINDOW * rate))
	expect(rate).toBeGreaterThan(0)
	expect(recorded).toBeGreaterThan(second)
	expect(expected).toBe(Math.round(BEEP_GAP * rate))
})

test("a failed load is skipped and reported, never replaced", async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === "firefox-sink",
		"the dead sink project runs the playback spec alone and carries no usable capture path"
	)
	await open(page)
	await page.getByTestId("run").click()
	await expect(page.getByTestId("status")).toHaveText("done", { timeout: 30_000 })

	// The missing clip reports through the callback and lands in the skipped
	// set, while the marker still sounds at its own offset.
	await expect(page.getByTestId("skipped")).toHaveText("missing")
	const reason = await page.getByTestId("skipped-reason").textContent()
	expect(reason?.length ?? 0).toBeGreaterThan(0)
})

test("the docs page passes the accessibility and contrast gates", async ({ page }) => {
	await page.goto("/docs/clip-preview")
	await expect(page.getByTestId("open")).toBeEnabled()
	await page.getByTestId("run-checks").click()
	await expect(page.getByTestId("checks")).toHaveText("pass", { timeout: 15_000 })
})

test("a seek past every clip leaves no live source", async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === "firefox-sink",
		"the dead sink project runs the playback spec alone and carries no usable capture path"
	)
	await open(page)
	await page.getByTestId("run").click()
	await expect(page.getByTestId("status")).toHaveText("done", { timeout: 30_000 })

	await page.getByTestId("seek-past").click()
	await expect
		.poll(async () => Number(await page.getByTestId("live").textContent()), { timeout: 10_000 })
		.toBe(0)
	await page.getByTestId("close").click()
})
