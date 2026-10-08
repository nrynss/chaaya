import { type ReadShareOptions } from "./payload.js";
import type { SharedPayload } from "./payload.js";
/** What `consumeShareLaunch` needs. */
export interface ConsumeShareOptions extends ReadShareOptions {
    /** Consume only on this path. Ignore every other path. Omit for any path. */
    readonly path?: string;
}
/**
 * Read the share payload once from the launch URL, then clean the address
 * bar so a reload shares nothing. Answers undefined off the share path, and
 * when the launch carries no share. Reads the passed URL in a check, or the
 * live location when the caller passes none.
 */
export declare function consumeShareLaunch(input?: string | URL, options?: ConsumeShareOptions): SharedPayload | undefined;
