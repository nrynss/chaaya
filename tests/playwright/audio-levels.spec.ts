import { expect, test } from "@playwright/test"

/** The level meter and the peak computation both need a real browser. This
 * spec drives the harness page, reads each number out of the rendered page,
 * and reports the raw values. */
test("the meter reads silence and a full scale tone, and peaks stay responsive", async ({
	page
}) => {
	test.setTimeout(90_000)
	await page.goto("/tests/audio-levels")

	/* The dev server reloads a page once while it settles its module graph, so
	 * start the run again when that reload clears the harness. */
	await expect(async () => {
		if ((await page.getByTestId("phase").textContent()) !== "running") {
			await page.getByTestId("run").click()
		}
		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 12_000 })
	}).toPass({ timeout: 75_000 })

	const read = async (id: string) => Number(await page.getByTestId(id).textContent())

	const silenceRms = await read("silence-rms")
	const silencePeak = await read("silence-peak")
	const toneRms = await read("tone-rms")
	const tonePeak = await read("tone-peak")
	const peaksMs = await read("peaks-ms")
	const maxGap = await read("max-frame-gap")
	const peakMin = await read("peak-min")
	const peakMax = await read("peak-max")
	const loopState = await page.getByTestId("loop-state").textContent()

	console.log(
		JSON.stringify({ silenceRms, silencePeak, toneRms, tonePeak, peaksMs, maxGap, peakMin, peakMax, loopState })
	)

	expect(silenceRms).toBeLessThan(-60)
	expect(silencePeak).toBeLessThan(-60)
	expect(Math.abs(tonePeak)).toBeLessThanOrEqual(1)
	expect(Math.abs(toneRms)).toBeLessThanOrEqual(1)
	/* A worker keeps the main thread free, so the gap holds at one frame while
	 * the compute runs. When the compute lands on the main thread the gap grows
	 * to the compute's own duration. The ratio of the gap to that duration does
	 * not shrink with host speed the way a fixed ceiling does, because both
	 * sides come from the same clock. */
	expect(maxGap).toBeLessThan(peaksMs * 0.5)
	expect(peakMin).toBeCloseTo(-0.9, 3)
	expect(peakMax).toBeCloseTo(0.5, 3)
	expect(loopState).toBe("running->idle")
})
