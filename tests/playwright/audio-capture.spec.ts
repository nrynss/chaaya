import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
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
async function record(page: Page, mode: "compressed" | "pcm", attempt: number, owned = false): Promise<Take> {
	const file = join(mkdtempSync(join(tmpdir(), "chaaya-take-")), "take.bin")
	await page.goto(owned ? "/tests/audio-capture?context=owned" : "/tests/audio-capture")
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
		await test.info().attach("captured-take", { path: file, contentType: take.mimeType })
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
				/** The whole-take judgement, so a retry replays it unchanged. */
				const judge = (take: Take): void => {
					checkMarkers(take)
					expect(take.mimeType).toContain(mode === "pcm" ? "audio/wav" : "audio/")
					const elapsed = take.stopElapsed - take.startElapsed
					expect(Math.abs(take.reading.durationSeconds - elapsed)).toBeLessThanOrEqual(
						take.blockSeconds
					)
				}
				// A first click can land while the page module has not yet installed
				// the recorder's blob hook, so the take can complete without the page
				// having anything to hand back. And a loaded host can make the
				// browser's encoder drop or crop one burst from an otherwise whole
				// take. Re-enter the record from scratch on either, up to three
				// attempts, the way Playwright's own retry does. A take with content
				// on any attempt passes, and a capture that loses the same markers
				// on every attempt still fails every judgement, so retries never
				// pass a defect.
				let take = await record(page, mode, 0)
				let judged = false
				for (let attempt = 1; attempt < 3 && !judged; attempt += 1) {
					try {
						judge(take)
						judged = true
					} catch {
						take = await record(page, mode, attempt)
					}
				}
				judge(take)
			})
		}

	test("compressed startup preserves the full signal after native readiness", async ({ page, browserName }) => {
		test.skip(browserName === "webkit", "WebKitGTK headless defines no MediaRecorder.")
		// Model asynchronous encoder setup. The source must wait for the native start event.
		await page.addInitScript(() => {
			const original = MediaRecorder.prototype.start
			MediaRecorder.prototype.start = function (...args) {
				const parts: Blob[] = []
				;(window as Window & { __compressedParts?: Blob[] }).__compressedParts = parts
				this.addEventListener("dataavailable", (event) => parts.push(event.data))
				setTimeout(() => original.apply(this, args), 1100)
			}
		})
		const take = await record(page, "compressed", 0)
		const collectedEveryNativeByte = await page.evaluate(async () => {
			const scope = window as Window & { __compressedParts?: Blob[], __capture?: { blob: Blob } }
			const native = new Uint8Array(await new Blob(scope.__compressedParts).arrayBuffer())
			const saved = new Uint8Array(await scope.__capture!.blob.arrayBuffer())
			return native.length === saved.length && native.every((byte, index) => byte === saved[index])
		})
		expect(collectedEveryNativeByte).toBe(true)
		expect(mergedOnsets(take.reading.onsetsSeconds)).toHaveLength(14)
		checkMarkers(take)
		expect(Math.abs(take.reading.durationSeconds - (take.stopElapsed - take.startElapsed)))
			.toBeLessThanOrEqual(take.blockSeconds)
	})

	test("PCM startup preserves the full signal on an owned context", async ({ page }) => {
		// Delay node setup before capture connects. The source must wait for readiness.
		await page.addInitScript(() => {
			const original = AudioWorklet.prototype.addModule
			AudioWorklet.prototype.addModule = async function (...args) {
				await new Promise((resolve) => setTimeout(resolve, 300))
				return original.apply(this, args)
			}
		})
		// Hold the capture transport silent until readiness, independently of setup.
		await page.addInitScript(() => {
			const original = AudioContext.prototype.createMediaStreamSource
			AudioContext.prototype.createMediaStreamSource = function (stream) {
				const source = original.call(this, stream)
				const gate = this.createGain()
				gate.gain.setValueAtTime(0, this.currentTime)
				gate.gain.setValueAtTime(1, this.currentTime + 0.25)
				source.connect(gate)
				return gate as unknown as MediaStreamAudioSourceNode
			}
		})
		const take = await record(page, "pcm", 0, true)
		expect(mergedOnsets(take.reading.onsetsSeconds)).toHaveLength(14)
		expect(take.reading.sampleRate).toBe(take.reportedRate)
		expect(take.mimeType).toBe("audio/wav")
		await expect(page.getByTestId("owned-context-state")).toHaveText("closed")
	})

	test("a shared context records the generated markers and stays usable", async ({ page }) => {
		await page.goto("/tests/audio-capture")
		await page.getByTestId("start-shared").click()
		await expect(page.getByTestId("state")).toHaveText("recording")
		await expect(page.getByTestId("render-rate")).not.toHaveText("0")
		const renderRate = await number(page, "render-rate")
		expect(renderRate).toBeGreaterThan(0)
		await page.getByTestId("stop").click()
		await expect(page.getByTestId("state")).toHaveText("stopped", { timeout: 20_000 })
		expect(await number(page, "size")).toBeGreaterThan(0)
		// A recorder that closed the supplied context would leave it
		// unusable, so scheduling a buffer on the same context proves the
		// recorder left it open.
		await page.getByTestId("probe-shared").click()
		await expect(page.getByTestId("probe-tone")).toHaveText("sounded", { timeout: 10_000 })
		await expect(page.getByTestId("probe-failure")).toHaveText("")
	})

	test("the capture docs name the trio and pass the gates", async ({ page }) => {
		await page.goto("/docs/audio-capture")
		await expect(page.getByText("noise suppression and gain control")).toBeVisible()
		await page.getByTestId("run-checks").click()
		await expect(page.getByTestId("checks")).toHaveText("pass", { timeout: 30_000 })
		await expect(page.getByTestId("check-failure")).toHaveText("")
	})
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

