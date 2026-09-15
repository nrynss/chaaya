import { expect, test, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** The known tone the fake device plays, 48 kHz mono for three seconds. */
const TONE = fileURLToPath(new URL("../../tests/fixtures/audio/tone-48k.wav", import.meta.url))

/** The source length in seconds. */
const SOURCE_SECONDS = 3

/** The PCM block the recorder hands back, one tolerance for a short tail. */
const PCM_BLOCK_SECONDS = 4096 / 48000

/** The compressed block interval the recorder asks MediaRecorder for. */
const COMPRESSED_BLOCK_SECONDS = 1

interface Measurement {
	codec: string | null
	sampleRate: number | null
	duration: number | null
}

test.use({
	// The default headless shell ships no audio stack. The fake device flags
	// need the full Chromium build that Playwright also installs.
	channel: "chromium",
	launchOptions: {
		args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${TONE}`],
	},
})

test.beforeEach(({ browserName }) => {
	test.skip(browserName !== "chromium", "The fake audio device exists only in Chromium.")
})

/**
 * Reads the audio length out of the saved file. ffprobe reports a container
 * duration when the file carries one, and a plain webm often does not. The
 * packet timestamps then give the span of the audio that actually arrived.
 */
function measure(file: string): Measurement {
	const raw = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=codec_name,sample_rate,duration:format=duration",
			"-of",
			"json",
			file,
		],
		{ encoding: "utf8" }
	)
	const parsed = JSON.parse(raw) as {
		streams?: { codec_name?: string; sample_rate?: string; duration?: string }[]
		format?: { duration?: string }
	}
	const stream = parsed.streams?.[0] ?? {}
	const candidates = [stream.duration, parsed.format?.duration]
	const container = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0)
	console.log("ffprobe", file, raw.trim().replace(/\s+/g, " "))
	return {
		codec: stream.codec_name ?? null,
		sampleRate: stream.sample_rate ? Number(stream.sample_rate) : null,
		duration: container ?? packetSpan(file),
	}
}

/** The last packet timestamp plus its own length, the span when no header exists. */
function packetSpan(file: string): number | null {
	const raw = execFileSync(
		"ffprobe",
		["-v", "error", "-select_streams", "a:0", "-show_entries", "packet=pts_time,duration_time", "-of", "csv=p=0", file],
		{ encoding: "utf8" }
	)
	const lines = raw.split("\n").filter((line) => line.trim().length > 0)
	const last = lines[lines.length - 1]
	if (!last) return null
	const [pts, length] = last.split(",").map(Number)
	if (!Number.isFinite(pts)) return null
	return pts + (Number.isFinite(length) ? length : 0)
}

/** Writes the blob the page captured to disk, so a probe reads the real bytes. */
async function saveTake(page: Page, file: string): Promise<void> {
	const base64 = await page.evaluate(async () => {
		const capture = (window as unknown as { __capture?: { blob: Blob } }).__capture
		if (!capture) return ""
		const bytes = new Uint8Array(await capture.blob.arrayBuffer())
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

async function take(page: Page, button: string, file: string): Promise<Measurement> {
	await page.goto("/tests/audio-capture")
	await page.getByTestId(button).click()
	await expect(page.getByTestId("state")).toHaveText("recording")
	await expect(page.getByTestId("state")).toHaveText("stopped", { timeout: 15_000 })
	await expect(page.getByTestId("error")).toHaveText("")
	await saveTake(page, file)
	return measure(file)
}

test.describe("a granted microphone", () => {
	test.use({ permissions: ["microphone"] })

	test("a compressed take keeps the source rate and length", async ({ page }, testInfo) => {
		const measured = await take(page, "start-compressed", testInfo.outputPath("capture.webm"))
		console.log("compressed take", JSON.stringify(measured))
		expect(measured.sampleRate).toBe(48000)
		expect(measured.duration).not.toBeNull()
		expect(Math.abs((measured.duration ?? 0) - SOURCE_SECONDS)).toBeLessThanOrEqual(
			COMPRESSED_BLOCK_SECONDS
		)
	})

	test("a pcm take keeps the source rate and length", async ({ page }, testInfo) => {
		const measured = await take(page, "start-pcm", testInfo.outputPath("capture.wav"))
		console.log("pcm take", JSON.stringify(measured))
		expect(measured.codec).toBe("pcm_s16le")
		expect(measured.sampleRate).toBe(48000)
		expect(measured.duration).not.toBeNull()
		expect(Math.abs((measured.duration ?? 0) - SOURCE_SECONDS)).toBeLessThanOrEqual(
			PCM_BLOCK_SECONDS
		)
		await expect(page.getByTestId("chunks")).not.toHaveText("0")
	})
})

test.describe("a lost microphone", () => {
	test.use({ permissions: ["microphone"] })

	test("a compressed take that loses its track mid take keeps its bytes", async ({ page }) => {
		await page.addInitScript(() => {
			const media = navigator.mediaDevices
			const original = media.getUserMedia.bind(media)
			const streams: MediaStream[] = []
			;(window as unknown as { __streams?: MediaStream[] }).__streams = streams
			media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
				const stream = await original(constraints)
				streams.push(stream)
				return stream
			}
		})
		await page.goto("/tests/audio-capture")
		await page.getByTestId("start-compressed").click()
		await expect(page.getByTestId("state")).toHaveText("recording")
		await page.waitForTimeout(1500)
		await page.evaluate(() => {
			const streams = (window as unknown as { __streams?: MediaStream[] }).__streams ?? []
			streams[streams.length - 1].getAudioTracks()[0].dispatchEvent(new Event("ended"))
		})
		await expect(page.getByTestId("state")).toHaveText("failed")
		await expect(page.getByTestId("error")).not.toHaveText("")
		await expect
			.poll(() =>
				page.evaluate(() => {
					const capture = (window as unknown as { __capture?: { blob?: Blob } }).__capture
					return capture?.blob?.size ?? 0
				})
			)
			.toBeGreaterThan(0)
	})

	test("a pcm take that loses its track during startup lands in failed", async ({ page }) => {
		await page.addInitScript(() => {
			const media = navigator.mediaDevices
			const original = media.getUserMedia.bind(media)
			const streams: MediaStream[] = []
			media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
				const stream = await original(constraints)
				streams.push(stream)
				return stream
			}
			const resume = AudioContext.prototype.resume
			AudioContext.prototype.resume = function (this: AudioContext) {
				for (const stream of streams) {
					for (const track of stream.getAudioTracks()) track.stop()
				}
				return resume.call(this)
			}
		})
		await page.goto("/tests/audio-capture")
		await page.getByTestId("start-pcm").click()
		await expect(page.getByTestId("state")).toHaveText("failed", { timeout: 15_000 })
		await expect(page.getByTestId("error")).not.toHaveText("")
	})
})

test("a refused microphone grant lands in the denied state", async ({ page }) => {
	await page.goto("/tests/audio-capture")
	await page.getByTestId("start-compressed").click()
	await expect(page.getByTestId("state")).toHaveText("denied")
	await expect(page.getByTestId("error")).not.toHaveText("")
})
