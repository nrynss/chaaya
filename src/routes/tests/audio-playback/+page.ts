/** The harness drives live audio elements, so the page renders on the client
 * alone. A server rendered button would ignore a click until hydration
 * attached its handler. */
export const ssr = false