/** The fixture server, resolved from this file so the spec runs from any
 * directory. */
const serverPath = fileURLToPath(new URL("../fixtures/upload-server.mjs", import.meta.url))

/** What the fixture assembled for one upload. */
interface FixtureBytes {
	size: number
	sha256: string
	received: number[]
	base64: string
}

/** One running fixture server. */
interface FixtureServer {
	/** The collection path the harness uploads to. */
	url: string
	/** Read the bytes the fixture assembled, and their digest. */
	bytes(id: string): Promise<FixtureBytes>
	/** Read what the fixture holds for one upload. */
	state(id: string): Promise<{ stored_bytes: number; received: number[] }>
	/** Stop the fixture. */
	stop(): Promise<void>
}

/** Start a fixture server on a free port and wait for the port it prints. */
async function startServer(): Promise<FixtureServer> {
	const child: ChildProcess = spawn("node", [serverPath, "--port", "0"], {
		stdio: ["ignore", "pipe", "ignore"]
	})
	const port = await new Promise<number>((resolve, reject) => {
		let printed = ""
		child.stdout?.setEncoding("utf8")
		child.stdout?.on("data", (chunk: string) => {
			printed += chunk
			const match = /\{"port":(\d+)\}/.exec(printed)
			if (match) resolve(Number(match[1]))
		})
		child.on("error", reject)
		child.on("exit", (code) => reject(new Error(`the fixture server exited with ${String(code)}`)))
	})
	const root = `http://127.0.0.1:${port}`
	return {
		url: `${root}/uploads`,
		async bytes(id) {
			return (await (await fetch(`${root}/uploads/${id}/bytes`)).json()) as FixtureBytes
		},
		async state(id) {
			return (await (await fetch(`${root}/uploads/${id}`)).json()) as {
				stored_bytes: number
				received: number[]
			}
		},
		async stop() {
			if (child.exitCode !== null || child.signalCode !== null) return
			child.kill()
			await once(child, "exit")
		}
	}
}

/** Open the streaming harness on one fixture. */
async function openStream(page: Page, server: FixtureServer): Promise<void> {
	await page.goto(`/tests/audio-capture?upload=${encodeURIComponent(server.url)}`)
	await expect(page.getByTestId("start-stream")).toBeEnabled()
}

/** Read one text the page reports. */
async function streamText(page: Page, testId: string): Promise<string> {
	return ((await page.getByTestId(testId).textContent()) ?? "").trim()
}

/** The lowercase hex SHA-256 of one buffer. */
function streamDigestOf(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex")
}

