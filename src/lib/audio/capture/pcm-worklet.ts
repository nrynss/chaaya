/** The name the PCM processor registers under on the audio thread. */
export const CAPTURE_PROCESSOR_NAME = "chaaya-capture"

/**
 * The processor the PCM mode runs on the audio thread. It mixes the input to
 * mono and posts fixed size blocks, each tagged with its frame offset and the
 * clock reading of its first frame.
 *
 * A worklet file ships as a string because a bundled library cannot point a
 * consumer at a stable asset URL. The recorder hands this text to a blob URL
 * and registers it with the audio context.
 */
export const CAPTURE_PROCESSOR_SOURCE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const settings = (options && options.processorOptions) || {}
    const size = settings.chunkFrames
    this.frames = size > 0 ? size : 4096
    this.buffer = new Float32Array(this.frames)
    this.filled = 0
    this.offset = 0
    this.startTime = 0
    this.done = false
    this.port.onmessage = (event) => {
      if (event.data === "stop") this.flush(true)
    }
  }
  flush(final) {
    const samples = this.buffer.slice(0, this.filled)
    this.port.postMessage({
      samples: samples,
      offset: this.offset,
      contextTime: this.startTime,
      final: final === true,
    })
    this.offset = this.offset + this.filled
    this.filled = 0
    this.startTime = 0
    if (final === true) this.done = true
  }
  process(inputs) {
    if (this.done) return false
    const channels = inputs[0]
    if (!channels || channels.length === 0 || !channels[0]) return true
    const length = channels[0].length
    let read = 0
    while (read < length) {
      if (this.filled === 0) this.startTime = currentTime
      const room = this.frames - this.filled
      const take = Math.min(room, length - read)
      for (let i = 0; i < take; i = i + 1) {
        let sum = 0
        for (let channel = 0; channel < channels.length; channel = channel + 1) {
          sum = sum + channels[channel][read + i]
        }
        this.buffer[this.filled + i] = sum / channels.length
      }
      this.filled = this.filled + take
      read = read + take
      if (this.filled === this.frames) this.flush(false)
    }
    return true
  }
}
registerProcessor(${JSON.stringify(CAPTURE_PROCESSOR_NAME)}, CaptureProcessor)
`
