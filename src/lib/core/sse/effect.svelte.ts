/** Run one cleanup task in the calling component's effect context. */
export function runInEffect(task: () => () => void): void {
	$effect(() => task())
}
