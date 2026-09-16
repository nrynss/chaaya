/**
 * The mono mixdown and the block packing behind a capture. The audio
 * processor in the page runs these functions on its own thread, so none of
 * them reaches for another module. The checks that judge a take call the very
 * same functions on synthetic frames.
 */

/** Where a take stands part way through. The offset counts the frames already
 * posted, and the buffer holds the block still filling. */
export interface ChunkState {
	/** The frames one posted block carries. */
	readonly frames: number
	/** The block still filling, one slot per frame. */
	readonly buffer: Float32Array
	/** How many slots of the block hold a frame. */
	filled: number
	/** How many frames the take has posted so far. */
	offset: number
	/** The clock reading at the first frame of the block still filling. */
	blockStart: number
}

/** One block of mono frames and where it sits on the audio clock. */
export interface EmittedChunk {
	/** The mono frames in the range -1 to 1. */
	readonly samples: Float32Array
	/** How many frames came before this block on the same take. */
	readonly offset: number
	/** The clock reading at the block's first frame, in seconds. */
	readonly contextTime: number
	/** Whether this block closes the take. */
	readonly final: boolean
}

/** Opens a chunk state that posts one block every `frames` frames. A size
 * below one falls back to a single frame, so a block always holds a frame. */
export function createChunkState(frames: number): ChunkState {
	const size = frames >= 1 ? Math.floor(frames) : 1
	return {
		frames: size,
		buffer: new Float32Array(size),
		filled: 0,
		offset: 0,
		blockStart: 0
	}
}

/**
 * Mixes every channel to mono, packs the frames into fixed size blocks, and
 * posts each full block. A final step posts the part filled block as well, so
 * the last frames of a take never wait for a block that will not come. The
 * context time stamps the block's first frame.
 */
export function stepChunker(
	state: ChunkState,
	channels: readonly Float32Array[] | undefined,
	contextTime: number,
	emit: (chunk: EmittedChunk) => void,
	final: boolean
): void {
	const source = channels ?? []
	const length = source.length > 0 ? source[0].length : 0
	let read = 0
	while (read < length) {
		if (state.filled === 0) state.blockStart = contextTime
		const room = state.frames - state.filled
		const take = Math.min(room, length - read)
		for (let index = 0; index < take; index += 1) {
			let sum = 0
			for (let channel = 0; channel < source.length; channel += 1) {
				sum = sum + source[channel][read + index]
			}
			state.buffer[state.filled + index] = sum / source.length
		}
		state.filled = state.filled + take
		read = read + take
		if (state.filled === state.frames) {
			emit({
				samples: state.buffer.slice(0, state.filled),
				offset: state.offset,
				contextTime: state.blockStart,
				final: false
			})
			state.offset = state.offset + state.filled
			state.filled = 0
			state.blockStart = 0
		}
	}
	if (final === true) {
		emit({
			samples: state.buffer.slice(0, state.filled),
			offset: state.offset,
			contextTime: state.blockStart,
			final: true
		})
		state.offset = state.offset + state.filled
		state.filled = 0
		state.blockStart = 0
	}
}
