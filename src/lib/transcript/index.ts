/**
 * The transcript module. Timed words, word ranges, and the editor that cuts
 * them, maps between the source timeline and the edited one, and draws the
 * cuts as waveform regions. A follower binds the words to a player. A bridge
 * folds a generic timed-word stream into the editor's word list.
 */

export { TranscriptEditor, type Anchor, type RevertMiss } from "./editor.svelte.js"
export { TranscriptFollower, type TranscriptClock } from "./follow.svelte.js"
export {
	activeWordAt,
	cutSpans,
	editedEnd,
	editedLength,
	editedStart,
	mergeRanges,
	normalizeRange,
	skipCutAt,
	toEditedTime,
	toSourceTime
} from "./transcript.js"
export {
	bucketAtTime,
	bucketEndTime,
	bucketStartTime,
	regionAt,
	regionsFromCuts
} from "./regions.js"
export type { WaveformRegion } from "./regions.js"
export { createTranscriptBridge } from "./stream.js"
export type {
	TimedWordInput,
	TranscriptApply,
	TranscriptBridge,
	TranscriptBridgeOptions,
	TranscriptFrame
} from "./stream.js"
