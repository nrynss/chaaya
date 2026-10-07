/**
 * The timeline handle. It turns any element into an edge or body handle for
 * one segment, and it draws nothing. A move handle drags the whole span, and
 * a start or end handle drags one edge. Pointer drag uses capture, Escape
 * cancels back to the start, and release commits. Arrow keys nudge, Shift
 * steps coarse, and Alt steps fine. The handle owns the role, the value, and
 * the spoken time, so the consumer only draws.
 */

import {
	moveSegment,
	resizeSegment,
	type EditLimits,
	type TimelineBounds,
	type TimelineSegment
} from "./edit.js"

/** What a handle drags. A move drags the span, an edge drags one end. */
export type TimelineHandleKind = "move" | "start" | "end"

/**
 * An attachment turning an element into a handle. It matches the shape the
 * attach tag reads, so a consumer attaches it directly. The type lives here
 * rather than on the framework, so the packed declarations resolve without
 * it.
 */
export interface TimelineAttachment<T extends EventTarget = Element> {
	(element: T): void | (() => void)
}

/** What a handle needs to drag one segment. */
export interface TimelineHandleOptions {
	/** What the handle drags. */
	readonly kind: TimelineHandleKind
	/** The segment at attach time. The handle reads live state through read
	 * after that. Passing the start value here keeps the attach free of
	 * signal reads, so a preview never reinstalls the handle mid drag. */
	readonly initial: TimelineSegment
	/** Read the live segment. A getter keeps the handle honest while the
	 * consumer edits elsewhere. */
	readonly read: () => TimelineSegment
	/** Read the live density in pixels per second. A getter keeps pointer
	 * deltas honest across zoom. */
	readonly pixelsPerSecond: () => number
	/** The seconds the segment must stay inside. */
	readonly bounds: TimelineBounds
	/** Read the spans the segment must not overlap. It holds no nulls. */
	readonly neighbours?: () => readonly TimelineSegment[]
	/** Read the seconds an edge snaps to. It holds no nulls. */
	readonly snapTargets?: () => readonly number[]
	/** How far in seconds an edge reaches for a target. Zero or less
	 * disables snapping, and the default is zero. */
	readonly snapThreshold?: number
	/** The shortest span a resize keeps. The default is zero. */
	readonly minLength?: number
	/** Seconds per arrow press. The default is a tenth of a second. */
	readonly step?: number
	/** Seconds per arrow press with Shift held. The default is one second. */
	readonly coarseStep?: number
	/** Seconds per arrow press with Alt held. The default is a hundredth of
	 * a second. */
	readonly fineStep?: number
	/** The accessible name. A getter renames the handle as it moves. A getter
	 * must not read reactive state, because the attach runs inside a
	 * reactive effect and such a read would reinstall the handle. */
	readonly label: string | (() => string)
	/** Spell a second for the spoken value text. The default names seconds
	 * to two places. */
	readonly formatTime?: (time: number) => string
	/** Hear each move while it previews, with the target it snapped to. */
	readonly onPreview?: (segment: TimelineSegment, snappedTo: number | null) => void
	/** Hear the segment when a drag or a key press lands. */
	readonly onCommit?: (segment: TimelineSegment, snappedTo: number | null) => void
	/** Hear the start segment when Escape cancels. The consumer restores it. */
	readonly onCancel?: (segment: TimelineSegment) => void
}

/** Read a positive step, falling back when the caller passes none. */
function validStep(value: number | undefined, fallback: number): number {
	if (value === undefined || !(value > 0) || !Number.isFinite(value)) return fallback
	return value
}

/**
 * Turn any element into a timeline handle. The element keeps its markup and
 * its look, and the handle only owns behaviour, focus, and the spoken time.
 * Use it with the attach tag, so the consumer draws the timeline and Chaaya
 * moves it.
 */
