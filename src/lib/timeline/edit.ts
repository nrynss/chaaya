/**
 * Timeline edit maths. A segment moves or resizes against snap targets, then
 * stays inside bounds, keeps a minimum length, and keeps clear of neighbours.
 * Every function here is pure and reports the target it snapped to, so the
 * handle wrapper stays thin and the assertions stay exact.
 */

/** One span on the timeline, in seconds. The end stays past the start. */
export interface TimelineSegment {
	readonly start: number
	readonly end: number
}

/** The seconds a segment may cover. The end stays past the start. */
export interface TimelineBounds {
	readonly start: number
	readonly end: number
}

/** Which edge a resize moves. */
export type TimelineEdge = "start" | "end"

/** The limits a move or a resize obeys. */
export interface EditLimits {
	/** The seconds the segment must stay inside. */
	readonly bounds: TimelineBounds
	/** The spans the segment must not overlap. It holds no nulls. */
	readonly neighbours?: readonly TimelineSegment[]
	/** The seconds an edge snaps to. It holds no nulls. */
	readonly snapTargets?: readonly number[]
	/** How far in seconds an edge reaches for a target. Zero or less
	 * disables snapping, and the default is zero. */
	readonly snapThreshold?: number
	/** The shortest span a resize keeps. Negative values read as zero, and
	 * the default is zero. A move keeps its length, so this only binds a
	 * resize. Bounds and neighbours bind first, so an overlong minimum
	 * keeps the room. */
	readonly minLength?: number
}

/** A move or a resize result. */
export interface EditResult {
	/** The placed segment. */
	readonly segment: TimelineSegment
	/** The target the moving edge snapped to, or null with no snap. */
	readonly snappedTo: number | null
}

/** Read a validated segment, so every edit starts from a real span. */
function validSegment(segment: TimelineSegment): TimelineSegment {
	if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
		throw new RangeError("a segment needs two finite edges")
	}
	if (!(segment.end > segment.start)) {
		throw new RangeError("a segment end must sit past its start")
	}
	return segment
}

/** Read validated bounds, so every clamp has a real span to hold. */
function validBounds(bounds: TimelineBounds): TimelineBounds {
	if (!Number.isFinite(bounds.start) || !Number.isFinite(bounds.end)) {
		throw new RangeError("bounds need two finite edges")
	}
	if (!(bounds.end > bounds.start)) {
		throw new RangeError("a bounds end must sit past its start")
	}
	return bounds
}

/** Read a finite delta, so a NaN drag never enters the maths. */
function validDelta(deltaSeconds: number): number {
	if (!Number.isFinite(deltaSeconds)) {
		throw new RangeError("a delta must be finite")
	}
	return deltaSeconds
}

/**
 * Read the room a span may cover. The low edge is the later of the bounds
 * start and any neighbour end at or before the span start. The high edge is
 * the earlier of the bounds end and any neighbour start at or past the span
 * end. A neighbour that already overlaps the span constrains nothing, so a
 * stale list cannot trap the span.
 */
function roomFor(
	segment: TimelineSegment,
	bounds: TimelineBounds,
	neighbours: readonly TimelineSegment[]
): { low: number; high: number } {
	let low = bounds.start
	let high = bounds.end
	for (const other of neighbours) {
		if (other.end <= segment.start) {
			low = Math.max(low, other.end)
		} else if (other.start >= segment.end) {
			high = Math.min(high, other.start)
		}
	}
	return { low, high }
}

/** The shift that lands one of the positions on a target, with its target. */
interface SnapShift {
	readonly shift: number
	readonly target: number
}

/**
 * Find the smallest shift that lands one of the moving positions on a
 * target within the threshold. The first target wins a tie, so the result
 * stays stable when two targets sit equally near. A threshold at or below
 * zero, or an empty target list, reads null, which disables snapping.
 */
function nearestShift(
	positions: readonly number[],
	targets: readonly number[],
	threshold: number
): SnapShift | null {
	if (!(threshold > 0)) return null
	let best: SnapShift | null = null
	for (const target of targets) {
		if (!Number.isFinite(target)) continue
		for (const position of positions) {
			const shift = target - position
			if (Math.abs(shift) <= threshold) {
				if (best === null || Math.abs(shift) < Math.abs(best.shift)) {
					best = { shift, target }
				}
			}
		}
	}
	return best
}

/**
 * Move a segment by a delta. Both edges snap, so either edge can catch a
 * target. Bounds and neighbours then clamp the span, keeping its length.
 * A clamp that pulls the span off its target clears the report, so the
 * report only names a target the span rests on.
 */
export function moveSegment(
	segment: TimelineSegment,
	deltaSeconds: number,
	limits: EditLimits
): EditResult {
	const valid = validSegment(segment)
	const delta = validDelta(deltaSeconds)
	const bounds = validBounds(limits.bounds)
	const neighbours = limits.neighbours ?? []
	const targets = limits.snapTargets ?? []
	const threshold = limits.snapThreshold ?? 0
	const length = valid.end - valid.start

	let placed = valid.start + delta
	let snappedTo: number | null = null
	const snap = nearestShift([placed, placed + length], targets, threshold)
	if (snap !== null) {
		placed += snap.shift
		snappedTo = snap.target
	}
	const { low, high } = roomFor(valid, bounds, neighbours)
	const top = Math.max(low, high - length)
	const clamped = Math.min(Math.max(placed, low), top)
	if (clamped !== placed) snappedTo = null
	return { segment: { start: clamped, end: clamped + length }, snappedTo }
}

/**
 * Resize one edge of a segment by a delta. Only the moving edge snaps. The
 * edge stays inside the room its neighbours leave, inside bounds, and at
 * least the minimum length from the far edge. The room binds first, so a
 * minimum longer than the room keeps the room instead of leaving bounds.
 * A clamp that pulls the edge off its target clears the report, so the
 * report only names a target the edge rests on.
 */
export function resizeSegment(
	segment: TimelineSegment,
	edge: TimelineEdge,
	deltaSeconds: number,
	limits: EditLimits
): EditResult {
	const valid = validSegment(segment)
	if (edge !== "start" && edge !== "end") {
		throw new RangeError("an edge is start or end")
	}
	const delta = validDelta(deltaSeconds)
	const bounds = validBounds(limits.bounds)
	const neighbours = limits.neighbours ?? []
	const targets = limits.snapTargets ?? []
	const threshold = limits.snapThreshold ?? 0
	const minimum = Math.max(0, limits.minLength ?? 0)
	const { low, high } = roomFor(valid, bounds, neighbours)

	if (edge === "start") {
		const desired = valid.start + delta
		let placed = desired
		let snappedTo: number | null = null
		const snap = nearestShift([desired], targets, threshold)
		if (snap !== null) {
			placed += snap.shift
			snappedTo = snap.target
		}
		const clamped = Math.min(Math.max(placed, low), Math.max(valid.end - minimum, low))
		if (clamped !== placed) snappedTo = null
		return { segment: { start: clamped, end: valid.end }, snappedTo }
	}
	const desired = valid.end + delta
	let placed = desired
	let snappedTo: number | null = null
	const snap = nearestShift([desired], targets, threshold)
	if (snap !== null) {
		placed += snap.shift
		snappedTo = snap.target
	}
	const clamped = Math.max(Math.min(placed, high), Math.min(valid.start + minimum, high))
	if (clamped !== placed) snappedTo = null
	return { segment: { start: valid.start, end: clamped }, snappedTo }
}
