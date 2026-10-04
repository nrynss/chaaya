/** The transcript range editor. Timed words arrive at build time and cuts
 * arrive from the keyboard, so the editor keeps both and derives the edited
 * timeline from them. A later binding can play the edited timeline by
 * skipping every cut span this module reports.
 */
import { type CutSpan, type TranscriptCut, type TranscriptWord, type WordRange } from "./transcript.js";
/** Why a revert names nothing known. */
export type RevertMiss = "unknown-cut";
/** The focused word of the editor. */
export type Anchor = number | null;
/** One reactive editor over a fixed word list. Selection, extension, cut
 * and revert all run from named methods, which the view wires to keyboard
 * friendly controls. */
export declare class TranscriptEditor {
    #private;
    /** The words the editor reads, in source order. */
    readonly words: readonly TranscriptWord[];
    /** The live cuts in the order they arrived. */
    cuts: TranscriptCut[];
    /** The focused word index, or null before anything is selected. */
    anchor: Anchor;
    /** One end of the selection while it extends, or null when idle. */
    focus: Anchor;
    /** The reason the next cut carries. */
    reason: string;
    constructor(words: readonly TranscriptWord[]);
    /** The current selection as a word range, or null with nothing chosen. */
    get selection(): WordRange | null;
    /** The merged cut ranges, earliest first. */
    get merged(): WordRange[];
    /** The merged cuts in source seconds, earliest first. */
    get spans(): CutSpan[];
    /** The edited timeline length in seconds. */
    get length(): number;
    /** Focus one word. */
    select(index: number): void;
    /** Grow the selection toward a word while the anchor stays put. */
    extend(index: number): void;
    /** Move the focused word by a step, keeping the selection where it is. */
    move(step: number): void;
    /** Cut the selection with a reason and clear the selection. */
    cut(reason?: string): TranscriptCut | null;
    /** Revert one cut by id. An unknown id leaves every cut untouched. */
    revert(id: string): TranscriptCut | RevertMiss;
    /** Revert every cut. */
    revertAll(): void;
    /** Map a source second to the edited timeline. */
    toEdited(source: number): number;
    /** Map an edited second back to the source timeline. */
    toSource(edited: number): number;
    /** Read one word start on the edited timeline. */
    editedStart(index: number): number;
    /** Read one word end on the edited timeline. */
    editedEnd(index: number): number;
}
export type { CutSpan, TranscriptCut, TranscriptWord, WordRange };
