import { resampleLinear } from "../capture/resample.js"

/** One block the player placed on the context clock. */
export interface ScheduledBlock {
	/** The context time the block starts at, in seconds. */
	readonly startTime: number
	/** The context time the block ends at, in seconds. */
	readonly endTime: number
	/** True when silence the scheduler could not avoid opens before the block. */
	readonly underrun: boolean
}

/** The knobs a caller sets on a stream player. */
export interface StreamPlayerOptions {
	/** The context the player schedules on. The player never closes it. */
	readonly context: AudioContext
	/** The rate arriving blocks are in, in hertz. Defaults to the context rate. */
	readonly streamRate?: number
	/** How far ahead of now a late block starts, in seconds. Defaults to 0.05. */
	readonly leadSeconds?: number
	/** Where scheduled audio goes. Defaults to the context destination. */
	readonly destination?: AudioNode
}

/** How far ahead of now a late block starts when the caller names no lead. */
const DEFAULT_LEAD_SECONDS = 0.05

/**
 * PCM blocks with no length and no container, played gaplessly on a context
 * the caller owns. Each push schedules one block where the last one ends. A
 * block that arrives late starts at now plus a small lead, so it never lands
 * in the past, and it carries an underrun flag, so the gap stays visible. A
 * flush stops every live source and reports the cut time.
 *
 * Importing this module does no DOM work. A caller builds the player when a
 * gesture is at hand, on the context the capture already runs on.
 */
export class PcmStreamPlayer {
	/** Every block placed so far, in order, on the context clock. */
	blocks = $state<ScheduledBlock[]>([])
	/** The cut time of the last flush, or null before the first one. */
	lastCut = $state<number | null>(null)

	/** How many placed blocks opened with a gap before them. */
	get underruns(): number {
		return this.blocks.filter((block) => block.underrun).length
	}

	#context: AudioContext
	#streamRate: number
	#lead: number
	#destination: AudioNode
	#nextStart: number | null = null
	#live: AudioBufferSourceNode[] = []

	constructor(options: StreamPlayerOptions) {
		this.#context = options.context
		this.#streamRate = options.streamRate ?? options.context.sampleRate
		this.#lead = options.leadSeconds ?? DEFAULT_LEAD_SECONDS
		this.#destination = options.destination ?? options.context.destination
	}

	/**
	 * Schedule one block of mono frames and report its span. Consecutive
	 * blocks abut with no gap. An empty block schedules nothing and leaves
	 * the schedule where it stands.
	 */
	push(samples: Float32Array): ScheduledBlock {
		const context = this.#context
		const earliest = context.currentTime + this.#lead
		if (samples.length === 0) {
			const at = this.#nextStart ?? earliest
			return { startTime: at, endTime: at, underrun: false }
		}
		const frames = resampleLinear(samples, this.#streamRate, context.sampleRate)
		const previous = this.#nextStart
		const start = previous === null ? earliest : Math.max(previous, earliest)
		const end = start + frames.length / context.sampleRate
		const buffer = context.createBuffer(1, frames.length, context.sampleRate)
		buffer.getChannelData(0).set(frames)
		const source = context.createBufferSource()
		source.buffer = buffer
		source.connect(this.#destination)
		source.onended = (): void => {
			const index = this.#live.indexOf(source)
			if (index >= 0) this.#live.splice(index, 1)
			source.disconnect()
		}
		this.#live.push(source)
		source.start(start)
		const placed: ScheduledBlock = {
			startTime: start,
			endTime: end,
			underrun: previous !== null && start > previous
		}
		this.#nextStart = end
		this.blocks.push(placed)
		return placed
	}

	/**
	 * Stop every live source and cut the schedule. A source already playing
	 * stops at the cut, and a source still waiting never sounds. The next
	 * push starts fresh at now plus the lead. Returns the cut time.
	 */
	flush(): number {
		const cut = this.#context.currentTime
		for (const source of this.#live) {
			try {
				source.stop(cut)
			} catch {
				// The source ended on its own. Its handler already left.
			}
		}
		this.#live = []
		this.#nextStart = null
		this.lastCut = cut
		return cut
	}
}
