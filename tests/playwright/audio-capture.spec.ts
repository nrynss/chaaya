import { expect, test, type Page } from "@playwright/test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	MARKER_THRESHOLD_SHARE,
	markerOnsetsSeconds,
	readMarkers,
	type MarkerReading
} from "./support/audio"

/** The signal the harness records in place of a microphone carries one marker
 * every 100 ms, and each burst runs for 25 ms. */
const MARKER_INTERVAL_SECONDS = 0.1

/** How far an onset may sit from its slot. The reader averages over five
 * millisecond windows, so a slot boundary can land either side of it. */
const MARKER_TOLERANCE_SECONDS = 0.02
/** How long one marker's burst runs. The signal sounds a burst for a
 * quarter of the interval, so a slot's energy is judged over this span. */
const MARKER_BURST_SECONDS = 0.025

/** The harness omits the first marker of the signal, so a take can open there
 * without cutting a burst in half. */
const OMIT_MARKER_INDEX = 0

/** One take of the generated signal, read back from the page and from disk. */
interface Take {
	/** What the marker reader found in the saved bytes. */
	readonly reading: MarkerReading
	/** The rate the recorder reported for the take. */
	readonly reportedRate: number
	/** The context clock when the take entered its running state. */
	readonly startElapsed: number
	/** The context clock when the take reached its end. */
	readonly stopElapsed: number
	/** The span of one captured block, the tolerance a length check allows. */
	readonly blockSeconds: number
	/** The container type the recorder reported. */
	readonly mimeType: string
}

/** Reads one number the page prints for a test id. */
async function number(page: Page, testId: string): Promise<number> {
	return Number((await page.getByTestId(testId).textContent())?.trim() ?? "")
}

/** The reading of a take with no readable samples, what a failed attempt
 * returns. An exact check below keeps it out of a pass. */
const EMPTY_READING: MarkerReading = {
	count: 0,
	onsetsSeconds: [],
	spacingsSeconds: [],
	order: "ascending",
	sampleRate: 0,
	frames: 0,
	durationSeconds: 0,
	envelopeLevels: [],
	envelopeWindowSeconds: 0
}

/** Writes the blob the page captured to disk, so a probe reads the real bytes. */
async function saveTake(page: Page, file: string): Promise<void> {
	// The page writes the finished take into window state after the recorder
	// settles, so wait for that state write before reading instead of racing
	// it with a bare evaluate. A first click can land while the page module
	// has not yet installed the recorder's blob hook, so the caller retries
	// the take from scratch when no state ever arrives.
	await page.waitForFunction(
		() => Boolean((window as unknown as { __capture?: { blob?: Blob } }).__capture?.blob),
		undefined,
		{ timeout: 10_000 }
	).catch(() => undefined)
	const base64 = await page.evaluate(async () => {
		const capture = (window as unknown as { __capture?: { blob?: Blob } }).__capture
		const blob = capture?.blob
		if (!blob) return ""
		const bytes = new Uint8Array(await blob.arrayBuffer())
		let binary = ""
		const step = 0x8000
		for (let index = 0; index < bytes.length; index += step) {
			binary += String.fromCharCode(...bytes.subarray(index, index + step))
		}
		return btoa(binary)
	})
	expect(base64.length).toBeGreaterThan(0)
	const binary = atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}
	writeFileSync(file, bytes)
}

/** The onsets a take should carry. The take opens at the clock reading the
 * page reports, so a marker before it never arrives and a marker that runs
 * past the end is cut short. The opening gap is empty, so every marker inside
 * the window arrives whole. */
function expectedOnsets(startElapsed: number, stopElapsed: number): number[] {
	return markerOnsetsSeconds({ omitMarkerIndex: OMIT_MARKER_INDEX }).filter(
		// A marker whose onset sits inside the window arrives. Its burst tail
		// can run past the stop clock reading, because the take keeps
		// recording until the recorder sees the stop, so only the onset
		// bounds the window.
		(onset) => onset >= startElapsed && onset < stopElapsed
	)
}

/** Records one take of the generated signal and reads it back. A first click
 * can land while the page module has not yet installed the recorder's blob
 * hook, so the take can complete without the page having anything to hand
 * back. The run attempt tag goes on the window before the click, so a retried
 * attempt never reuses the state a failed attempt left behind. */
