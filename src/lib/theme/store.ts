import { Notifier } from "../core/observable.js"
import { resolveTheme, THEME_KEY, type Theme, type ThemeMode } from "./theme.js"

/** True when the operating system asks for the dark theme. It reads the
 * media query on each call, so no import touches the DOM. */
function systemPrefersDark(): boolean {
	if (typeof window === "undefined") return false
	return window.matchMedia("(prefers-color-scheme: dark)").matches
}

/** The stored mode, or the system mode when storage is empty or blocked.
 * The whole read sits in a try block, so a missing or throwing storage is
 * not an error. The browser exposes storage as a getter that throws, and
 * even a typeof check on it throws, so nothing reads it outside the block. */
function storedMode(): ThemeMode {
	try {
		const stored = localStorage.getItem(THEME_KEY)
		if (stored === "light" || stored === "dark") return stored
	} catch {
		// Storage is missing or blocked. The system mode still applies.
	}
	return "system"
}

/** Write the mode to storage. Persistence is best effort, so a blocked
 * storage only costs the next visit. */
function persist(mode: ThemeMode): void {
	try {
		localStorage.setItem(THEME_KEY, mode)
	} catch {
		// Storage is blocked. The mode still applies for this session.
	}
}

/** Paint one mode onto the document. An explicit mode sets the attribute
 * that drives the stylesheet. The system mode removes it, so the media
 * query keeps control. */
function paint(mode: ThemeMode): void {
	if (mode === "system") {
		delete document.documentElement.dataset.theme
		return
	}
	document.documentElement.dataset.theme = mode
}

/** The live theme state. One object serves the whole app. It reads storage
 * and the media query on its first use, not at import, so a plain node
 * import stays inert. It notifies once per change of `mode` or `resolved`. */
class ThemeStore extends Notifier {
	#ready = false
	#mode: ThemeMode = "system"
	#systemDark = false

	/** Read the stored mode and the system preference once, paint, and
	 * start listening to the system preference. */
	#init(): void {
		if (this.#ready) return
		this.#ready = true
		this.#mode = storedMode()
		this.#systemDark = systemPrefersDark()
		if (typeof document !== "undefined") paint(this.#mode)
		if (typeof window !== "undefined") {
			window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", this.#onSystemChange)
		}
	}

	/** The chosen mode. */
	get mode(): ThemeMode {
		this.#init()
		return this.#mode
	}

	/** The theme the document paints. It follows the system preference live
	 * while the mode is system. */
	get resolved(): Theme {
		this.#init()
		return resolveTheme(this.#mode, this.#systemDark)
	}

	/** Choose a mode, persist it, and paint it. */
	set(mode: ThemeMode): void {
		this.#init()
		const changed = mode !== this.#mode
		this.#mode = mode
		persist(mode)
		paint(mode)
		if (changed) this.notify()
	}

	#onSystemChange = (): void => {
		const dark = systemPrefersDark()
		if (dark === this.#systemDark) return
		this.#systemDark = dark
		// A forced mode keeps `resolved`, so only the system mode notifies.
		if (this.#mode === "system") this.notify()
	}
}

/** The one theme object the app reads. A consumer reads `mode` and
 * `resolved`, and calls `set` from its own control. A Svelte view reads it
 * through `reactive(theme)`. */
export const theme = new ThemeStore()
