/** Run one cleanup task in the calling component's effect context.
 *
 * Internal to the package and not exported from `@nrynss/chaaya/svelte`.
 * New code uses `attach` from that entry. This helper stays only for the
 * modules that still take a cleanup runner until they move off runes. */
export function runInEffect(task: () => () => void): void {
	$effect(() => task())
}
