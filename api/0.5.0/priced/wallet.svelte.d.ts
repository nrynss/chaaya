import type { ChaayaError } from "../core/error.js";
import { PricedAction, type InsufficientFunds, type PriceAmount, type PricedActionOptions } from "./priced-action.svelte.js";
/**
 * Where the balance read stands. `idle` has never read. `reading` has a
 * refresh in flight. `ready` means the last read landed, a refresh or a
 * top-up follow answer. `failed` means the last refresh did not, and the
 * last balance that landed stays published.
 */
export type WalletPhase = "idle" | "reading" | "ready" | "failed";
/**
 * Where a top-up follow stands. `idle` has none. `following` polls the
 * balance, including while paused on a hidden page. `landed` saw the top-up
 * credited. `timed_out` ran past its timeout first. `failed` spent its error
 * budget. `closed` was stopped by close or by its signal. A newer follow
 * replaces the older one, so this reads the newer follow's state.
 */
export type TopUpPhase = "idle" | "following" | "landed" | "timed_out" | "failed" | "closed";
/** What a wallet needs. The adapter supplies the backend calls. */
export interface CreditWalletOptions<R> {
    /**
     * Read the balance once. It receives an abort signal and resolves the raw
     * answer. Chaaya names no header and no route.
     */
    readonly readBalance: (signal: AbortSignal) => Promise<R>;
    /** Map the raw answer onto the balance. A throw counts as a failed read. */
    readonly toBalance: (reading: R) => PriceAmount;
    /**
     * Read a run refusal for lack of balance. Actions made through `action`
     * use it unless their own options pass one. The adapter owns the codes.
     */
    readonly parseInsufficientFunds?: (error: unknown) => InsufficientFunds | undefined;
    /**
     * Runs when a read publishes a balance that differs from the last one in
     * amount or label, including the first read, where `previous` is null. A
     * refund the backend made after the fact arrives here. The app decides
     * what to say about it. A throw is ignored.
     */
    readonly onChange?: (next: PriceAmount, previous: PriceAmount | null) => void;
}
/** What one top-up follow needs, past the wallet's own read. */
export interface TopUpFollowOptions<R> {
    /**
     * Whether a raw balance answer shows this top-up credited. The backend
     * credits when the payment provider confirms, so the first answers after
     * the return may not show it yet. A throw counts as a failed read.
     */
    readonly isCredited: (reading: R, reference: string) => boolean;
    /** The whole follow ends as `timed_out` after this many milliseconds.
     * Default 60000. Time spent paused does not count. */
    readonly timeoutMs?: number;
    /** The first interval between reads, in milliseconds. Default 1000. */
    readonly intervalMs?: number;
    /** The ceiling the interval backs off to, in milliseconds. Default 8000. */
    readonly maxIntervalMs?: number;
    /** Consecutive failed reads the follow survives. Default 3. */
    readonly errorBudget?: number;
    /** Stop the follow when this aborts. */
    readonly signal?: AbortSignal;
    /** Pause while the page is hidden or offline. Defaults to true. */
    readonly pauseWhenHidden?: boolean;
}
/**
 * A prepaid balance an app reads anywhere a price shows. It holds integer
 * minor units and an opaque denomination label, the shape of `PriceAmount`,
 * and formats nothing.
 *
 * The balance refreshes after every run attempt of an action made through
 * `action`, and after `refresh` or a top-up follow reads it. Reads land in
 * the order they began, so a slow read never overwrites a newer balance.
 *
 * A hosted checkout leaves the page and comes back before the backend has
 * credited the payment. `followTopUp` polls the balance through `JobPoller`
 * until the adapter sees the top-up credited or a timeout passes. Read the
 * return with `consumeTopUpReturn`, which cleans the address bar so a reload
 * does not wait again.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 */
export declare class CreditWallet<R = unknown> {
    #private;
    /** The last balance that landed, or null before the first. */
    balance: PriceAmount | null;
    /** Where the balance read stands. */
    phase: WalletPhase;
    /** The failure behind a failed phase, or null elsewhere. */
    error: unknown;
    constructor(options: CreditWalletOptions<R>);
    /** Where the current top-up follow stands. */
    get topUp(): TopUpPhase;
    /** The reference the current or last top-up follow waits on, or null. */
    get topUpReference(): string | null;
    /** The failure that ended the last top-up follow, when it timed out or failed. */
    get topUpError(): ChaayaError | undefined;
    /**
     * Read the balance now. A newer refresh aborts an older one still in
     * flight. Resolves the balance published once the read settles, which is
     * the last one that landed when this read failed.
     */
    refresh(): Promise<PriceAmount | null>;
    /**
     * Make a priced action whose every run attempt refreshes this wallet.
     * It reads insufficient funds through the wallet's parser unless the
     * options pass their own. An `onRunSettled` in the options runs first.
     */
    action<T>(options: PricedActionOptions<T>): PricedAction<T>;
    /**
     * Follow the balance after a top-up return until the adapter sees the
     * reference credited or the timeout passes. A newer follow closes the
     * older one. Each answer publishes the balance as a refresh would. Call
     * it during component initialisation, or pass a cleanup runner.
     */
    followTopUp(reference: string, options: TopUpFollowOptions<R>, registerCleanup?: (task: () => () => void) => void): void;
    /** Stop the top-up follow and abort a refresh in flight. The wallet keeps
     * its balance and may refresh again. */
    close(): void;
}
