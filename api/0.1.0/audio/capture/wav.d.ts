import type { CaptureChunk } from "./types.js";
/**
 * Packs mono float frames into a 16 bit PCM WAV blob at the given rate. The
 * header names the rate, the channel count and the byte length, so any decoder
 * reads the frame count straight from the file.
 */
export declare function encodeWav(chunks: readonly CaptureChunk[], sampleRate: number): Blob;
