/**
 * The sync lifecycle. `idle` means nothing is in flight. `syncing` means a
 * flush is running. `conflict` means the server refused a commit and the
 * queue is paused. `error` means the commit function threw and a retry may
 * follow. The document never silently overwrites the server.
 */
export type SyncStatus = "idle" | "syncing" | "conflict" | "error";
/**
 * One undoable change over plain data. Apply and invert must be true
 * inverses: invert(apply(anything)) returns that anything. Undo, redo,
 * rollback, and rebase all rely on that round trip.
 */
export interface EditCommand<T> {
    /** What a history view names this step. */
    readonly label: string;
    /**
     * Merges consecutive entries with the same key into one undo step, such
     * as a drag or repeated nudges. Omit it for a standalone step.
     */
    readonly coalesceKey?: string;
    apply: (doc: T) => T;
    invert: (doc: T) => T;
}
/** A proposed change awaiting review. Accepting one runs it as one undoable entry. */
export interface HistoryProposal<T> extends EditCommand<T> {
    readonly id: string;
}
/** What the sync layer sends per step, in order, with a running base. */
export interface CommitRequest<T> {
    /** The server revision this send builds on. */
    readonly base: number;
    /** The document after this step, from the last acknowledged state. */
    readonly doc: T;
    readonly label: string;
}
/**
 * What a commit answers. Success carries the new revision. A conflict
 * refusal carries the server head instead, and never applies the send.
 */
export type CommitResponse<T> = {
    readonly revision: number;
} | {
    readonly conflict: true;
    readonly headRevision: number;
    readonly head: T;
};
/** Sends one step to the server. Throwing reports a network failure. */
export type CommitFn<T> = (request: CommitRequest<T>) => Promise<CommitResponse<T>>;
/** What an edit history needs. */
export interface EditHistoryOptions<T> {
    /** Sends one step to the server. Omit it for a local history. */
    readonly commit?: CommitFn<T>;
}
/** One entry in the undo list. */
interface HistoryEntry<T> {
    label: string;
    apply: (doc: T) => T;
    invert: (doc: T) => T;
    readonly coalesceKey: string | undefined;
    applied: boolean;
    committed: boolean;
}
/**
 * Undo, redo, and server sync over plain data. Every local change runs
 * through entries, so undo inverts them in place. Sync replays the same
 * entries against the server in order. Proposals wait in a separate list
 * until the caller accepts or dismisses them.
 */
export declare class EditHistory<T> {
    #private;
    /** The live document, with every local change applied. */
    doc: T;
    /** The last acknowledged server revision. */
    serverRevision: number;
    /** The document the server last acknowledged. */
    serverDoc: T;
    /** The sync lifecycle. */
    status: SyncStatus;
    /** The server head behind a conflict, or null elsewhere. */
    conflict: {
        headRevision: number;
        head: T;
    } | null;
    /** The failure behind an error status, or null elsewhere. */
    lastError: unknown;
    /** Proposals awaiting review. Accepting one runs it as one entry. */
    proposals: HistoryProposal<T>[];
    entries: HistoryEntry<T>[];
    constructor(initial: T, options?: EditHistoryOptions<T>);
    /** Whether an undo step exists. */
    get canUndo(): boolean;
    /** Whether a redo step exists. */
    get canRedo(): boolean;
    /** The labels of applied steps, oldest first. A history view reads these. */
    get pastLabels(): string[];
    /** The labels of undone steps, oldest first. A history view reads these. */
    get futureLabels(): string[];
    /** How many steps await a commit. */
    get pendingCount(): number;
    /** Whether every step is committed and nothing failed. */
    get synced(): boolean;
    /**
     * Run one command. A coalescing key merges into the topmost applied
     * entry with the same key when that entry is still unsent. Merging a
     * committed entry would rewrite what the server already holds, so a
     * committed top starts a fresh entry instead.
     */
    execute(command: EditCommand<T>): void;
    /** Undo the topmost applied step. Returns false with nothing to undo. */
    undo(): boolean;
    /** Redo the earliest undone step. Returns false with nothing to redo. */
    redo(): boolean;
    /**
     * Group several commands into one undo step under one label. The
     * commands run at once, so the document moves during the frame. A throw
     * rolls every buffered command back and reruns nothing. Undo and redo
     * stay outside, and frames nest.
     */
    transaction(label: string, run: () => void): void;
    /**
     * Park a change for review. Returns the proposal id. A proposal changes
     * nothing until the caller accepts it.
     */
    propose(command: EditCommand<T>): string;
    /**
     * Accept a proposal as one undoable entry. Returns false for an unknown id.
     */
    acceptProposal(id: string): boolean;
    /** Dismiss a proposal unread. Returns false for an unknown id. */
    dismissProposal(id: string): boolean;
    /**
     * Send every pending step in order with a running base. Undone steps
     * that reached the server go first as inverses, oldest undone last, so
     * the server sheds them before it takes the new work. A conflict refusal
     * pauses the queue, rolls the document back to the last acknowledged
     * state, and exposes the server head. A thrown failure keeps every local
     * change and reports for a retry.
     */
    flush(): Promise<void>;
    /**
     * Adopt the exposed head and replay every pending step onto it. Returns
     * false with no conflict to adopt. Committed steps stay committed: the
     * server already holds them, and the head builds on them. Pending steps
     * replay as deltas onto the head, so a step must change the document
     * relative to its base rather than replace it outright. The queue
     * resumes as unsent, so the next flush sends the replayed steps against
     * the new base.
     */
    rebase(): boolean;
    /**
     * Forget every unsent step and return to the last acknowledged state.
     * Committed steps keep their undo depth. A conflict clears with the rest.
     */
    discardPending(): void;
}
export {};
