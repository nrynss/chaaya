import { execFileSync } from "node:child_process"

/** The window the reader averages over when it hunts for a marker, in seconds. */
const ENVELOPE_WINDOW_SECONDS = 0.005

/** A window counts as a marker when its level climbs above this share of the
 * take's loudest window. The continuous tone sits well under the marker burst,
 * so half separates the two without knowing the signal's levels. */
export const MARKER_THRESHOLD_SHARE = 0.5

/** The knobs a caller may set on the marker reader. */
export interface MarkerReaderOptions {
	/** The averaging window in seconds. 0.005 by default. */
	readonly windowSeconds?: number
	/** The share of the peak a window must reach to count. 0.5 by default. */
	readonly thresholdShare?: number
}

/** What the reader found in one saved take. */
export interface MarkerReading {
	/** How many markers the take carries. */
	readonly count: number
	/** Where each marker starts, in seconds from the take's start. */
	readonly onsetsSeconds: readonly number[]
	/** The gap between each pair of neighbouring onsets, in seconds. */
	readonly spacingsSeconds: readonly number[]
	/** The direction the onsets arrive in. A well formed take ascends. */
	readonly order: "ascending" | "descending" | "unsorted"
	/** The rate the take's samples are counted at, read from the file. */
	readonly sampleRate: number
	/** The take's frame count, read from the decoded samples. */
	readonly frames: number
	/** The take's length in seconds, from its own sample count. */
	readonly durationSeconds: number,
	/** The level of each envelope window, normalized so the take's loudest
	 * window reads 1. A check reads this to tell a marker whose burst merged
	 * into its neighbour's from a marker the take lost. */
	readonly envelopeLevels: readonly number[]
	/** The span one envelope window covers, in seconds. */
	readonly envelopeWindowSeconds: number
}

/** Reads the take's rate with ffprobe. A rate of zero or a missing stream fails
 * the read, because the samples cannot be counted without it. */
function probeSampleRate(file: string): number {
	const raw = execFileSync(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"a:0",
			"-show_entries",
			"stream=sample_rate",
			"-of",
			"default=nokey=1:noprint_wrappers=1",
			file
		],
		{ encoding: "utf8" }
	)
	const rate = Number(raw.trim())
	if (!Number.isInteger(rate) || rate <= 0) {
		throw new Error(`ffprobe read no sample rate from ${file}`)
	}
	return rate
}

/** Decodes the take to mono 32 bit float samples with ffmpeg. The copy gives a
 * fresh, aligned buffer, so a pooled Buffer never misaligns the float view. */
function decodeSamples(file: string, sampleRate: number): Float32Array {
	const raw = execFileSync(
		"ffmpeg",
		["-v", "error", "-i", file, "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", String(sampleRate), "-"],
		{ maxBuffer: 1 << 28 }
	)
	const bytes = new Uint8Array(raw.byteLength)
	bytes.set(raw)
	return new Float32Array(bytes.buffer)
}

/** The root mean square level of each non overlapping window of the samples. */
function envelopeLevels(samples: Float32Array, windowFrames: number): number[] {
	const levels: number[] = []
	for (let start = 0; start + windowFrames <= samples.length; start += windowFrames) {
		let sum = 0
		for (let index = 0; index < windowFrames; index += 1) {
			const value = samples[start + index]
			sum += value * value
		}
		levels.push(Math.sqrt(sum / windowFrames))
	}
	return levels
}

function orderOf(onsets: readonly number[]): MarkerReading["order"] {
	let ascending = true
	let descending = true
	for (let index = 1; index < onsets.length; index += 1) {
		if (onsets[index] <= onsets[index - 1]) ascending = false
		if (onsets[index] >= onsets[index - 1]) descending = false
	}
	if (ascending) return "ascending"
	if (descending) return "descending"
	return "unsorted"
}

/** Finds the marker bursts in a saved take. A burst is a run of windows whose
 * level passes half the take's peak. The reader reports how many it found,
 * where each one starts, the gap between neighbours, and their order. */
export function readMarkers(file: string, options: MarkerReaderOptions = {}): MarkerReading {
	const sampleRate = probeSampleRate(file)
	const samples = decodeSamples(file, sampleRate)
	const windowSeconds = options.windowSeconds ?? ENVELOPE_WINDOW_SECONDS
	const thresholdShare = options.thresholdShare ?? MARKER_THRESHOLD_SHARE
	const windowFrames = Math.max(1, Math.round(sampleRate * windowSeconds))
	const levels = envelopeLevels(samples, windowFrames)
	let peak = 0
	for (const level of levels) {
		if (level > peak) peak = level
	}
	const threshold = peak * thresholdShare
	const onsetsSeconds: number[] = []
	let active = false
	for (let index = 0; index < levels.length; index += 1) {
		if (levels[index] >= threshold) {
			if (!active) {
				onsetsSeconds.push(Number(((index * windowFrames) / sampleRate).toFixed(4)))
			}
			active = true
		} else {
			active = false
		}
	}
	const spacingsSeconds = onsetsSeconds
		.slice(1)
		.map((onset, index) => Number((onset - onsetsSeconds[index]).toFixed(4)))
	return {
		count: onsetsSeconds.length,
		onsetsSeconds,
		spacingsSeconds,
		order: orderOf(onsetsSeconds),
		sampleRate,
		frames: samples.length,
		durationSeconds: Number((samples.length / sampleRate).toFixed(4)),
		envelopeLevels: levels.map((level) => (peak > 0 ? level / peak : 0)),
		envelopeWindowSeconds: windowSeconds
	}
}
