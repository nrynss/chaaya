/**
 * The transcript module. Timed words, word ranges, and the editor that cuts
 * them and maps between the source timeline and the edited one.
 */
export { TranscriptEditor, type Anchor, type RevertMiss } from "./editor.svelte.js";
export { TranscriptFollower, type TranscriptClock } from "./follow.svelte.js";
export { activeWordAt, cutSpans, editedEnd, editedLength, editedStart, mergeRanges, normalizeRange, skipCutAt, toEditedTime, toSourceTime } from "./transcript.js";
export type { CutSpan, TranscriptCut, TranscriptWord, WordRange } from "./transcript.js";
