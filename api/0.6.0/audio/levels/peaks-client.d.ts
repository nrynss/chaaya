import { type Peaks } from "./peaks.js";
/**
 * The source text the peaks worker runs. The maths mirror the peaks
 * module, and the worker source tests hold this copy against the real
 * function on uneven channels and empty buckets.
 *
 * The copy is a full copy on purpose. A bundled build renames the peaks
 * module's private helpers, so the worker cannot borrow the function's
 * own source text at runtime. The worker also ships as a string, because
 * a bundled library cannot point a consumer at a stable asset URL. The
 * call hands the text to a blob URL and builds a classic worker from it,
 * which every engine runs without bundler support.
 */
export declare const PEAKS_WORKER_SOURCE = "\nconst sampleAt = (channel, frame) => (frame < channel.length ? channel[frame] : 0)\nconst computePeaks = (channels, buckets) => {\n  const count = Math.max(1, Math.floor(buckets))\n  const frames = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0)\n  const min = new Float32Array(count)\n  const max = new Float32Array(count)\n  for (let bucket = 0; bucket < count; bucket += 1) {\n    const start = Math.floor((bucket * frames) / count)\n    const end = Math.floor(((bucket + 1) * frames) / count)\n    let low = Infinity\n    let high = -Infinity\n    for (let frame = start; frame < end; frame += 1) {\n      for (const channel of channels) {\n        const value = sampleAt(channel, frame)\n        if (value < low) low = value\n        if (value > high) high = value\n      }\n    }\n    min[bucket] = low === Infinity ? 0 : low\n    max[bucket] = high === -Infinity ? 0 : high\n  }\n  return { min, max }\n}\nconst scope = self\nscope.onmessage = (event) => {\n  const { channels, buckets } = event.data\n  const peaks = computePeaks(channels, buckets)\n  scope.postMessage({ min: peaks.min, max: peaks.max }, [peaks.min.buffer, peaks.max.buffer])\n}\n";
/** Compute peaks in a worker so a long file never blocks the page. The call
 * transfers the channel buffers, so the caller gives up its copy and gets
 * the result back without a second allocation. */
export declare function computePeaksInWorker(channels: Float32Array[], buckets: number): Promise<Peaks>;
