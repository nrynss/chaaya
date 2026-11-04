/**
 * The React binding. Chaaya's stateful classes are framework-neutral
 * observables. `useObservable` re-renders a component when one notifies,
 * and `useAttached` ties a follow loop's lifetime to the component.
 *
 * Needs React 18 or later, for `useSyncExternalStore`. Nothing here imports
 * Svelte, and nothing outside this directory imports React.
 */
export { useObservable } from "./use-observable.js";
export { useAttached } from "./use-attached.js";
export type { Attachable } from "./use-attached.js";
