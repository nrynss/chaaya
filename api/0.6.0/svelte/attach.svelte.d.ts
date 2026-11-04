/** Something with a lifetime. `attach()` starts the work and returns the
 * teardown that stops it. */
export interface Attachable {
    attach(): () => void;
}
/**
 * Run `target.attach()` in the calling effect and tear it down with it.
 *
 * Call it during component initialisation, or inside an effect. The work
 * starts when the effect first runs and stops when the component unmounts
 * or the effect is destroyed. The call runs untracked, so a reactive read
 * inside `attach()`, including reading `attach` from a `reactive` proxy,
 * never restarts the work.
 */
export declare function attach(target: Attachable): void;
