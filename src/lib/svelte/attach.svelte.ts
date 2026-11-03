import { untrack } from "svelte"

/** Start a target in the calling component's effect and own its teardown. */
export function attach(target: { attach(): () => void }): void {
	$effect(() => untrack(() => target.attach()))
}
