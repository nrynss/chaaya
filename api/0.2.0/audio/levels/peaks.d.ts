/** Peak computation over a long recording. The work belongs in a worker, so
 * a twenty minute file never blocks the page that asked for it. */
/** Min and max sample per bucket. Each bucket covers the same span of every
 * channel, so the arrays line up with a drawing of a fixed width. */
export interface Peaks {
    min: Float32Array;
    max: Float32Array;
}
/** A request for peaks. A caller sends channel data and a bucket count. */
export interface PeaksRequest {
    channels: Float32Array[];
    buckets: number;
}
/** Compute the min and max sample per bucket across every channel. A bucket
 * that covers no sample reads zero. */
export declare function computePeaks(channels: Float32Array[], buckets: number): Peaks;
