import { type Level } from "./measure.js";
/** A live level meter fed by an analyser. The meter reads one block per
 * animation frame while a watcher holds it, and stops the frame loop when
 * the last watcher leaves, so an idle meter costs nothing. */
export declare class LiveLevel {
    #private;
    rmsDb: number;
    peakDb: number;
    /** True while the frame loop runs. */
    get running(): boolean;
    constructor(analyser: AnalyserNode);
    /** Read one block now and publish the result. */
    read(): Level;
    /** Watch the meter, and get back a function that stops watching. The
     * frame loop runs only while at least one watcher holds it. */
    watch(): () => void;
}
