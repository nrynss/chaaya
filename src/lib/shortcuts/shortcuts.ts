/**
 * The scope a binding belongs to when it names none. Most bindings live on
 * the page scope. A dialog scope shadows it while the dialog is open.
 */
export const DEFAULT_SCOPE = "page"

/** The modifiers a binding needs. Every flag defaults to off. */
export interface ShortcutModifiers {
	/** The platform modifier. Command on Apple platforms, Control elsewhere. */
	readonly mod?: boolean
	/** Control as its own modifier, even on Apple platforms. */
	readonly ctrl?: boolean
	readonly alt?: boolean
	readonly shift?: boolean
}

/** One named key binding. The registry is the one source the help view reads. */
export interface ShortcutBinding {
	/** A stable id, unique within its scope. */
	readonly id: string
	/** The scope the binding lives in. Defaults to the page scope. */
	readonly scope?: string
	/** Matched against event.key. Single characters match either case. */
	readonly key?: string
	/** Matched against event.code when the key differs by layout. */
	readonly code?: string
	/** The modifiers the binding needs. An exact match wins, except that a
	 * glyph binding forgives a held Shift it never named. */
	readonly modifiers?: ShortcutModifiers
	/** What the help view shows beside the keys. */
	readonly description: string
	/**
	 * Whether the binding fires from editable and interactive targets. The
	 * dispatcher skips those targets unless a binding opts in here.
	 */
	readonly allowInEditable?: boolean
	readonly handler: (event: KeyboardEvent) => void
}

/** The keys a help label shows. A help row passes its binding straight in. */
export type ShortcutLabel = Pick<ShortcutBinding, "key" | "code" | "modifiers">

/** What the dispatcher needs. */
export interface ShortcutDispatcherOptions {
	/**
	 * Which platform Mod maps to. True means Apple, so Mod is Command. False
	 * means any other platform, so Mod is Control. A function is read on
	 * every dispatch. When omitted, the dispatcher reads the navigator lazily
	 * at dispatch time, so importing this module touches nothing.
	 */
	readonly applePlatform?: boolean | (() => boolean)
}

/** Targets the dispatcher skips unless a binding opts in. Native media
 * controls retarget their events to the media element, so naming the element
 * covers its controls too. */
const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable], audio, video"

/** Whether an event target is editable or interactive. Anything without a
 * closest method, such as the document itself, reads as not interactive. */
export function isInteractiveTarget(target: unknown): boolean {
	if (target === null || typeof target !== "object") return false
	const candidate = target as { closest?: unknown; isContentEditable?: unknown }
	if (candidate.isContentEditable === true) return true
	if (typeof candidate.closest !== "function") return false
	const closest = candidate.closest as (selector: string) => unknown
	return closest.call(candidate, EDITABLE_SELECTOR) !== null
}

/** Whether Mod means Command. Reads the navigator lazily, so an import
 * never touches a browser global. */
function readApplePlatform(): boolean {
	const navigatorRef = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
	if (navigatorRef === undefined) return false
	const text = `${navigatorRef.platform ?? ""} ${navigatorRef.userAgent ?? ""}`
	return /mac|iphone|ipad|ipod|darwin/i.test(text)
}

/** Whether one character key matches another. Named keys match exactly, so
 * ArrowLeft never equals arrowleft. Single characters match either case, so
 * a shifted letter still hits its binding. */
function keyMatches(want: string, got: string): boolean {
	if (want.length === 1 && got.length === 1) return want.toLowerCase() === got.toLowerCase()
	return want === got
}

/** Whether an event carries the keys a binding names. The key matches first.
 * The code matches when the key differs, so one physical key works across
 * layouts. A binding with neither key nor code never matches. */
function matchesKeys(binding: ShortcutBinding, event: KeyboardEvent): boolean {
	if (binding.key !== undefined && keyMatches(binding.key, event.key)) return true
	if (binding.code !== undefined && event.code === binding.code) return true
	return false
}

/** Whether an event carries the modifiers a binding needs. The match is
 * exact, except for one hardware truth: a glyph binding forgives a held
 * Shift when it names none, because real hardware always holds Shift to
 * produce the glyph. Letters and named keys keep the exact match, so Shift
 * plus K never fires a plain K binding. Mod reads Meta on Apple platforms
 * and Control elsewhere. Off Apple, Mod and Control collapse into one flag,
 * so naming either one needs Control and nothing else. Control stays its own
 * flag on Apple platforms. */
function matchesModifiers(binding: ShortcutBinding, event: KeyboardEvent, apple: boolean): boolean {
	const want = binding.modifiers ?? {}
	if (apple) {
		if ((want.mod ?? false) !== event.metaKey) return false
		if ((want.ctrl ?? false) !== event.ctrlKey) return false
	} else {
		if (((want.mod ?? false) || (want.ctrl ?? false)) !== event.ctrlKey) return false
		if (event.metaKey) return false
	}
	if ((want.alt ?? false) !== event.altKey) return false
	if (!shiftForgiven(binding) && (want.shift ?? false) !== event.shiftKey) return false
	return true
}

/**
 * Whether a held Shift misses nothing. True only for a binding on one glyph
 * with no case of its own, such as ?, that names no Shift itself. A letter
 * changes case under Shift, and a named key keeps Shift as a real modifier,
 * so both stay exact.
 */
function shiftForgiven(binding: ShortcutBinding): boolean {
	const key = binding.key
	if (key === undefined || key.length !== 1) return false
	if (key.toLowerCase() !== key.toUpperCase()) return false
	return (binding.modifiers?.shift ?? false) === false
}

/** The scope a binding lives in. */
function scopeOf(binding: ShortcutBinding): string {
	return binding.scope ?? DEFAULT_SCOPE
}

