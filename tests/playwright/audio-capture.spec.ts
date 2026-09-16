import { expect, test, type Page } from "@playwright/test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { markerOnsetsSeconds, readMarkers, type MarkerReading } from "./support/audio"

/** The signal the harness records in place of a microphone carries one marker
 * every 100 ms, and each burst runs for 25 ms. */
const MARKER_INTERVAL_SECONDS = 0.1
const MARKER_SECONDS = 0.025

/** How far an onset may sit from its slot. The reader averages over five
 * millisecond windows, so a slot boundary can land either side of it. */
const MARKER_TOLERANCE_SECONDS = 0.02

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

/** Writes the blob the page captured to disk, so a probe reads the real bytes. */
async function saveTake(page: Page, file: string): Promise<void> {
	// The page writes the finished take into window state after the recorder
	// settles, so wait for that state write before reading instead of racing
	// it with a bare evaluate.
	await page.waitForFunction(
		() => Boolean((window as unknown as { __capture?: { blob?: Blob } }).__capture?.blob),
		undefined,
		{ timeout: 30_000 }
	)
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
		(onset) => onset >= startElapsed && onset + MARKER_SECONDS <= stopElapsed
	)
}

/** Records one take of the generated signal and reads it back. */
async function record(page: Page, mode: "compressed" | "pcm"): Promise<Take> {
	const file = join(mkdtempSync(join(tmpdir(), "chaaya-take-")), "take.bin")
	await page.goto("/tests/audio-capture")
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
	await saveTake(page, file)
	return { ...take, reading: readMarkers(file) }
}

/** The checks both modes owe the generated signal. */
function checkMarkers(take: Take): void {
	const onsets = expectedOnsets(take.startElapsed, take.stopElapsed)
	// The expected count follows the take's own clock readings, so a fixed
	// floor on it fails a correct take on a slow host. Half the expected
	// span still separates a real window from a collapsed one, and the check
	// below already fails a take that lost even one marker.
	expect(onsets.length).toBeGreaterThanOrEqual(
		Math.floor(
			MARKER_INTERVAL_SECONDS > 0
				? (take.stopElapsed - take.startElapsed) / MARKER_INTERVAL_SECONDS / 2
				: 0
		)
	)
	// A collapsed window would pass every check below for the wrong reason.
	expect(take.reading.count).toBe(onsets.length)
	expect(take.reading.order).toBe("ascending")
	for (const spacing of take.reading.spacingsSeconds) {
		expect(Math.abs(spacing - MARKER_INTERVAL_SECONDS)).toBeLessThanOrEqual(MARKER_TOLERANCE_SECONDS)
	}
	// The take is written at the rate the capture ran at, so the rate a probe
	// reads back from the bytes is the rate the page reports.
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
			const take = await record(page, mode)
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
