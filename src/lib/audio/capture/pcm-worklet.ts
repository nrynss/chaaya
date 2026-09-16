import { createChunkState, stepChunker } from "./chunker"

/** The name the PCM processor registers under on the audio thread. */
export const CAPTURE_PROCESSOR_NAME = "chaaya-capture"

/** The block size in frames the processor falls back to when a caller names
 * none. The recorder always names one, so this only guards a stray call. */
const DEFAULT_BLOCK_FRAMES = 4096

/** The frames in one render quantum, the length the audio thread calls with.
 * The default block size is a multiple of it, so a silent quantum holds a
 * take in step with the clock when its input runs out. */
const QUANTUM_FRAMES = 128

/**
 * The processor the PCM mode runs on the audio thread. It mixes the input to
 * mono and posts fixed size blocks, each tagged with its frame offset and the
 * clock reading of its first frame. The mixdown and the packing live in the
 * chunker module, and the processor carries that module's own source text, so
 * one implementation runs on either thread.
 *
 * A worklet file ships as a string because a bundled library cannot point a
 * consumer at a stable asset URL. The recorder hands this text to a blob URL
 * and registers it with the audio context.
 */
export const CAPTURE_PROCESSOR_SOURCE = `
const CHUNKER_DEFAULT_FRAMES = ${DEFAULT_BLOCK_FRAMES}
const SILENCE = new Float32Array(${QUANTUM_FRAMES})
const makeChunkState = ${createChunkState.toString()}
const runChunker = ${stepChunker.toString()}
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const settings = (options && options.processorOptions) || {}
    const frames = settings.chunkFrames
    this.state = makeChunkState(frames > 0 ? frames : CHUNKER_DEFAULT_FRAMES)
    this.done = false
    this.port.onmessage = (event) => {
      if (event.data !== "stop") return
      runChunker(this.state, [], currentTime, (chunk) => this.port.postMessage(chunk), true)
      this.done = true
    }
  }
  process(inputs) {
    if (this.done) return false
    const input = inputs[0]
    /* Some engines hand no channel at all once the source runs out, while the
     * take still runs. A silent quantum keeps the take in step with the clock. */
    const channels = input && input.length > 0 ? input : [SILENCE]
    runChunker(this.state, channels, currentTime, (chunk) => this.port.postMessage(chunk), false)
    return true
  }
}
registerProcessor(${JSON.stringify(CAPTURE_PROCESSOR_NAME)}, CaptureProcessor)
`
