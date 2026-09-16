/** The harness records a generated signal and streams it, so the page renders
 * on the client alone. A server rendered button would ignore a click until
 * hydration attached its handler. */
export const ssr = false
