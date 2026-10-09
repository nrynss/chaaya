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
    readonly frames: number;
    /** The block still filling, one slot per frame. */
    readonly buffer: Float32Array;
    /** How many slots of the block hold a frame. */
    filled: number;
    /** How many frames the take has posted so far. */
    offset: number;
    /** The clock reading at the first frame of the block still filling. */
    blockStart: number;
}
/** One block of mono frames and where it sits on the audio clock. */
export interface EmittedChunk {
    /** The mono frames in the range -1 to 1. */
    readonly samples: Float32Array;
    /** How many frames came before this block on the same take. */
    readonly offset: number;
    /** The clock reading at the block's first frame, in seconds. */
    readonly contextTime: number;
    /** Whether this block closes the take. */
    readonly final: boolean;
}
/** Opens a chunk state that posts one block every `frames` frames. A size
 * below one falls back to a single frame, so a block always holds a frame. */
export declare function createChunkState(frames: number): ChunkState;
/**
 * Mixes every channel to mono, packs the frames into fixed size blocks, and
 * posts each full block. A final step posts the part filled block as well, so
 * the last frames of a take never wait for a block that will not come. The
 * context time stamps the block's first frame.
 */
export declare function stepChunker(state: ChunkState, channels: readonly Float32Array[] | undefined, contextTime: number, emit: (chunk: EmittedChunk) => void, final: boolean): void;
