/**
 * The observable timeline scale. A consumer builds one scale and lets its
 * ruler, its tracks, and its playhead read from it, so zoom and scroll stay
 * in one place. The maths lives in the pure scale module, and this class
 * only holds the state the view writes. It imports no framework. A Svelte
 * view wraps it in `reactive` from `@nrynss/chaaya/svelte`.
 */

import { Notifier } from "../core/observable.js"
import {
	chooseTicks,
	createScale,
	pixelsToSeconds,
	secondsToPixels,
	visibleRange,
	zoomScale,
	type TimeScale,
	type VisibleRange
} from "./scale.js"

/**
 * One observable scale. Building one validates the density and the scroll, so
 * a bad value fails at construction and never reaches the view. A write that
 * changes a value notifies subscribers once. A write of the value already
 * held does not notify.
 */
export class TimelineScale extends Notifier {
	#pixelsPerSecond: number
	#scrollSeconds: number

	constructor(pixelsPerSecond = 100, scrollSeconds = 0) {
		super()
		const scale = createScale(pixelsPerSecond, scrollSeconds)
		this.#pixelsPerSecond = scale.pixelsPerSecond
		this.#scrollSeconds = scale.scrollSeconds
	}

	/** How many pixels one second covers. */
	get pixelsPerSecond(): number {
		return this.#pixelsPerSecond
	}

	set pixelsPerSecond(value: number) {
		this.#write(value, this.#scrollSeconds)
	}

	/** The second pinned to the left edge. */
	get scrollSeconds(): number {
		return this.#scrollSeconds
	}

	set scrollSeconds(value: number) {
		this.#write(this.#pixelsPerSecond, value)
	}

	/** The plain scale this state holds. */
	get scale(): TimeScale {
		return { pixelsPerSecond: this.#pixelsPerSecond, scrollSeconds: this.#scrollSeconds }
	}

	/** Read the pixel for a second. */
	secondsToPixels(time: number): number {
		return secondsToPixels(time, this.scale)
	}

	/** Read the second for a pixel. */
	pixelsToSeconds(pixels: number): number {
		return pixelsToSeconds(pixels, this.scale)
	}

	/** Read the seconds on screen for a viewport width. */
	visible(viewportPixels: number): VisibleRange {
		return visibleRange(this.scale, viewportPixels)
	}

	/** Zoom about an anchor second, keeping the anchor on its pixel. Density
	 * and scroll move together, so subscribers hear one change. */
	zoom(factor: number, anchorTime: number): void {
		const next = zoomScale(this.scale, factor, anchorTime)
		this.#write(next.pixelsPerSecond, next.scrollSeconds)
	}

	/** Choose ruler ticks for a span and a target spacing in pixels. */
	ticks(start: number, end: number, targetSpacingPixels: number): number[] {
		return chooseTicks(start, end, targetSpacingPixels, this.#pixelsPerSecond)
	}

	/** Store both fields and notify once when either changed. A write is not
	 * validated, the same as the field it replaces. */
	#write(pixelsPerSecond: number, scrollSeconds: number): void {
		if (Object.is(pixelsPerSecond, this.#pixelsPerSecond) && Object.is(scrollSeconds, this.#scrollSeconds)) {
			return
		}
		this.#pixelsPerSecond = pixelsPerSecond
		this.#scrollSeconds = scrollSeconds
		this.notify()
	}
}
