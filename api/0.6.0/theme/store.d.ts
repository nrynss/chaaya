import { Notifier } from "../core/observable.js";
import { type Theme, type ThemeMode } from "./theme.js";
/** The live theme state. One object serves the whole app. It reads storage
 * and the media query on its first use, not at import, so a plain node
 * import stays inert. It notifies once per change of `mode` or `resolved`. */
declare class ThemeStore extends Notifier {
    #private;
    /** The chosen mode. */
    get mode(): ThemeMode;
    /** The theme the document paints. It follows the system preference live
     * while the mode is system. */
    get resolved(): Theme;
    /** Choose a mode, persist it, and paint it. */
    set(mode: ThemeMode): void;
}
/** The one theme object the app reads. A consumer reads `mode` and
 * `resolved`, and calls `set` from its own control. A Svelte view reads it
 * through `reactive(theme)`. */
export declare const theme: ThemeStore;
export {};
