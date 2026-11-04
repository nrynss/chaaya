import type { Observable } from "../core/observable.js";
/**
 * Make an observable's reads reactive in Svelte 5.
 *
 * The result is a `Proxy` over the target. Every property read inside a
 * reactive context (a template, an effect, a `$derived`) subscribes that
 * context to the target, so the next `notify()` re-runs it. A read outside a
 * reactive context subscribes nothing. The target's subscription opens with
 * the first reactive reader and closes with the last.
 *
 * Reads and writes run against the target itself, so getters, setters, and
 * `#private` fields keep their brand checks. A method comes back bound to
 * the target, and the bound copy is cached, so `proxy.method` is stable.
 * Wrapping the same target again, or wrapping the proxy, returns the same
 * proxy.
 */
export declare function reactive<T extends Observable>(target: T): T;
