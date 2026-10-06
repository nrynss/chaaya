/**
 * One priced action. The app quotes a price, shows it in its own dialog, and
 * runs once on confirm. A double confirm, a retry after a timeout, or a
 * second tab must not spend twice.
 *
 * Importing this module touches no browser global. The clock is a caller
 * option, so a check drives expiry without waiting.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { PricedAction } from "./priced-action.svelte.js"
export type {
	PricedActionOptions,
	PricedPhase,
	PriceAmount,
	PriceQuote
} from "./priced-action.svelte.js"
