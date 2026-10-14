/**
 * An edit history with undo, redo, and commit reconciliation. An editor over
 * a server document needs all three. A drag collapses into one step, not one
 * per pointer move. Edits reach the server in order. A refused commit rolls
 * back cleanly, and a newer server head is adopted without silent overwrite.
 *
 * Importing this module touches no browser global. Only the caller supplied
 * commit function reaches the network, and only flush calls it.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { EditHistory } from "./history.svelte.js";
export type { CommitFn, CommitRequest, CommitResponse, EditCommand, EditHistoryOptions, HistoryProposal, SyncStatus } from "./history.svelte.js";
