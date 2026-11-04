/**
 * Timeline edit maths. A segment moves or resizes against snap targets, then
 * stays inside bounds, keeps a minimum length, and keeps clear of neighbours.
 * Every function here is pure and reports the target it snapped to, so the
 * handle wrapper stays thin and the assertions stay exact.
 */
/** One span on the timeline, in seconds. The end stays past the start. */
export interface TimelineSegment {
    readonly start: number;
    readonly end: number;
}
/** The seconds a segment may cover. The end stays past the start. */
export interface TimelineBounds {
    readonly start: number;
    readonly end: number;
}
/** Which edge a resize moves. */
export type TimelineEdge = "start" | "end";
/** The limits a move or a resize obeys. */
export interface EditLimits {
    /** The seconds the segment must stay inside. */
    readonly bounds: TimelineBounds;
    /** The spans the segment must not overlap. It holds no nulls. */
    readonly neighbours?: readonly TimelineSegment[];
    /** The seconds an edge snaps to. It holds no nulls. */
    readonly snapTargets?: readonly number[];
    /** How far in seconds an edge reaches for a target. Zero or less
     * disables snapping, and the default is zero. */
    readonly snapThreshold?: number;
    /** The shortest span a resize keeps. Negative values read as zero, and
     * the default is zero. A move keeps its length, so this only binds a
     * resize. Bounds and neighbours bind first, so an overlong minimum
     * keeps the room. */
    readonly minLength?: number;
}
/** A move or a resize result. */
export interface EditResult {
    /** The placed segment. */
    readonly segment: TimelineSegment;
    /** The target the moving edge snapped to, or null with no snap. */
    readonly snappedTo: number | null;
}
/**
 * Move a segment by a delta. Both edges snap, so either edge can catch a
 * target. Bounds and neighbours then clamp the span, keeping its length.
 * A clamp that pulls the span off its target clears the report, so the
 * report only names a target the span rests on.
 */
export declare function moveSegment(segment: TimelineSegment, deltaSeconds: number, limits: EditLimits): EditResult;
/**
 * Resize one edge of a segment by a delta. Only the moving edge snaps. The
 * edge stays inside the room its neighbours leave, inside bounds, and at
 * least the minimum length from the far edge. The room binds first, so a
 * minimum longer than the room keeps the room instead of leaving bounds.
 * A clamp that pulls the edge off its target clears the report, so the
 * report only names a target the edge rests on.
 */
export declare function resizeSegment(segment: TimelineSegment, edge: TimelineEdge, deltaSeconds: number, limits: EditLimits): EditResult;
