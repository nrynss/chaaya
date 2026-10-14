/** How a dropped stream waits before it tries again. */
export interface ReconnectOptions {
    /** The delay before the first reconnect, in milliseconds. Default 500. */
    baseMs?: number;
    /** The ceiling the delay doubles up to, in milliseconds. Default 8000. */
    maxMs?: number;
    /** The attempts one stream gets before it gives up. Default 6. */
    attempts?: number;
}
/** The schedule a stream uses when the caller passes none. */
export declare const defaultReconnect: {
    readonly baseMs: 500;
    readonly maxMs: 8000;
    readonly attempts: 6;
};
/** Fill the omitted fields of a reconnect schedule. */
export declare function reconnectSettings(options?: ReconnectOptions): {
    baseMs: number;
    maxMs: number;
    attempts: number;
};
/** The delay before one attempt, counting from zero. The delay doubles up to the ceiling. */
export declare function reconnectDelay(attempt: number, settings: {
    baseMs: number;
    maxMs: number;
}): number;
