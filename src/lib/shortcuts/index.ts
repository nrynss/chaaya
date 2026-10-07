/**
 * A keyboard shortcut registry that a help view reads. Editors bind single
 * keys, such as space to play or arrows to move a selection. Each binding
 * carries a stable id, keys, a scope, a description, and a handler. The
 * registry is the one source the help view reads, so the help screen never
 * drifts from the real bindings.
 *
 * Importing this module touches no browser global. Platform detection reads
 * the navigator lazily inside the dispatch, and tests pass an explicit
 * platform instead. `start` and `stop` attach to a target the caller passes.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { ShortcutDispatcher, ShortcutRegistry, formatBinding, isInteractiveTarget } from "./shortcuts.js"
export type { ShortcutBinding, ShortcutDispatcherOptions, ShortcutLabel, ShortcutModifiers } from "./shortcuts.js"
export { DEFAULT_SCOPE } from "./shortcuts.js"
