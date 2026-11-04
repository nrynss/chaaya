/**
 * The framework-neutral change signal. A class that holds public state
 * extends `Notifier`, keeps each field private behind a getter, and calls
 * `notify()` once per logical change. A binding turns that signal into its
 * framework's reactivity. `@nrynss/chaaya/svelte` is the Svelte one. This
 * module imports no framework.
 */
/** Called after a public state change. It reads the new state itself. */
export type Listener = () => void;
/** State that reports its own changes. */
export interface Observable {
    /** Call listener after any public state change. Returns the unsubscribe. */
    subscribe(listener: Listener): () => void;
    /** Increments once per logical change, before listeners run. A cheap
     * snapshot key for bindings. */
    readonly version: number;
}
/**
 * The base class for observable state. Construction touches nothing outside
 * the instance, so it is safe at import time and on the server.
 *
 * Notification is synchronous. Listeners run in subscription order. One that
 * throws does not stop the others, and its error is logged with
 * `console.error`. A listener added during a notification first runs on the
 * next one. A listener removed during a notification does not run again,
 * even in the
 * notification that removed it.
 */
export declare class Notifier implements Observable {
    #private;
    /** Increments once per logical change, before listeners run. A cheap
     * snapshot key for bindings. */
    get version(): number;
    /** Call listener after any public state change. Returns the unsubscribe,
     * which is safe to call more than once. The function is bound to its
     * instance, so a binding may pass `x.subscribe` around unbound, the way
     * an external-store hook takes it. */
    readonly subscribe: (listener: Listener) => (() => void);
    /** Mark one logical change. Bumps `version`, then calls every listener. */
    protected notify(): void;
}
