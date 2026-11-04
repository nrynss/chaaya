/** What `consumeTopUpReturn` needs. */
export interface ConsumeTopUpOptions {
    /**
     * The query param the checkout return carries the top-up reference in.
     * The app names it in the return URL it hands the checkout, so Chaaya
     * names none.
     */
    readonly param: string;
    /** Consume only on this path. Ignore every other path. Omit for any path. */
    readonly path?: string;
}
/**
 * Read the top-up reference once from a checkout return URL, then drop that
 * param from the address bar so a reload does not wait again. Answers
 * undefined off the return path, and when the param is missing or empty.
 * Reads the passed URL in a check, or the live location when the caller
 * passes none. Every other param and the hash stay.
 */
export declare function consumeTopUpReturn(input: string | URL | undefined, options: ConsumeTopUpOptions): string | undefined;
