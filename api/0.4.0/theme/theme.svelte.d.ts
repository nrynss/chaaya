import { type Theme, type ThemeMode } from "./theme.js";
/** The one theme object the app reads. A consumer reads `mode` and
 * `resolved`, and calls `set` from its own control. */
export declare const theme: {
    /** The chosen mode. */
    readonly mode: ThemeMode;
    /** The theme the document paints. It follows the system preference live
     * while the mode is system. */
    readonly resolved: Theme;
    /** Choose a mode, persist it, and paint it. */
    set(mode: ThemeMode): void;
};
