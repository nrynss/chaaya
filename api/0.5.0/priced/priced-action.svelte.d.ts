/**
 * Money as integer minor units with an opaque denomination label. The label
 * accepts any value, such as a currency code or a credit label. Chaaya
 * validates nothing, computes nothing, and formats nothing. Display belongs
 * to the app.
 */
export interface PriceAmount {
    /** Integer minor units. */
    readonly amount: number;
    /** An opaque denomination label. */
    readonly currency: string;
}
/** One quoted price. The id travels as the idempotency key of every run attempt. */
export interface PriceQuote {
    /** The quote id. Every run attempt sends it, including retries. */
    readonly id: string;
    /** The quoted price. */
    readonly price: PriceAmount;
    /** When the quote lapses, in milliseconds since the epoch. Omit for no expiry. */
    readonly expiresAt?: number;
}
/**
 * A run refused for lack of balance, as the adapter read it. Both fields are
 * optional because a backend may send neither. Chaaya computes no shortfall
 * from them and formats neither.
 */
export interface InsufficientFunds {
    /** The balance the backend reported with the refusal, when it sent one. */
    readonly balance?: PriceAmount;
    /** What the run needed, when the backend said. */
    readonly required?: PriceAmount;
}
/**
 * The lifecycle of a priced action. `quoting` covers the first quote and a
 * re-quote. `quoted` holds a live quote. `running` holds one run attempt. A
 * refusal that carries a new quote returns to `quoted` with the new price.
 * `insufficient` is a run refused for lack of balance. It keeps the quote,
 * so a confirm after a top-up runs against the same quote id.
 */
export type PricedPhase = "idle" | "quoting" | "quoted" | "running" | "done" | "failed" | "insufficient";
/** What a priced action needs. */
export interface PricedActionOptions<T> {
    /** Ask for a fresh quote. */
    readonly quote: () => Promise<PriceQuote>;
    /**
     * Run once against a quote id. The app sends the id as the idempotency
     * key on every attempt, including retries, so a repeated request spends
     * once. Chaaya names no header and no route.
     */
    readonly run: (quoteId: string) => Promise<T>;
    /**
     * Read a refusal that carries a new quote. Return the quote when the
     * error is that refusal, else undefined. The adapter owns the codes, so
     * core names none.
     */
    readonly parsePriceChange?: (error: unknown) => PriceQuote | undefined;
    /**
     * Read a refusal for lack of balance. Return what the backend said when
     * the error is that refusal, else undefined. A price change is read
     * first. A throw reads as no such refusal. The adapter owns the codes.
     */
    readonly parseInsufficientFunds?: (error: unknown) => InsufficientFunds | undefined;
    /**
     * Runs after every run attempt settles, whatever the outcome, including
     * an attempt a reset discarded, because a discarded run may still have
     * spent. A quote never calls it. A throw is ignored.
     */
    readonly onRunSettled?: () => void;
    /**
     * Start at `quoted` with this quote instead of `idle`. A hosted checkout
     * leaves the page, so an app that kept the quote across the top-up passes
     * it back here and confirms without re-quoting. A lapsed quote still
     * re-quotes on confirm.
     */
    readonly initialQuote?: PriceQuote;
    /** The clock in milliseconds since the epoch. Defaults to Date.now. */
    readonly now?: () => number;
}
/**
 * Quotes, confirms, and runs once. While a run is in flight, a second
 * confirm does nothing. An expired quote re-quotes before it runs. A refusal
 * that carries a new quote moves back to quoted with the new price, so the
 * app asks again instead of spending.
 */
export declare class PricedAction<T = unknown> {
    #private;
    /** The lifecycle state of the action. */
    phase: PricedPhase;
    /** The live quote, or null before the first quote and after reset. */
    quote: PriceQuote | null;
    /** The run value, or null before a run succeeds. */
    result: T | null;
    /** The failure behind a failed phase, or null elsewhere. */
    error: unknown;
    /** The refusal behind an insufficient phase, or null elsewhere. */
    insufficient: InsufficientFunds | null;
    constructor(options: PricedActionOptions<T>);
    /** Whether the live quote has lapsed. A quote without expiry never lapses. */
    get expired(): boolean;
    /** Ask for a fresh quote. A second call while quoting or running does nothing. */
    requestQuote(): Promise<void>;
    /**
     * Run once against the live quote. Quotes first when there is none, and
     * re-quotes when it lapsed. A second confirm while a run is in flight
     * does nothing. A retry after a failure sends the same quote id again,
     * so the backend dedupes on it. A confirm after an insufficient refusal
     * does the same, so the backend must not store that refusal as the
     * quote's final answer.
     */
    confirm(): Promise<T | undefined>;
    /** Forget the quote, the result, and the error, and return to idle. */
    reset(): void;
}
