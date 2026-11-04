/** A failure shape an adapter can aim at. Core does not require this on the wire.
 * `code` is what a caller branches on. `message` is what a caller may show.
 * `retryable` is optional guidance. `detail` is for the adapter alone. */
export interface ChaayaError {
    /** A stable machine-readable code. */
    code: string;
    /** A sentence a caller may show and never branch on. */
    message: string;
    /** Whether the caller should try the same call again. */
    retryable?: boolean;
    /** Adapter-specific payload. */
    detail?: unknown;
}
