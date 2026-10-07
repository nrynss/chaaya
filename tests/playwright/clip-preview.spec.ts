import { expect, test, type Page } from "@playwright/test"

/** The beep onset in clip seconds, from the clip offset plus the beep point. */
const BEEP_AT = 1.5
/** The onset window in seconds. Decode lag and recorder startup move the
 * onset inside it, and the comparison still reads sample counts. */
const WINDOW = 0.6

async function open(page: Page): Promise<void> {
	await page.goto("/tests/clip-preview")
	await expect(page.getByTestId("run")).toBeEnabled()
}

test("a marker tone lands at its offset by sample count", async ({ page }, testInfo) => {
	test.skip(
		testInfo.project.name === "firefox-sink",
		"the dead sink project runs the playback spec alone and carries no usable capture path"
	)
	await open(page)
	await page.getByTestId("run").click()
	await expect(page.getByTestId("status")).toHaveText("done", { timeout: 30_000 })

	const beep = Number(await page.getByTestId("beep-sample").textContent())
	const expected = Number(await page.getByTestId("beep-expected").textContent())
	const rate = Number(await page.getByTestId("sample-rate").textContent())
	const recorded = Number(await page.getByTestId("recorded-samples").textContent())
	console.log(JSON.stringify({ beep, expected, rate, recorded, project: testInfo.project.name }))

	// The pin compares sample counts from the decoded capture. The beep
	// onset must sit inside a window around its expected offset sample, and
	// the window itself reads in samples so host speed never enters it.
	expect(beep).toBeGreaterThanOrEqual(0)
	expect(Math.abs(beep - expected)).toBeLessThan(Math.round(WINDOW * rate))
	expect(rate).toBeGreaterThan(0)
	expect(recorded).toBeGreaterThan(expected)
	expect(expected).toBe(Math.round(BEEP_AT * rate))
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
