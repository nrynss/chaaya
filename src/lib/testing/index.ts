/**
 * Chaaya test gates. A consumer points these at its own stylesheet and its own
 * rendered container, so the library ships the checks without a fixed path or
 * a fixed route list.
 *
 * Importing this module does no DOM work. The contrast gate is pure, and the
 * accessibility gate loads axe only when a caller runs it.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */

export { contrastGate, type ContrastPair } from "./contrast.js"
export { a11yGate } from "./a11y.js"
export { assertErrorEnvelope, assertJobProgress, assertSseFrame } from "./protocol.js"
