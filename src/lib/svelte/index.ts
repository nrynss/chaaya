/**
 * The Svelte 5 binding. Chaaya's stateful classes are framework-neutral
 * observables. `reactive` makes their reads reactive in a template, an
 * effect, or a `$derived`, and `attach` ties a follow loop's lifetime to the
 * calling component.
 *
 * A read without `reactive` does not fail. The view renders once and never
 * updates, so wrap every instance a view reads.
 */
export { reactive } from "./reactive.js"
export { attach } from "./attach.svelte.js"
export type { Attachable } from "./attach.svelte.js"
