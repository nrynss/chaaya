import type { CaptureChunk } from "./types.js";
/**
 * Rate conversion for a captured take. The audio thread renders at the rate
 * its context runs at, which a browser may set from the device rather than
 * from the requested rate. These functions bring the frames to the rate the
 * take declares, so a player reads them at the right speed.
 */
/** Resamples mono frames to another rate by linear interpolation. Equal rates
 * hand the same array straight back, because no frame has to move. */
export declare function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array;
/**
 * Resamples every block of a take and renumbers the offsets. Equal rates hand
 * the same list back, so a take that already matches costs nothing.
 */
export declare function resampleChunks(chunks: readonly CaptureChunk[], fromRate: number, toRate: number): readonly CaptureChunk[];
