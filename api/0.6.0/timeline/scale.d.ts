/**
 * Timeline geometry. A scale maps seconds to pixels under zoom and scroll,
 * and back again. Ruler ticks fall on round steps for a target spacing, so a
 * consumer draws them without owning the maths. Every function here is pure,
 * which keeps the browser wrappers thin and the assertions exact.
 */
/** How a timeline maps seconds onto pixels. */
export interface TimeScale {
    /** How many pixels one second covers. It stays finite and positive. */
    readonly pixelsPerSecond: number;
    /** The second pinned to the left edge. It stays finite. */
    readonly scrollSeconds: number;
}
/** The seconds on screen for a viewport width. */
export interface VisibleRange {
    /** The second at the left edge. */
    readonly start: number;
    /** The second at the right edge. */
    readonly end: number;
}
/**
 * Build a scale. A non finite or non positive density throws, and a non
 * finite scroll throws, so no later mapping divides by zero or drifts.
 */
export declare function createScale(pixelsPerSecond: number, scrollSeconds?: number): TimeScale;
/**
 * Read the pixel for a second. The scroll second reads zero, and later
 * seconds read right of it, so a consumer positions one source of truth.
 */
export declare function secondsToPixels(time: number, scale: TimeScale): number;
/**
 * Read the second for a pixel. This inverts the forward map exactly, so a
 * pointer offset turns back into seconds without a second rounding.
 */
export declare function pixelsToSeconds(pixels: number, scale: TimeScale): number;
/**
 * Read the seconds on screen for a viewport width. A width at or below zero
 * reads an empty range at the scroll, so a hidden timeline shows nothing.
 */
export declare function visibleRange(scale: TimeScale, viewportPixels: number): VisibleRange;
/**
 * Zoom a scale about an anchor second. The anchor keeps its pixel, so the
 * view grows around the point the person named. A factor of one reads the
 * same scale back. A non finite or non positive factor throws.
 */
export declare function zoomScale(scale: TimeScale, factor: number, anchorTime: number): TimeScale;
/**
 * Choose ruler ticks for a span. The step is the smallest round value from
 * one, two, five or ten times a power of ten that reaches the target spacing
 * in pixels, so ticks stay readable at any zoom. Ticks align to multiples of
 * the step. An empty or inverted span reads no ticks. A non positive target
 * or density throws.
 */
export declare function chooseTicks(start: number, end: number, targetSpacingPixels: number, pixelsPerSecond: number): number[];
