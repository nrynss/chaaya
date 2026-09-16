import { expect, test } from "@playwright/test"

/* WebKit on Linux runs playback only. Its headless build opens no capture
 * graph, so the meter reads nothing there. The support module's coverage
 * table records this skip, and the reason travels with it. */
test.skip(({ browserName }) => browserName === "webkit", "WebKit on Linux runs playback only.")

/** The level meter and the peak computation both need a real browser. This
 * spec drives the harness page, reads each number out of the rendered page,
 * and reports the raw values. The page builds its own source, so the signal
 * needs no capture device, but the browser still opens an AudioContext, and
 * the meter only advances where a sound server exists to pull the graph. */
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
	/* A full scale sine drives the meter to its ceiling, so the peak reads zero
	 * and holds there on a single frame of signal. A gap inside a window lowers
	 * the rms alone, so the rms check is the loose floor that silence fails.
	 * The worst window measured read minus 9.1 in a gapped container and minus
	 * 6.0 on the CI runner. The floor at minus 12 sits under every reading and
	 * 88 dB above the minus 100 a silent meter reads. The unit cases pin the
	 * exact scaling of both meters. */
	expect(tonePeak).toBeCloseTo(0, 1)
	expect(toneRms).toBeGreaterThan(-12)
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
