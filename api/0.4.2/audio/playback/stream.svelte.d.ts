/** One block the player placed on the context clock. */
export interface ScheduledBlock {
    /** The context time the block starts at, in seconds. */
    readonly startTime: number;
    /** The context time the block ends at, in seconds. */
    readonly endTime: number;
    /** True when silence the scheduler could not avoid opens before the block. */
    readonly underrun: boolean;
}
/** The knobs a caller sets on a stream player. */
export interface StreamPlayerOptions {
    /** The context the player schedules on. The player never closes it. */
    readonly context: AudioContext;
    /** The rate arriving blocks are in, in hertz. Defaults to the context rate. */
    readonly streamRate?: number;
    /** How far ahead of now a late block starts, in seconds. Defaults to 0.05. */
    readonly leadSeconds?: number;
    /** Where scheduled audio goes. Defaults to the context destination. */
    readonly destination?: AudioNode;
}
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
export declare class PcmStreamPlayer {
    #private;
    /** Every block placed so far, in order, on the context clock. */
    blocks: ScheduledBlock[];
    /** The cut time of the last flush, or null before the first one. */
    lastCut: number | null;
    /** How many placed blocks opened with a gap before them. */
    get underruns(): number;
    constructor(options: StreamPlayerOptions);
    /**
     * Schedule one block of mono frames and report its span. Consecutive
     * blocks abut with no gap. An empty block schedules nothing and leaves
     * the schedule where it stands.
     */
    push(samples: Float32Array): ScheduledBlock;
    /**
     * Stop every live source and cut the schedule. A source already playing
     * stops at the cut, and a source still waiting never sounds. The next
     * push starts fresh at now plus the lead. Returns the cut time.
     */
    flush(): number;
}
