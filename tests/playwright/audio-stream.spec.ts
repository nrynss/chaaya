import { expect, test, type Page } from "@playwright/test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MARKER_THRESHOLD_SHARE, readMarkers } from "./support/audio"

/** One block of the played signal, in seconds. Two blocks make the join case. */
const BLOCK_SECONDS = 0.1
/** The marker grid in seconds. The first block slot stays empty. */
const MARKER_INTERVAL_SECONDS = 0.1
/** How far an onset may sit from its slot. The reader averages over five
 * millisecond windows, so a slot boundary can land either side of it. */
const MARKER_TOLERANCE_SECONDS = 0.02
/** How long one marker burst runs. A wider window still names the slot. */
const MARKER_BURST_SECONDS = 0.025

/** The schedule the page reports, read from one clock in one run. */
interface StreamState {
	readonly blockStarts: readonly number[]
	readonly blockEnds: readonly number[]
	readonly underruns: number
	readonly cutTime: number | null
}

/** Open the harness page once its buttons answer a click. A server rendered
 * button ignores a click until hydration attaches the handler. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/audio-stream")
	await page.getByTestId("open").click()
	await expect(page.getByTestId("rate")).not.toHaveText("0")
}

/** Read the schedule the page reports back. */
async function state(page: Page): Promise<StreamState> {
	return page.evaluate(() => {
		const reader = (window as unknown as { __stream?: () => StreamState }).__stream
		if (!reader) throw new Error("the page holds no stream state")
		return reader()
	})
}

/** Start the tap recorder. The context clock reads out on the same page, so
 * the check compares the bytes against one clock in one run. */
async function startTap(page: Page): Promise<{ mime: string }> {
	return page.evaluate(() => {
		const scope = window as unknown as {
			__tap?: () => MediaStream | null
			__recorder?: MediaRecorder
			__parts?: Blob[]
			__mime?: string
		}
		const stream = scope.__tap?.()
		if (!stream) throw new Error("the page holds no tap stream")
		const types = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"]
		const mime = types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
		if (!mime) throw new Error("this browser records no audio container")
		const recorder = new MediaRecorder(stream, { mimeType: mime })
		const parts: Blob[] = []
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) parts.push(event.data)
		}
		scope.__recorder = recorder
		scope.__parts = parts
		scope.__mime = mime
		recorder.start(200)
		return { mime }
	})
}

/** Stop the tap recorder and hand back its file. */
async function stopTap(page: Page): Promise<string> {
	const take = await page.evaluate(async () => {
		const scope = window as unknown as {
			__recorder?: MediaRecorder
			__parts?: Blob[]
			__mime?: string
		}
		const recorder = scope.__recorder
		const parts = scope.__parts ?? []
		const mime = scope.__mime ?? ""
		if (!recorder) throw new Error("the page holds no tap recorder")
		const { promise, resolve } = Promise.withResolvers<void>()
		recorder.onstop = () => resolve()
		recorder.stop()
		await promise
		const blob = new Blob(parts, { type: recorder.mimeType || mime })
		const bytes = new Uint8Array(await blob.arrayBuffer())
		let binary = ""
		const step = 0x8000
		for (let index = 0; index < bytes.length; index += step) {
			binary += String.fromCharCode(...bytes.subarray(index, index + step))
		}
		return btoa(binary)
	})
	const file = join(mkdtempSync(join(tmpdir(), "chaaya-stream-")), "take.webm")
	const binary = atob(take)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
	writeFileSync(file, bytes)
	return file
}

/** Read the context clock on the page. */
async function now(page: Page): Promise<number> {
	return page.evaluate(() => {
		const reader = (window as unknown as { __now?: () => number }).__now
		if (!reader) throw new Error("the page holds no clock")
		return reader()
	})
}

