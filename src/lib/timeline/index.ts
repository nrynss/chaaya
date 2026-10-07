/**
 * The timeline module. Geometry maps seconds to pixels under zoom and
 * scroll. Edit maths moves and resizes a segment against snap targets,
 * bounds, a minimum length, and neighbours. A reactive scale holds the state
 * one consumer shares, and a handle turns any element into an edge or body
 * control with pointer and keyboard paths. The module draws nothing.
 */

export { timelineHandle } from "./handle.js"
export type { TimelineAttachment, TimelineHandleKind, TimelineHandleOptions } from "./handle.js"
export { moveSegment, resizeSegment } from "./edit.js"
export type {
	EditLimits,
	EditResult,
	TimelineBounds,
	TimelineEdge,
	TimelineSegment
} from "./edit.js"
export { chooseTicks, createScale, pixelsToSeconds, secondsToPixels, zoomScale } from "./scale.js"
export { visibleRange } from "./scale.js"
export type { TimeScale, VisibleRange } from "./scale.js"
export { TimelineScale } from "./state.svelte.js"