async function record(page: Page, mode: "compressed" | "pcm", attempt: number): Promise<Take> {
	const file = join(mkdtempSync(join(tmpdir(), "chaaya-take-")), "take.bin")
	await page.goto("/tests/audio-capture")
	await page.evaluate((value) => {
		;(window as Window & { __captureRun?: number }).__captureRun = value
	}, attempt)
	await page.getByTestId(`start-${mode}`).click()
	await expect(page.getByTestId("state")).toHaveText("stopped", { timeout: 20_000 })
	await expect(page.getByTestId("error")).toHaveText("")
	const take = {
		reportedRate: await number(page, "rate"),
		startElapsed: await number(page, "start-elapsed"),
		stopElapsed: await number(page, "stop-elapsed"),
		blockSeconds: await number(page, "block-seconds"),
		mimeType: (await page.getByTestId("mime").textContent())?.trim() ?? ""
	}
	// The clock readouts render through the page's own state, so wait for the
	// stop reading to appear before taking both numbers.
	await page.waitForFunction(
		(stop) => Number(stop) > 0,
		await page.getByTestId("stop-elapsed").textContent(),
		{ timeout: 30_000 }
	)
	try {
		await saveTake(page, file)
	} catch {
		// The page held no blob, so this attempt produced nothing to read.
		return { ...take, reading: EMPTY_READING }
	}
	return { ...take, reading: readMarkers(file) }
}

/** The burst onsets a reading carries. The reader reports where each run
 * above the threshold starts, so a burst that lost one window inside its
 * slot presents itself as two onsets less than half a marker interval
 * apart. Merging those pairs restores one onset per marker, while a lost
 * marker still leaves its slot empty. */
function mergedOnsets(onsets: readonly number[]): number[] {
	return onsets.filter((onset, index) =>
		index === 0 || onset - onsets[index - 1] >= MARKER_INTERVAL_SECONDS / 2
	)
}

/** Whether the bytes carry a burst's energy at one slot. A marker whose
 * burst merged into its neighbour's leaves the energy without an onset of
 * its own, and a lost marker leaves the continuous tone alone, so the
 * levels separate the two. */
function slotCarriesBurst(take: Take, position: number): boolean {
	const levels = take.reading.envelopeLevels
	const windowSeconds = take.reading.envelopeWindowSeconds
	if (windowSeconds <= 0) return false
	const from = Math.max(0, Math.floor((position - MARKER_TOLERANCE_SECONDS) / windowSeconds))
	const to = Math.min(
		levels.length,
		Math.ceil((position + MARKER_BURST_SECONDS + MARKER_TOLERANCE_SECONDS) / windowSeconds)
	)
	for (let index = from; index < to; index += 1) {
		if (levels[index] >= MARKER_THRESHOLD_SHARE) return true
	}
	return false
}

/** The checks both modes owe the generated signal. */
function checkMarkers(take: Take): void {
	const onsets = expectedOnsets(take.startElapsed, take.stopElapsed)
	const bursts = mergedOnsets(take.reading.onsetsSeconds)

	// The expected count follows the take's own clock readings, so a fixed
	// floor on it fails a correct take on a slow host. Half the expected
	// span still separates a real window from a collapsed one.
	expect(onsets.length).toBeGreaterThanOrEqual(
		Math.floor(
			MARKER_INTERVAL_SECONDS > 0
				? (take.stopElapsed - take.startElapsed) / MARKER_INTERVAL_SECONDS / 2
				: 0
		)
	)
	// A take whose bytes hold no readable burst has nothing to judge. The
	// record attempts above retry an empty take, and none of them may paper
	// over a silent or broken one.
	expect(bursts.length, "the take carries no readable marker bursts").toBeGreaterThanOrEqual(1)
	expect(take.reading.order).toBe("ascending")

	// How far an onset may sit from its slot. The reader averages over five
	// millisecond windows, and the head can lose one recorder block, so the
	// bound is one tolerance plus half a block, read from the take's own
	// block size.
	const drift = MARKER_TOLERANCE_SECONDS + take.blockSeconds / 2

	// Every burst must sit on the signal's own grid, whole intervals from
	// the first burst. A take that lost frames at the head keeps the
	// spacing, and so does a take that lost an interior marker, so the grid
	// judges spacing alone and never presence.
	const gridOffsets = bursts.map(
		(onset) => Math.round((onset - bursts[0]) / MARKER_INTERVAL_SECONDS)
	)
	for (let index = 0; index < bursts.length; index += 1) {
		const gridPosition = bursts[0] + gridOffsets[index] * MARKER_INTERVAL_SECONDS
		expect(
			Math.abs(bursts[index] - gridPosition),
			`burst ${index} at ${bursts[index]}s sits off the marker grid`
		).toBeLessThanOrEqual(drift)
		if (index > 0) {
			expect(
				gridOffsets[index],
				`burst ${index} at ${bursts[index]}s repeats the slot burst ${index - 1} holds`
			).toBeGreaterThan(gridOffsets[index - 1])
		}
	}

	// The window the bytes themselves span. The recorder can lose frames at
	// the head, so the file can open after the take's clock does, and a stop
	// can cut the last burst short. Both moves stay at the edges, so the
	// check places the bytes against the signal and judges the slots that
	// placement puts inside them.
	const span = take.reading.durationSeconds

	// Each candidate names the slot the first burst sits on. A candidate is
	// valid when at most one burst sits outside the slots it covers, because
	// one edge cut can split at most one burst. The winner misses the fewest
	// slots, then covers the most.
	let bestFound = false
	let bestMissing: number[] = []
	let bestCovered = -1
	let bestLastOffset = -1
	for (let first = 0; first < onsets.length; first += 1) {
		const head = onsets[first] - bursts[0]
		if (head < -drift) continue
		const missing: number[] = []
		let covered = 0
		let extras = 0
		let lastOffset = -1
		for (let slot = 0; slot < onsets.length; slot += 1) {
			const position = onsets[slot] - head
			const matched = gridOffsets.indexOf(slot - first) >= 0
			if (position >= 0 && position < span) {
				covered += 1
				lastOffset = slot - first
				// A covered slot without a burst is lost unless its energy
				// rides in a neighbour's burst, which a merge leaves behind.
				if (!matched && !slotCarriesBurst(take, position)) missing.push(onsets[slot])
			} else if (matched) {
				extras += 1
			}
		}
		if (extras > 1) continue
		if (
			!bestFound ||
			missing.length < bestMissing.length ||
			(missing.length === bestMissing.length && covered > bestCovered)
		) {
			bestFound = true
			bestMissing = missing
			bestCovered = covered
			bestLastOffset = lastOffset
		}
	}

	// No candidate places the bytes against the signal when the reading
	// holds bursts the grid cannot bind, so an unplaceable take fails here.
	expect(bestFound, "the take's bytes place against none of the signal's slots").toBe(true)

	// One burst past the covered slots is the most an edge cut can leave,
	// because a stop can split one burst in two. More than one is noise the
	// take should not carry.
	expect(
		gridOffsets[gridOffsets.length - 1],
		"the take carries bursts past its last covered marker slot"
	).toBeLessThanOrEqual(bestLastOffset + 1)

	// Every slot the winning placement puts inside the bytes must carry its
	// marker. A slot with neither a burst nor the burst's energy is a marker
	// the take lost, and the failure names it.
	expect(
		bestMissing,
		`the take lost the markers at ${bestMissing.map((slot) => `${slot.toFixed(3)}s`).join(", ")}`
	).toEqual([])

	// The take is written at the rate the capture ran at, so the rate a
	// probe reads back from the bytes is the rate the page reports.
	expect(take.reading.sampleRate).toBe(take.reportedRate)
	expect(take.reading.sampleRate).toBeGreaterThan(0)
}

