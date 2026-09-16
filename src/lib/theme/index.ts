/** The Chaaya theme module. One mode drives one theme, the object follows
 * the system preference live, and an inline head script paints the stored
 * mode before first paint. The consumer renders its own control. */
export { theme } from "./theme.svelte.js"
export { themeToggleLabel, themeScript } from "./theme.js"
export type { Theme, ThemeMode } from "./theme.js"
