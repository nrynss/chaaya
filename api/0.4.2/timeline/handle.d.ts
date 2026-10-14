/**
 * The timeline handle. It turns any element into an edge or body handle for
 * one segment, and it draws nothing. A move handle drags the whole span, and
 * a start or end handle drags one edge. Pointer drag uses capture, Escape
 * cancels back to the start, and release commits. Arrow keys nudge, Shift
 * steps coarse, and Alt steps fine. The handle owns the role, the value, and
 * the spoken time, so the consumer only draws.
 */
import { type TimelineBounds, type TimelineSegment } from "./edit.js";
/** What a handle drags. A move drags the span, an edge drags one end. */
export type TimelineHandleKind = "move" | "start" | "end";
/**
 * An attachment turning an element into a handle. It matches the shape the
 * attach tag reads, so a consumer attaches it directly. The type lives here
 * rather than on the framework, so the packed declarations resolve without
 * it.
 */
export interface TimelineAttachment<T extends EventTarget = Element> {
    (element: T): void | (() => void);
}
/** What a handle needs to drag one segment. */
export interface TimelineHandleOptions {
    /** What the handle drags. */
    readonly kind: TimelineHandleKind;
    /** The segment at attach time. The handle reads live state through read
     * after that. Passing the start value here keeps the attach free of
     * signal reads, so a preview never reinstalls the handle mid drag. */
    readonly initial: TimelineSegment;
    /** Read the live segment. A getter keeps the handle honest while the
     * consumer edits elsewhere. */
    readonly read: () => TimelineSegment;
    /** Read the live density in pixels per second. A getter keeps pointer
     * deltas honest across zoom. */
    readonly pixelsPerSecond: () => number;
    /** The seconds the segment must stay inside. */
    readonly bounds: TimelineBounds;
    /** Read the spans the segment must not overlap. It holds no nulls. */
    readonly neighbours?: () => readonly TimelineSegment[];
    /** Read the seconds an edge snaps to. It holds no nulls. */
    readonly snapTargets?: () => readonly number[];
    /** How far in seconds an edge reaches for a target. Zero or less
     * disables snapping, and the default is zero. */
    readonly snapThreshold?: number;
    /** The shortest span a resize keeps. The default is zero. */
    readonly minLength?: number;
    /** Seconds per arrow press. The default is a tenth of a second. */
    readonly step?: number;
    /** Seconds per arrow press with Shift held. The default is one second. */
    readonly coarseStep?: number;
    /** Seconds per arrow press with Alt held. The default is a hundredth of
     * a second. */
    readonly fineStep?: number;
    /** The accessible name. A getter renames the handle as it moves. A getter
     * must not read reactive state, because the attach runs inside a
     * reactive effect and such a read would reinstall the handle. */
    readonly label: string | (() => string);
    /** Spell a second for the spoken value text. The default names seconds
     * to two places. */
    readonly formatTime?: (time: number) => string;
    /** Hear each move while it previews, with the target it snapped to. */
    readonly onPreview?: (segment: TimelineSegment, snappedTo: number | null) => void;
    /** Hear the segment when a drag or a key press lands. */
    readonly onCommit?: (segment: TimelineSegment, snappedTo: number | null) => void;
    /** Hear the start segment when Escape cancels. The consumer restores it. */
    readonly onCancel?: (segment: TimelineSegment) => void;
}
/**
 * Turn any element into a timeline handle. The element keeps its markup and
 * its look, and the handle only owns behaviour, focus, and the spoken time.
 * Use it with the attach tag, so the consumer draws the timeline and Chaaya
 * moves it.
 */
export declare function timelineHandle(options: TimelineHandleOptions): TimelineAttachment<HTMLElement>;
