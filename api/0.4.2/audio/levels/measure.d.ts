/** Level measurement for a block of audio samples. The meter reports root
 * mean square and peak amplitude, each as decibels relative to full scale. */
/** The quietest level the meter reports. A digital silence reads this value
 * rather than negative infinity, so a display keeps a number to show. */
export declare const QUIET_DB = -100;
/** Convert a linear amplitude to decibels relative to full scale. An
 * amplitude at or below zero reads QUIET_DB. */
export declare function toDbfs(amplitude: number): number;
/** The largest absolute sample in a block, the peak amplitude. */
export declare function peakAmplitude(samples: Float32Array): number;
/** The average sample power in a block, expressed as the root mean square. */
export declare function rmsAmplitude(samples: Float32Array): number;
/** One level reading, in decibels relative to full scale. */
export interface Level {
    rmsDb: number;
    peakDb: number;
}
/** Measure one block of samples into a level reading. */
export declare function measureBlock(samples: Float32Array): Level;
/** Read the current time domain block from an analyser and measure it. The
 * caller owns the buffer, so a meter reuses one allocation. */
export declare function measureAnalyser(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): Level;
