import { expect, test, type Page } from "@playwright/test"
import { writeFileSync } from "node:fs"
import { readMarkers, type GeneratedTake, type MarkerReading } from "./support/audio"

/** The marker interval the generated signal uses, in seconds. A take that
 * drops one marker therefore reads one gap of two intervals. */
const MARKER_INTERVAL_SECONDS = 0.1

/** The marker a gap take leaves out. The index sits well inside the recorded
 * window, so the take's tail cannot change the count. */
const OMITTED_MARKER_INDEX = 5

/** How far a marker may drift from its declared slot. The reader averages over
 * five millisecond windows, so a slot boundary can land on either side. */
const MARKER_TOLERANCE_SECONDS = 0.02

/** One saved take beside what the Node marker reader made of it. */
interface Recorded {
	readonly take: GeneratedTake
	readonly reading: MarkerReading
}

async function open(page: Page): Promise<void> {
	await page.goto("/tests/audio-support")
	await expect(page.getByTestId("record")).toBeEnabled()
}

/** Clicks a record button, waits for the take, and saves it for the reader. The
 * dev server reloads a page once while it settles its module graph, so a
 * cleared harness starts the run again. */
async function recordTake(page: Page, button: string, file: string): Promise<Recorded> {
	await expect(async () => {
		if ((await page.getByTestId("phase").textContent()) !== "done") {
			await page.getByTestId(button).click()
		}
		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 20_000 })
	}).toPass({ timeout: 60_000 })
	const failure = await page.getByTestId("failure").textContent()
	expect(failure).toBe("")
	const take = await page.evaluate(
		() => (window as Window & { __take?: GeneratedTake }).__take as GeneratedTake
	)
	writeFileSync(file, Buffer.from(take.base64, "base64"))
	return { take, reading: readMarkers(file) }
}

test("a generated take carries its markers in order and at the fixed spacing", async ({
	page,
	browserName
}, testInfo) => {
	// WebKitGTK's headless build defines no MediaRecorder, so the take
	// records nothing there and the case would fail for an engine reason,
	// not a support defect. The stream-shape case runs on WebKit.
	test.skip(browserName === "webkit", "WebKitGTK headless defines no MediaRecorder, so a generated take records nothing there.")
	test.setTimeout(90_000)
	await page.addInitScript(() => {
		const nativeStart = MediaRecorder.prototype.start
		MediaRecorder.prototype.start = function (timeslice?: number) {
			setTimeout(() => nativeStart.call(this, timeslice), 300)
		}
	})
	await open(page)
	const { take, reading } = await recordTake(page, "record", testInfo.outputPath("take.webm"))

	console.log(
		JSON.stringify({
			mimeType: take.mimeType,
			sampleRate: take.sampleRate,
			elapsedSeconds: take.elapsedSeconds,
			expectedMarkers: take.expectedMarkers,
			reading
		})
	)

	expect(take.mimeType).toContain("audio/")
	expect(reading.sampleRate).toBe(take.sampleRate)
	expect(reading.count).toBe(take.expectedMarkers)
	expect(reading.order).toBe("ascending")
	expect(reading.spacingsSeconds).toHaveLength(reading.count - 1)
	for (const spacing of reading.spacingsSeconds) {
		expect(Math.abs(spacing - MARKER_INTERVAL_SECONDS)).toBeLessThanOrEqual(
			MARKER_TOLERANCE_SECONDS
		)
	}
})

test("a take that drops one marker reads as a gap where the marker stood", async ({
	page,
	browserName
}, testInfo) => {
	// WebKitGTK's headless build defines no MediaRecorder, so the take
	// records nothing there and the case would fail for an engine reason,
	// not a support defect. The stream-shape case runs on WebKit.
	test.skip(browserName === "webkit", "WebKitGTK headless defines no MediaRecorder, so a generated take records nothing there.")
	test.setTimeout(90_000)
	await open(page)
	const full = await recordTake(page, "record", testInfo.outputPath("full.webm"))
	await open(page)
	const gap = await recordTake(page, "record-gap", testInfo.outputPath("gap.webm"))

	console.log(JSON.stringify({ full: full.reading, gap: gap.reading }))

	expect(full.reading.order).toBe("ascending")
	expect(gap.reading.order).toBe("ascending")
	expect(full.reading.count).toBe(full.take.expectedMarkers)
	expect(gap.reading.count).toBe(gap.take.expectedMarkers)
	expect(gap.reading.count).toBe(full.reading.count - 1)

	const wideIndex = gap.reading.spacingsSeconds.findIndex(
		(spacing) => Math.abs(spacing - 2 * MARKER_INTERVAL_SECONDS) <= MARKER_TOLERANCE_SECONDS
	)
	expect(wideIndex).toBe(OMITTED_MARKER_INDEX - 1)
	const narrow = gap.reading.spacingsSeconds.filter(
		(spacing) => Math.abs(spacing - MARKER_INTERVAL_SECONDS) <= MARKER_TOLERANCE_SECONDS
	)
	expect(narrow).toHaveLength(gap.reading.spacingsSeconds.length - 1)
	/* Compare the marker after the gap with that marker in the full take. The
	 * container adds a fixed pre-roll before the first decoded marker. */
	expect(
		Math.abs(
			gap.reading.onsetsSeconds[wideIndex + 1] -
				full.reading.onsetsSeconds[OMITTED_MARKER_INDEX + 1]
		)
	).toBeLessThanOrEqual(MARKER_TOLERANCE_SECONDS)
})

test("captured samples match the page clock within one recorder block", async ({
	page,
	browserName
}, testInfo) => {
	// WebKitGTK's headless build defines no MediaRecorder, so the take
	// records nothing there and the case would fail for an engine reason,
	// not a support defect. The stream-shape case runs on WebKit.
	test.skip(browserName === "webkit", "WebKitGTK headless defines no MediaRecorder, so a generated take records nothing there.")
	test.setTimeout(90_000)
	await open(page)
	const { take, reading } = await recordTake(page, "record", testInfo.outputPath("clock.webm"))

	console.log(
		JSON.stringify({
			elapsedSeconds: take.elapsedSeconds,
			blockSeconds: take.blockSeconds,
			durationSeconds: reading.durationSeconds,
			frames: reading.frames
		})
	)

	/* Both sides come from the page's own audio clock. The take length comes
	 * from its decoded samples, and the reference comes from the context that
	 * rendered them. One recorder block bounds the difference. */
	expect(reading.sampleRate).toBe(take.sampleRate)
	expect(reading.durationSeconds).toBeGreaterThan(0)
	expect(Math.abs(reading.durationSeconds - take.elapsedSeconds)).toBeLessThanOrEqual(
		take.blockSeconds
	)
})

test("the generated stream and the microphone patch both carry one audio track", async ({
	page
}) => {
	test.setTimeout(90_000)
	await open(page)

	await page.getByTestId("stream").click()
	await expect(page.getByTestId("stream-state")).toHaveText("active")
	const streamTracks = await page.getByTestId("stream-tracks").textContent()

	await page.getByTestId("microphone").click()
	await expect(page.getByTestId("microphone-state")).toHaveText("active")
	const microphoneTracks = await page.getByTestId("microphone-tracks").textContent()

	console.log(JSON.stringify({ streamTracks, microphoneTracks }))

	/* The page builds the stream itself, so a recorder can consume it in place
	 * of a device. Both paths must hand back a live audio track. */
	expect(streamTracks).toBe("1")
	expect(microphoneTracks).toBe("1")
})