export function timelineHandle(options: TimelineHandleOptions): TimelineAttachment<HTMLElement> {
	const role = options.kind === "move" ? "slider" : "separator"
	const step = validStep(options.step, 0.1)
	const coarseStep = validStep(options.coarseStep, 1)
	const fineStep = validStep(options.fineStep, 0.01)
	const formatTime = options.formatTime ?? ((time: number) => `${time.toFixed(2)} seconds`)

	return (element: HTMLElement): void | (() => void) => {
		/* Svelte runs an attachment inside a reactive effect, so a signal
		 * read here would resubscribe the attachment and rerun it on every
		 * preview. The attach only reads the plain initial value, and later
		 * reads run from event handlers, which track nothing. */
		let dragging = false
		let cancelled = false
		let origin: TimelineSegment = options.initial
		let originX = 0
		let pending: TimelineSegment = options.initial
		let pendingSnap: number | null = null
		let focusStart: TimelineSegment = options.initial

		/** Read the limits live, so a neighbour edit mid drag still binds. */
		function limits(): EditLimits {
			return {
				bounds: options.bounds,
				neighbours: options.neighbours?.() ?? [],
				snapTargets: options.snapTargets?.() ?? [],
				snapThreshold: options.snapThreshold ?? 0,
				minLength: options.minLength ?? 0
			}
		}

		/** Read the value this handle reports, which is its edge in time. */
		function valueOf(segment: TimelineSegment): number {
			if (options.kind === "start") return segment.start
			if (options.kind === "end") return segment.end
			return segment.start
		}

		/** Publish the role, the value, and the spoken time. */
		function refresh(segment: TimelineSegment): void {
			const label = typeof options.label === "function" ? options.label() : options.label
			const value = valueOf(segment)
			element.setAttribute("role", role)
			element.setAttribute("aria-label", label)
			element.setAttribute("aria-orientation", "horizontal")
			element.setAttribute("aria-valuemin", String(options.bounds.start))
			element.setAttribute("aria-valuemax", String(options.bounds.end))
			element.setAttribute("aria-valuenow", String(value))
			element.setAttribute("aria-valuetext", formatTime(value))
		}

		/** Drag the origin by a delta in seconds and preview the result. */
		function dragBy(deltaSeconds: number): void {
			const result =
				options.kind === "move"
					? moveSegment(origin, deltaSeconds, limits())
					: resizeSegment(origin, options.kind, deltaSeconds, limits())
			pending = result.segment
			pendingSnap = result.snappedTo
			options.onPreview?.(pending, pendingSnap)
			refresh(pending)
		}

		function onPointerDown(event: PointerEvent): void {
			if (event.pointerType === "mouse" && event.button !== 0) return
			if (dragging) return
			dragging = true
			cancelled = false
			origin = options.read()
			pending = origin
			pendingSnap = null
			originX = event.clientX
			try {
				element.setPointerCapture(event.pointerId)
			} catch {
				// Capture stays implicit, and the window listener still fires.
			}
			/* The pointer may leave the element mid drag, so the move and
			 * release listeners ride the window until the drag lands. */
			window.addEventListener("pointermove", onPointerMove)
			window.addEventListener("pointerup", onPointerUp)
			window.addEventListener("pointercancel", onPointerCancel)
			element.focus({ preventScroll: true })
			refresh(origin)
		}

		/** Drop the window listeners a drag added. */
		function stopWindow(): void {
			window.removeEventListener("pointermove", onPointerMove)
			window.removeEventListener("pointerup", onPointerUp)
			window.removeEventListener("pointercancel", onPointerCancel)
		}

		function onPointerMove(event: PointerEvent): void {
			if (!dragging || cancelled) return
			const density = options.pixelsPerSecond()
			if (!(density > 0) || !Number.isFinite(density)) return
			dragBy((event.clientX - originX) / density)
		}

		function onPointerUp(event: PointerEvent): void {
			if (!dragging) return
			dragging = false
			stopWindow()
			if (cancelled) return
			try {
				if (element.hasPointerCapture(event.pointerId)) {
					element.releasePointerCapture(event.pointerId)
				}
			} catch {
				// The capture already went, and the commit still lands.
			}
			options.onCommit?.(pending, pendingSnap)
			refresh(pending)
		}

		function onPointerCancel(): void {
			if (!dragging) return
			dragging = false
			stopWindow()
			cancelled = true
			options.onCancel?.(origin)
			refresh(origin)
		}

		/** Cancel back to the start, whether a drag runs or keys landed. */
		function cancel(): void {
			const restore = dragging ? origin : focusStart
			dragging = false
			cancelled = true
			stopWindow()
			pending = restore
			pendingSnap = null
			options.onCancel?.(restore)
			refresh(restore)
		}

		function onKeyDown(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				event.preventDefault()
				cancel()
				return
			}
			let direction: number
			if (event.key === "ArrowRight" || event.key === "ArrowUp") direction = 1
			else if (event.key === "ArrowLeft" || event.key === "ArrowDown") direction = -1
			else return
			if (dragging) return
			event.preventDefault()
			const stride = event.altKey ? fineStep : event.shiftKey ? coarseStep : step
			const from = options.read()
			const result =
				options.kind === "move"
					? moveSegment(from, direction * stride, limits())
					: resizeSegment(from, options.kind, direction * stride, limits())
			pending = result.segment
			pendingSnap = result.snappedTo
			options.onPreview?.(pending, pendingSnap)
			options.onCommit?.(pending, pendingSnap)
			refresh(pending)
		}

		/** Reread the live segment on focus, so the handle never announces a
		 * time a sibling handle moved while this one sat idle. */
		function onFocusIn(): void {
			focusStart = options.read()
			refresh(focusStart)
		}

		if (!element.hasAttribute("tabindex")) {
			element.setAttribute("tabindex", "0")
		}
		refresh(options.initial)

		element.addEventListener("pointerdown", onPointerDown)
		element.addEventListener("keydown", onKeyDown)
		element.addEventListener("focusin", onFocusIn)
		return () => {
			stopWindow()
			element.removeEventListener("pointerdown", onPointerDown)
			element.removeEventListener("keydown", onKeyDown)
			element.removeEventListener("focusin", onFocusIn)
		}
	}
}