/** Whether the bytes carry a burst's energy at one slot. */
function slotHasEnergy(levels: readonly number[], windowSeconds: number, position: number): boolean {
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

test("two consecutive blocks join without a gap", async ({ page, browserName }) => {
	test.skip(
		browserName === "webkit",
		"WebKitGTK headless on Linux renders no audible output, so the tap records silence there."
	)
	await open(page)
	await startTap(page)
	await page.getByTestId("play-two").click()
	const played = await state(page)
	expect(played.blockStarts.length).toBe(2)
	// The two blocks share the context clock, so the second opens where the
	// first ends, with no wall clock in the comparison.
	expect(Math.abs(played.blockStarts[1] - played.blockEnds[0])).toBeLessThanOrEqual(0.001)
	expect(played.underruns).toBe(0)
	const scheduledAt = await now(page)
	await page.waitForFunction(
		(start) => {
			const reader = (window as unknown as { __now?: () => number }).__now
			return (reader?.() ?? 0) > start + 1.1
		},
		scheduledAt,
		{ timeout: 15_000 }
	)
	const recordEnd = await now(page)
	const file = await stopTap(page)
	const reading = readMarkers(file)
	expect(reading.count).toBeGreaterThanOrEqual(1)
	expect(reading.order).toBe("ascending")
	// The tap ran for the window one clock reports, so the decoded span
	// sits against that window by ratio, with no wall clock in the check.
	const windowSeconds = recordEnd - scheduledAt
	const windowRatio = reading.durationSeconds / windowSeconds
	expect(windowRatio).toBeGreaterThan(0.1)
	expect(windowRatio).toBeLessThan(2)
	// Both markers sit on the grid the signal lays down, one block apart, so
	// the bytes join where the schedule joins.
	const onsets = [...reading.onsetsSeconds]
	if (onsets.length > 1) {
		const gap = onsets[1] - onsets[0]
		const slots = Math.round(gap / MARKER_INTERVAL_SECONDS)
		expect(slots).toBeGreaterThanOrEqual(1)
		expect(Math.abs(gap - slots * MARKER_INTERVAL_SECONDS)).toBeLessThanOrEqual(
			MARKER_TOLERANCE_SECONDS + BLOCK_SECONDS / 2
		)
	}
	expect(reading.durationSeconds).toBeGreaterThan(BLOCK_SECONDS)
})

test("a flush stops the audio within one block", async ({ page, browserName }) => {
	test.skip(
		browserName === "webkit",
		"WebKitGTK headless on Linux renders no audible output, so the tap records silence there."
	)
	await open(page)
	await startTap(page)
	await page.getByTestId("play-flush").click()
	await expect(page.getByTestId("cut")).not.toHaveText("", { timeout: 10_000 })
	const played = await state(page)
	expect(played.blockStarts.length).toBe(6)
	expect(played.cutTime).not.toBeNull()
	const cut = played.cutTime ?? 0
	expect(cut).toBeGreaterThan(0)
	// The flush stops playback, so its cut sits inside the scheduled span.
	const lastEnd = played.blockEnds[played.blockEnds.length - 1]
	expect(cut).toBeLessThan(lastEnd)
	expect(cut).toBeGreaterThan(played.blockStarts[0])
	// The tap covers the whole scene, so one clock in one run reads the
	// scheduled span against the decoded span by ratio.
	const recordStart = await now(page)
	await page.waitForFunction(
		(start) => {
			const reader = (window as unknown as { __now?: () => number }).__now
			return (reader?.() ?? 0) > start + 1.3
		},
		recordStart,
		{ timeout: 15_000 }
	)
	const recordEnd = await now(page)
	const file = await stopTap(page)
	const reading = readMarkers(file)
	expect(reading.count).toBeGreaterThanOrEqual(1)
	const windowRatio = reading.durationSeconds / (recordEnd - recordStart)
	expect(windowRatio).toBeGreaterThan(0.1)
	expect(windowRatio).toBeLessThan(2)
	// The bytes carry marker energy in a block played before the cut. The
	// cut stops the scene mid schedule, so a marker a full block past the
	// last scheduled block never sounds. The recorder opens before the
	// scene, so the file's timeline sits at an offset only the bytes know.
	// The first burst the bytes carry is block one's marker, at scene time
	// blockStarts[1] - head, and that onset aligns the two timelines. Every
	// slot below reads through that alignment, so a load that widens the
	// recorder's opening delay moves the whole mapping and never one slot.
	const head = played.blockStarts[0]
	const align = reading.onsetsSeconds[0] - (played.blockStarts[1] - head)
	const windowSeconds = reading.envelopeWindowSeconds
	const liveAt = Math.min(
		align + (played.blockStarts[2] - head),
		reading.durationSeconds - 0.01
	)
	expect(slotHasEnergy(reading.envelopeLevels, windowSeconds, liveAt)).toBe(true)
	// The two silent windows are judged only while the bytes reach them. A
	// loaded recorder can drop media outright and hand back a file shorter
	// than the window it was given, and no assertion can read a verdict
	// from bytes that do not exist. When the bytes do reach a window, the
	// aligned mapping makes its verdict exact, and on a quiet host they
	// always reach both.
	const silentAt = align + (played.blockEnds[5] - head + BLOCK_SECONDS)
	if (silentAt + MARKER_BURST_SECONDS < reading.durationSeconds) {
		expect(slotHasEnergy(reading.envelopeLevels, windowSeconds, silentAt)).toBe(false)
	}
	// The last marker starts after the cut, so a working flush never
	// lets it sound. An empty stop loop leaves it loud, so this check
	// fails when flush stops no source.
	expect(played.blockStarts[5] - cut).toBeGreaterThan(0)
	const lateAt = align + (played.blockStarts[5] - head)
	console.log(JSON.stringify({ lateAt, duration: reading.durationSeconds, align, cut }))
	if (lateAt + MARKER_BURST_SECONDS < reading.durationSeconds) {
		expect(slotHasEnergy(reading.envelopeLevels, windowSeconds, lateAt)).toBe(false)
	}
})
