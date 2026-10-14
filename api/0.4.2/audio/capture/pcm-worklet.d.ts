/** The name the PCM processor registers under on the audio thread. */
export declare const CAPTURE_PROCESSOR_NAME = "chaaya-capture";
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
export declare const CAPTURE_PROCESSOR_SOURCE: string;
