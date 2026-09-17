import type { CaptureChunk } from "./types.js";
/** Resamples mono frames to another rate. Equal rates hand the same array
 * straight back, because no frame has to move. An integer downsampling ratio
 * filters before it decimates, so content above the new Nyquist rate cannot
 * fold back into the voice band. A ratio built from halves and thirds runs
 * one filter stage per step, and any leftover ratio interpolates instead.
 * Any other ratio interpolates from the source frames. */
export declare function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array;
/**
 * Resamples every block of a take and renumbers the offsets. Equal rates hand
 * the same list back, so a take that already matches costs nothing.
 */
export declare function resampleChunks(chunks: readonly CaptureChunk[], fromRate: number, toRate: number): readonly CaptureChunk[];
