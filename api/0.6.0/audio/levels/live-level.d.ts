import { Notifier } from "../../core/observable.js";
import { type Level } from "./measure.js";
/** A live level meter fed by an analyser. The meter reads one block per
 * animation frame while a watcher holds it, and stops the frame loop when
 * the last watcher leaves, so an idle meter costs nothing.
 *
 * The meter is an observable. Each read notifies once, so a watched meter
 * notifies once per animation frame, the cadence it samples at. */
export declare class LiveLevel extends Notifier {
    #private;
    /** The root mean square level of the last read, in decibels. */
    get rmsDb(): number;
    /** The peak level of the last read, in decibels. */
    get peakDb(): number;
    /** True while the frame loop runs. */
    get running(): boolean;
    constructor(analyser: AnalyserNode);
    /** Read one block now and publish the result. */
    read(): Level;
    /** Watch the meter, and get back a function that stops watching. The
     * frame loop runs only while at least one watcher holds it. */
    watch(): () => void;
}
