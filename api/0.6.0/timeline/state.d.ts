/**
 * The observable timeline scale. A consumer builds one scale and lets its
 * ruler, its tracks, and its playhead read from it, so zoom and scroll stay
 * in one place. The maths lives in the pure scale module, and this class
 * only holds the state the view writes. It imports no framework. A Svelte
 * view wraps it in `reactive` from `@nrynss/chaaya/svelte`.
 */
import { Notifier } from "../core/observable.js";
import { type TimeScale, type VisibleRange } from "./scale.js";
/**
 * One observable scale. Building one validates the density and the scroll, so
 * a bad value fails at construction and never reaches the view. A write that
 * changes a value notifies subscribers once. A write of the value already
 * held does not notify.
 */
export declare class TimelineScale extends Notifier {
    #private;
    constructor(pixelsPerSecond?: number, scrollSeconds?: number);
    /** How many pixels one second covers. */
    get pixelsPerSecond(): number;
    set pixelsPerSecond(value: number);
    /** The second pinned to the left edge. */
    get scrollSeconds(): number;
    set scrollSeconds(value: number);
    /** The plain scale this state holds. */
    get scale(): TimeScale;
    /** Read the pixel for a second. */
    secondsToPixels(time: number): number;
    /** Read the second for a pixel. */
    pixelsToSeconds(pixels: number): number;
    /** Read the seconds on screen for a viewport width. */
    visible(viewportPixels: number): VisibleRange;
    /** Zoom about an anchor second, keeping the anchor on its pixel. Density
     * and scroll move together, so subscribers hear one change. */
    zoom(factor: number, anchorTime: number): void;
    /** Choose ruler ticks for a span and a target spacing in pixels. */
    ticks(start: number, end: number, targetSpacingPixels: number): number[];
}