/**
 * Holds bindings by scope. Registering an id twice in one scope throws at
 * registration. The same id in another scope is allowed, so a dialog scope
 * can shadow a page binding.
 */
export class ShortcutRegistry {
	#bindings = new Map<string, ShortcutBinding>()

	#slot(id: string, scope: string): string {
		return `${scope}::${id}`
	}

	/**
	 * Add a binding. Throws when the scope already holds the id. Returns an
	 * unregister function for the binding.
	 */
	register(binding: ShortcutBinding): () => void {
		const slot = this.#slot(binding.id, scopeOf(binding))
		if (this.#bindings.has(slot)) {
			throw new Error(`A binding named ${binding.id} is already registered in this scope.`)
		}
		this.#bindings.set(slot, binding)
		return () => {
			this.#bindings.delete(slot)
		}
	}

	/** Remove a binding by id and scope. Missing bindings cost nothing. */
	unregister(id: string, scope: string = DEFAULT_SCOPE): void {
		this.#bindings.delete(this.#slot(id, scope))
	}

	/** Every binding, or every binding in one scope, in registration order. */
	list(scope?: string): readonly ShortcutBinding[] {
		const bindings = [...this.#bindings.values()]
		if (scope === undefined) return bindings
		return bindings.filter((binding) => scopeOf(binding) === scope)
	}

	/** The first binding in a scope that an event hits, or null. */
	find(event: KeyboardEvent, scope: string, apple: boolean, interactive: boolean): ShortcutBinding | null {
		for (const binding of this.#bindings.values()) {
			if (scopeOf(binding) !== scope) continue
			if (interactive && binding.allowInEditable !== true) continue
			if (!matchesKeys(binding, event)) continue
			if (!matchesModifiers(binding, event, apple)) continue
			return binding
		}
		return null
	}
}

/**
 * Runs a registry against keydown events. Scopes nest: the dispatcher walks
 * the scope stack from the most recently pushed scope down, and the first
 * scope with a matching binding handles the event. A dialog scope pushed on
 * open shadows the page scope, and popping it on close restores the page.
 */
export class ShortcutDispatcher {
	readonly registry: ShortcutRegistry
	#scopes: string[] = [DEFAULT_SCOPE]
	#target: EventTarget | null = null
	#onKey: ((event: Event) => void) | null = null
	#readApple: () => boolean

	constructor(registry: ShortcutRegistry, options: ShortcutDispatcherOptions = {}) {
		this.registry = registry
		const apple = options.applePlatform
		this.#readApple = typeof apple === "function" ? apple : () => apple ?? readApplePlatform()
	}

	/** The active scope stack, least recent first. */
	get scopes(): readonly string[] {
		return [...this.#scopes]
	}

	/** Push a scope, so its bindings shadow every scope below. */
	pushScope(scope: string): void {
		this.#scopes.push(scope)
	}

	/** Pop the most recent scope. The page scope stays, so popping it changes nothing. */
	popScope(): void {
		if (this.#scopes.length > 1) this.#scopes.pop()
	}

	/**
	 * Listen for keydown on a caller passed target. A second call on the same
	 * target changes nothing. A call on another target moves the listener.
	 */
	start(target: EventTarget): void {
		if (this.#target === target && this.#onKey !== null) return
		this.stop()
		const onKey = (event: Event): void => {
			this.handle(event as KeyboardEvent)
		}
		this.#target = target
		this.#onKey = onKey
		target.addEventListener("keydown", onKey)
	}

	/** Stop listening. A dispatcher that never started costs nothing. */
	stop(): void {
		if (this.#target === null || this.#onKey === null) return
		this.#target.removeEventListener("keydown", this.#onKey)
		this.#target = null
		this.#onKey = null
	}

	/**
	 * Run one event through the scope stack. Returns true when a binding
	 * handled it. A handled event outside editable targets is prevented, so
	 * a space binding never scrolls the page. A binding that fires from an
	 * editable target never prevents the default, so typing keeps working.
	 * Its handler still may, when the key must not reach the field.
	 */
	handle(event: KeyboardEvent): boolean {
		const apple = this.#readApple()
		const interactive = isInteractiveTarget(event.target)
		for (let index = this.#scopes.length - 1; index >= 0; index -= 1) {
			const binding = this.registry.find(event, this.#scopes[index], apple, interactive)
			if (binding === null) continue
			binding.handler(event)
			if (!interactive && typeof event.preventDefault === "function") event.preventDefault()
			return true
		}
		return false
	}
}

/** The shown label for a key. A blank key reads as Space. A single letter
 * reads uppercase, so a help row shows Z rather than z. */
function labelOfKey(binding: ShortcutLabel): string {
	if (binding.key !== undefined) {
		if (binding.key === " ") return "Space"
		if (binding.key.length === 1) return binding.key.toUpperCase()
		return binding.key
	}
	return binding.code ?? ""
}

/**
 * The label a help view shows for a binding, such as Control+Z, Command+Z,
 * or ?. Mod reads Command on Apple platforms and Control elsewhere. A
 * binding that sets both Mod and Control off Apple shows one Control. Only
 * the keys matter here, so a help row passes its binding straight in.
 */
export function formatBinding(binding: ShortcutLabel, apple = false): string {
	const parts: string[] = []
	const modifiers = binding.modifiers ?? {}
	if (modifiers.mod === true) parts.push(apple ? "Command" : "Control")
	if (modifiers.ctrl === true && (apple || modifiers.mod !== true)) parts.push("Control")
	if (modifiers.alt === true) parts.push("Alt")
	if (modifiers.shift === true) parts.push("Shift")
	parts.push(labelOfKey(binding))
	return parts.join("+")
}
