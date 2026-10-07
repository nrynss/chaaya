/**
 * Timeline geometry. A scale maps seconds to pixels under zoom and scroll,
 * and back again. Ruler ticks fall on round steps for a target spacing, so a
 * consumer draws them without owning the maths. Every function here is pure,
 * which keeps the browser wrappers thin and the assertions exact.
 */

/** How a timeline maps seconds onto pixels. */
export interface TimeScale {
	/** How many pixels one second covers. It stays finite and positive. */
	readonly pixelsPerSecond: number
	/** The second pinned to the left edge. It stays finite. */
	readonly scrollSeconds: number
}

/** The seconds on screen for a viewport width. */
export interface VisibleRange {
	/** The second at the left edge. */
	readonly start: number
	/** The second at the right edge. */
	readonly end: number
}

/**
 * Build a scale. A non finite or non positive density throws, and a non
 * finite scroll throws, so no later mapping divides by zero or drifts.
 */
export function createScale(pixelsPerSecond: number, scrollSeconds = 0): TimeScale {
	if (!(pixelsPerSecond > 0) || !Number.isFinite(pixelsPerSecond)) {
		throw new RangeError(`density ${pixelsPerSecond} must be finite and positive`)
	}
	if (!Number.isFinite(scrollSeconds)) {
		throw new RangeError(`scroll ${scrollSeconds} must be finite`)
	}
	return { pixelsPerSecond, scrollSeconds }
}

/**
 * Read the pixel for a second. The scroll second reads zero, and later
 * seconds read right of it, so a consumer positions one source of truth.
 */
export function secondsToPixels(time: number, scale: TimeScale): number {
	return (time - scale.scrollSeconds) * scale.pixelsPerSecond
}

/**
 * Read the second for a pixel. This inverts the forward map exactly, so a
 * pointer offset turns back into seconds without a second rounding.
 */
export function pixelsToSeconds(pixels: number, scale: TimeScale): number {
	return pixels / scale.pixelsPerSecond + scale.scrollSeconds
}

/**
 * Read the seconds on screen for a viewport width. A width at or below zero
 * reads an empty range at the scroll, so a hidden timeline shows nothing.
 */
export function visibleRange(scale: TimeScale, viewportPixels: number): VisibleRange {
	if (!(viewportPixels > 0)) {
		return { start: scale.scrollSeconds, end: scale.scrollSeconds }
	}
	return {
		start: scale.scrollSeconds,
		end: scale.scrollSeconds + viewportPixels / scale.pixelsPerSecond
	}
}

/**
 * Zoom a scale about an anchor second. The anchor keeps its pixel, so the
 * view grows around the point the person named. A factor of one reads the
 * same scale back. A non finite or non positive factor throws.
 */
export function zoomScale(scale: TimeScale, factor: number, anchorTime: number): TimeScale {
	if (!(factor > 0) || !Number.isFinite(factor)) {
		throw new RangeError(`factor ${factor} must be finite and positive`)
	}
	if (!Number.isFinite(anchorTime)) {
		throw new RangeError(`anchor ${anchorTime} must be finite`)
	}
	const pixelsPerSecond = scale.pixelsPerSecond * factor
	const scrollSeconds = anchorTime - (anchorTime - scale.scrollSeconds) / factor
	return { pixelsPerSecond, scrollSeconds }
}

/** Read ruler ticks for a span and a target spacing. */
function collectTicks(start: number, end: number, step: number): number[] {
	const ticks: number[] = []
	const first = Math.ceil(start / step - 1e-9) * step
	for (let tick = first; tick <= end + 1e-9; tick += step) {
		ticks.push(Math.abs(tick) < 1e-9 ? 0 : tick)
	}
	return ticks
}

/**
 * Choose ruler ticks for a span. The step is the smallest round value from
 * one, two, five or ten times a power of ten that reaches the target spacing
 * in pixels, so ticks stay readable at any zoom. Ticks align to multiples of
 * the step. An empty or inverted span reads no ticks. A non positive target
 * or density throws.
 */
export function chooseTicks(
	start: number,
	end: number,
	targetSpacingPixels: number,
	pixelsPerSecond: number
): number[] {
	if (!(pixelsPerSecond > 0) || !Number.isFinite(pixelsPerSecond)) {
		throw new RangeError(`density ${pixelsPerSecond} must be finite and positive`)
	}
	if (!(targetSpacingPixels > 0) || !Number.isFinite(targetSpacingPixels)) {
		throw new RangeError(`spacing ${targetSpacingPixels} must be finite and positive`)
	}
	if (!(end > start)) return []
	const rawStep = targetSpacingPixels / pixelsPerSecond
	const base = 10 ** Math.floor(Math.log10(rawStep))
	let step = 10 * base
	for (const multiple of [1, 2, 5]) {
		const candidate = multiple * base
		if (candidate >= rawStep) {
			step = candidate
			break
		}
	}
	return collectTicks(start, end, step)
}
