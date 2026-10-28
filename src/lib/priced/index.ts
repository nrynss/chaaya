/**
 * One priced action, and the prepaid balance around it. The app quotes a
 * price, shows it in its own dialog, and runs once on confirm. A double
 * confirm, a retry after a timeout, or a second tab must not spend twice.
 * `CreditWallet` holds the balance, refreshes it after every run, and
 * follows a top-up return until the backend credits it.
 *
 * Importing this module touches no browser global. The clock is a caller
 * option, so a check drives expiry without waiting. Reading the return URL
 * happens inside `consumeTopUpReturn`, so a server render may import freely.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { PricedAction } from "./priced-action.svelte.js"
export type {
	InsufficientFunds,
	PricedActionOptions,
	PricedPhase,
	PriceAmount,
	PriceQuote
} from "./priced-action.svelte.js"
export { CreditWallet } from "./wallet.svelte.js"
export type { CreditWalletOptions, TopUpFollowOptions, TopUpPhase, WalletPhase } from "./wallet.svelte.js"
export { consumeTopUpReturn } from "./top-up.js"
export type { ConsumeTopUpOptions } from "./top-up.js"