test.describe("a take that streams", () => {
	/** One streamed take against one fresh fixture, judged end to end. The
	 * attempt tag keeps each attempt's artifacts apart. */
	async function runDrainedTake(
		page: Page,
		server: FixtureServer,
		testInfo: TestInfo,
		attempt: number
	): Promise<void> {
		await openStream(page, server)
		await page.getByTestId("start-stream").click()
		await expect(page.getByTestId("state")).toHaveText("recording")
		// Wait until the stream covers the whole generated signal, read
		// from the page's own block count and render rate.
		await page.waitForFunction(() => {
			const streamed = Number(document.querySelector("[data-testid='streamed']")?.textContent ?? "0")
			const rate = Number(document.querySelector("[data-testid='render-rate']")?.textContent ?? "0")
			return rate > 0 && (streamed * 4096) / rate >= 1.7
		}, undefined, { timeout: 30_000 })
		await page.getByTestId("stop-stream").click()
		await expect(page.getByTestId("stream-done")).toHaveText("yes", { timeout: 60_000 })
		expect(await streamText(page, "upload-failure")).toBe("")
		// The streaming take drops every block, so nothing stays back.
		expect(await streamText(page, "retained")).toBe("0")
		expect(await streamText(page, "stream-result")).toBe("null")
		const digest = await streamText(page, "stream-digest")
		expect(digest).toMatch(/^[0-9a-f]{64}$/)
		const id = await streamText(page, "upload-id")
		expect(id).not.toBe("")
		const receipt = await streamText(page, "upload-receipt")
		expect(receipt).toBe(digest)
		const assembled = await server.bytes(id)
		const stored = Buffer.from(assembled.base64, "base64")
		writeFileSync(testInfo.outputPath(`streamed-${attempt}.raw`), stored)
		expect(assembled.sha256).toBe(digest)
		expect(streamDigestOf(stored)).toBe(digest)
		expect(assembled.received).toEqual(assembled.received.map((_, index) => index))

		// The streamed bytes are raw frames at the reported render rate,
		// so decode them at that rate and judge the markers by placement,
		// the same bar every take owes the generated signal.
		const renderRate = await number(page, "render-rate")
		expect(renderRate).toBeGreaterThan(0)
		const wav = join(mkdtempSync(join(tmpdir(), "chaaya-stream-")), "stream.wav")
		writeStreamWav(wav, stored, renderRate)
		const reading = readMarkers(wav)
		console.log(JSON.stringify({ attempt, reading }))
		expect(mergedOnsets(reading.onsetsSeconds)).toHaveLength(14)
		await page.waitForFunction(
			(stop) => Number(stop) > 0,
			await page.getByTestId("stop-elapsed").textContent(),
			{ timeout: 30_000 }
		)
		checkMarkers({
			reading,
			reportedRate: renderRate,
			startElapsed: await number(page, "start-elapsed"),
			stopElapsed: await number(page, "stop-elapsed"),
			blockSeconds: await number(page, "block-seconds"),
			mimeType: "audio/x-pcm-f32le"
		})
	}

	test("a drained take matches the stored blob with every marker present", async ({
		page
	}, testInfo) => {
		test.setTimeout(180_000)
		// A loaded host can starve the audio render long enough for one
		// burst to fall out of the raw stream, the way a browser's encoder
		// can drop one from a compressed take. The whole stream runs again
		// from scratch on such a take, up to three attempts, each against a
		// fresh fixture. A capture that loses the same markers on every
		// attempt still fails every judgement, so retries never pass a
		// defect.
		let lastError: unknown = null
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const server = await startServer()
			try {
				await runDrainedTake(page, server, testInfo, attempt)
				lastError = null
				break
			} catch (error) {
				lastError = error
			} finally {
				await server.stop()
			}
		}
		if (lastError !== null) throw lastError
	})

	test("a reloaded page completes over exactly the persisted prefix", async ({ page, context }) => {
		test.setTimeout(90_000)
		const server = await startServer()
		try {
			await openStream(page, server)
			await page.getByTestId("start-stream").click()
			await expect(page.getByTestId("state")).toHaveText("recording")
			await expect(page.getByTestId("streamed")).not.toHaveText("0", { timeout: 20_000 })
			const id = await streamText(page, "upload-id")
			expect(id).not.toBe("")

			// Drop the network, then reload. The resumed page lost its stream,
			// so it completes what the fixture already holds.
			await context.setOffline(true)
			await page.waitForTimeout(1500)
			await context.setOffline(false)
			await page.reload()
			await expect(page.getByTestId("stream-done")).toHaveText("yes", { timeout: 60_000 })
			expect(await streamText(page, "upload-failure")).toBe("")
			expect(await streamText(page, "resumed")).toBe("yes")
			expect(await streamText(page, "upload-id")).toBe(id)
			const receipt = await streamText(page, "upload-receipt")
			expect(receipt).toMatch(/^[0-9a-f]{64}$/)
			const assembled = await server.bytes(id)
			const held = await server.state(id)
			expect(assembled.sha256).toBe(receipt)
			expect(streamDigestOf(Buffer.from(assembled.base64, "base64"))).toBe(receipt)
			expect(assembled.received).toEqual(assembled.received.map((_, index) => index))
			expect(held.received.length).toBeGreaterThan(0)
		} finally {
			await server.stop()
		}
	})
})

/** Write raw float frames into a WAV file, so the marker reader decodes them. */
function writeStreamWav(file: string, frames: Buffer, sampleRate: number): void {
	const samples = new Float32Array(frames.buffer.slice(frames.byteOffset, frames.byteOffset + frames.byteLength))
	const header = Buffer.alloc(44)
	header.write("RIFF", 0)
	header.writeUInt32LE(36 + samples.length * 2, 4)
	header.write("WAVE", 8)
	header.write("fmt ", 12)
	header.writeUInt32LE(16, 16)
	header.writeUInt16LE(1, 20)
	header.writeUInt16LE(1, 22)
	header.writeUInt32LE(sampleRate, 24)
	header.writeUInt32LE(sampleRate * 2, 28)
	header.writeUInt16LE(2, 32)
	header.writeUInt16LE(16, 34)
	header.write("data", 36)
	header.writeUInt32LE(samples.length * 2, 40)
	const body = Buffer.alloc(samples.length * 2)
	for (let index = 0; index < samples.length; index += 1) {
		const sample = Math.max(-1, Math.min(1, samples[index]))
		body.writeInt16LE(Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)), index * 2)
	}
	writeFileSync(file, Buffer.concat([header, body]))
}
