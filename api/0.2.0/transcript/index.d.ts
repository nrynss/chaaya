/**
 * The transcript module. Timed words, word ranges, and the editor that cuts
 * them and maps between the source timeline and the edited one.
 */
export { TranscriptEditor, type Anchor, type RevertMiss } from "./editor.svelte.js";
export { cutSpans, editedEnd, editedLength, editedStart, mergeRanges, normalizeRange, toEditedTime, toSourceTime } from "./transcript.js";
export type { CutSpan, TranscriptCut, TranscriptWord, WordRange } from "./transcript.js";
