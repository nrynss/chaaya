/** The theme a document paints in. */
export type Theme = "light" | "dark"

/** The mode a consumer chooses. The system mode defers to the operating
 * system preference. */
export type ThemeMode = "system" | "light" | "dark"

/** The storage key that holds the chosen mode. */
export const THEME_KEY = "chaaya-theme"

/** Resolve one theme from a stored mode and the system preference. An
 * explicit light or dark wins over the system. Any other value, including
 * the system mode and junk, defers to the system. Pure, so a unit test
 * reads it with no DOM. */
export function resolveTheme(
	mode: string | null | undefined,
	systemPrefersDark: boolean,
): Theme {
	if (mode === "light" || mode === "dark") return mode
	return systemPrefersDark ? "dark" : "light"
}

/** The accessible name for the control that switches to the other theme.
 * The consumer renders its own control and reads this for its label. */
export function themeToggleLabel(theme: Theme): string {
	return theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
}

/** The inline script a consumer drops into the page head. It restores the
 * stored mode before first paint, so the first frame already carries the
 * right theme. It writes nothing in system mode, where the stylesheet media
 * query tracks the system on its own. A blocked storage is not an error. */
export const themeScript =
	`(function(){var m=null;try{m=localStorage.getItem("${THEME_KEY}")}catch(e){}` +
	`if(m==="light"||m==="dark"){document.documentElement.dataset.theme=m}})()`