test.describe("a granted microphone", () => {
	for (const mode of ["compressed", "pcm"] as const) {
		test(`a ${mode} take carries the generated markers`, async ({ page, browserName }) => {
			// WebKitGTK's headless build defines no MediaRecorder, so the
			// recorder cannot encode the compressed take there and it would
			// fail there for an engine reason, not a capture defect. The PCM
			// take, the refused grant and the stopped track run and pass on
			// WebKit, so only this case skips there.
			test.skip(browserName === "webkit" && mode === "compressed", "WebKitGTK headless defines no MediaRecorder, so the compressed take records nothing there.")
			/* A first click can land while the page module has not yet installed
			 * the recorder's blob hook, so the take can complete without the page
			 * having anything to hand back. Re-enter the record from scratch, up
			 * to three attempts, the way Playwright's own retry does. A take with
			 * content on any attempt passes, and a silent or broken take still
			 * fails every attempt, so retries never pass a defect. */
			let take = await record(page, mode, 0)
			for (let attempt = 1; attempt < 3 && take.reading.count === 0; attempt += 1) {
				take = await record(page, mode, attempt)
			}
			checkMarkers(take)
			expect(take.mimeType).toContain(mode === "pcm" ? "audio/wav" : "audio/")
			const elapsed = take.stopElapsed - take.startElapsed
			expect(Math.abs(take.reading.durationSeconds - elapsed)).toBeLessThanOrEqual(
				take.blockSeconds
			)
		})
	}
})

test.describe("a microphone that is not there", () => {
	test("a refused grant ends in denied", async ({ page }) => {
		await page.goto("/tests/audio-capture")
		await page.getByTestId("start-refused").click()
		await expect(page.getByTestId("state")).toHaveText("denied")
		await expect(page.getByTestId("error")).not.toHaveText("")
	})

	test("a track stopped mid take ends in failed and keeps its chunks", async ({ page }) => {
		await page.goto("/tests/audio-capture")
		await page.getByTestId("start-pcm").click()
		await expect(page.getByTestId("state")).toHaveText("recording")
		// Wait for the first captured block, so the take holds audio to keep.
		await expect(page.getByTestId("chunks")).not.toHaveText("0")
		const held = await number(page, "chunks")
		await page.getByTestId("stop-track").click()
		await expect(page.getByTestId("state")).toHaveText("failed", { timeout: 10_000 })
		await expect(page.getByTestId("error")).not.toHaveText("")
		expect(await number(page, "chunks")).toBeGreaterThanOrEqual(held)
		expect(await number(page, "size")).toBeGreaterThan(0)
	})
})
