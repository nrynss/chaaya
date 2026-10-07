/**
 * The reactive timeline scale. A consumer builds one scale and lets its
 * ruler, its tracks, and its playhead read from it, so zoom and scroll stay
 * in one place. The maths lives in the pure scale module, and this class
 * only holds the state the view writes.
 */

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
 * One reactive scale. Building one validates the density and the scroll, so
 * a bad value fails at construction and never reaches the view.
 */
export class TimelineScale {
	/** How many pixels one second covers. */
	pixelsPerSecond = $state(100)
	/** The second pinned to the left edge. */
	scrollSeconds = $state(0)

	constructor(pixelsPerSecond = 100, scrollSeconds = 0) {
		const scale = createScale(pixelsPerSecond, scrollSeconds)
		this.pixelsPerSecond = scale.pixelsPerSecond
		this.scrollSeconds = scale.scrollSeconds
	}

	/** The plain scale this state holds. */
	get scale(): TimeScale {
		return { pixelsPerSecond: this.pixelsPerSecond, scrollSeconds: this.scrollSeconds }
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

	/** Zoom about an anchor second, keeping the anchor on its pixel. */
	zoom(factor: number, anchorTime: number): void {
		const next = zoomScale(this.scale, factor, anchorTime)
		this.pixelsPerSecond = next.pixelsPerSecond
		this.scrollSeconds = next.scrollSeconds
	}

	/** Choose ruler ticks for a span and a target spacing in pixels. */
	ticks(start: number, end: number, targetSpacingPixels: number): number[] {
		return chooseTicks(start, end, targetSpacingPixels, this.pixelsPerSecond)
	}
}
