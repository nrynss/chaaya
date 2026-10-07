import { expect, test } from "vitest"
import {
	DEFAULT_SCOPE,
	ShortcutDispatcher,
	ShortcutRegistry,
	formatBinding,
	isInteractiveTarget,
	type ShortcutBinding
} from "./shortcuts.js"

/** A synthetic key event with a no-op preventDefault. */
function keyEvent(overrides: Record<string, unknown> = {}): KeyboardEvent {
	return {
		key: "",
		code: "",
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		target: null,
		preventDefault: () => {},
		...overrides
	} as unknown as KeyboardEvent
}

/** An element stand-in whose closest answers fixed. */
function elementStub(match: boolean): unknown {
	return {
		isContentEditable: false,
		closest: () => (match ? {} : null)
	}
}

/** A binding that counts its own calls. */
function countingBinding(overrides: Partial<ShortcutBinding> & { id: string }): { binding: ShortcutBinding; calls: () => number } {
	let calls = 0
	const binding: ShortcutBinding = {
		description: "A check binding.",
		handler: () => {
			calls += 1
		},
		...overrides
	}
	return { binding, calls: () => calls }
}

/** A dispatcher pinned off Apple, so Mod always means Control here. */
function dispatcherFor(registry: ShortcutRegistry): ShortcutDispatcher {
	return new ShortcutDispatcher(registry, { applePlatform: false })
}

test("a binding fires on its scope and stays silent elsewhere", () => {
	const registry = new ShortcutRegistry()
	const page = countingBinding({ id: "play", key: "k" })
	registry.register(page.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(true)
	expect(page.calls()).toBe(1)
	expect(dispatcher.handle(keyEvent({ key: "j" }))).toBe(false)
	expect(page.calls()).toBe(1)
})

test("double registration in one scope throws, and another scope allows it", () => {
	const registry = new ShortcutRegistry()
	const first = countingBinding({ id: "play", key: "k" })
	const second = countingBinding({ id: "play", key: "j" })
	registry.register(first.binding)
	expect(() => registry.register(second.binding)).toThrowError(/already registered/)
	registry.register({ ...second.binding, scope: "dialog" })
	expect(registry.list()).toHaveLength(2)
	expect(registry.list(DEFAULT_SCOPE)).toHaveLength(1)
	expect(registry.list("dialog")).toHaveLength(1)
})

test("unregister removes a binding, and a missing one costs nothing", () => {
	const registry = new ShortcutRegistry()
	const page = countingBinding({ id: "play", key: "k" })
	const remove = registry.register(page.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(true)
	remove()
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(false)
	registry.unregister("never-there")
})

test("Mod maps to Control off Apple and Command on Apple", () => {
	const off = new ShortcutDispatcher(new ShortcutRegistry(), { applePlatform: false })
	const on = new ShortcutDispatcher(new ShortcutRegistry(), { applePlatform: true })
	const plain = countingBinding({ id: "undo", key: "z", modifiers: { mod: true } })
	const offPlain = countingBinding({ id: "undo", key: "z", modifiers: { mod: true } })
	off.registry.register(offPlain.binding)
	on.registry.register(plain.binding)
	expect(off.handle(keyEvent({ key: "z", ctrlKey: true }))).toBe(true)
	expect(off.handle(keyEvent({ key: "z", metaKey: true }))).toBe(false)
	expect(on.handle(keyEvent({ key: "z", metaKey: true }))).toBe(true)
	expect(on.handle(keyEvent({ key: "z", ctrlKey: true }))).toBe(false)
})

test("a shifted letter still hits its binding, and an extra modifier misses", () => {
	const registry = new ShortcutRegistry()
	const save = countingBinding({ id: "save", key: "s", modifiers: { mod: true } })
	registry.register(save.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: "S", ctrlKey: true, shiftKey: true }))).toBe(false)
	expect(dispatcher.handle(keyEvent({ key: "S", ctrlKey: true }))).toBe(true)
	expect(save.calls()).toBe(1)
})

test("a code fallback matches when the key differs by layout", () => {
	const registry = new ShortcutRegistry()
	const undo = countingBinding({ id: "undo", key: "z", code: "KeyZ", modifiers: { mod: true } })
	registry.register(undo.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: "z", code: "KeyZ", ctrlKey: true }))).toBe(true)
	expect(dispatcher.handle(keyEvent({ key: "я", code: "KeyZ", ctrlKey: true }))).toBe(true)
	expect(dispatcher.handle(keyEvent({ key: "x", code: "KeyX", ctrlKey: true }))).toBe(false)
	expect(undo.calls()).toBe(2)
})

test("a code-only binding matches by position alone", () => {
	const registry = new ShortcutRegistry()
	const play = countingBinding({ id: "play", code: "Space" })
	registry.register(play.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: " ", code: "Space" }))).toBe(true)
	expect(play.calls()).toBe(1)
})

test("a binding without key or code never matches", () => {
	const registry = new ShortcutRegistry()
	const vague = countingBinding({ id: "vague" })
	registry.register(vague.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(false)
	expect(vague.calls()).toBe(0)
})

test("events from editable and interactive targets stay silent without opt-in", () => {
	const registry = new ShortcutRegistry()
	const plain = countingBinding({ id: "play", key: "k" })
	const eager = countingBinding({ id: "echo", key: "e", allowInEditable: true })
	registry.register(plain.binding)
	registry.register(eager.binding)
	const dispatcher = dispatcherFor(registry)
	expect(isInteractiveTarget(elementStub(true))).toBe(true)
	expect(isInteractiveTarget(elementStub(false))).toBe(false)
	expect(isInteractiveTarget({ isContentEditable: true, closest: () => null })).toBe(true)
	expect(isInteractiveTarget(null)).toBe(false)
	expect(isInteractiveTarget({})).toBe(false)
	expect(dispatcher.handle(keyEvent({ key: "k", target: elementStub(true) }))).toBe(false)
	expect(plain.calls()).toBe(0)
	expect(dispatcher.handle(keyEvent({ key: "e", target: elementStub(true) }))).toBe(true)
	expect(eager.calls()).toBe(1)
	expect(dispatcher.handle(keyEvent({ key: "k", target: elementStub(false) }))).toBe(true)
	expect(plain.calls()).toBe(1)
})

test("a dialog scope shadows the page scope while open", () => {
	const registry = new ShortcutRegistry()
	const page = countingBinding({ id: "save", scope: "page", key: "k" })
	const dialog = countingBinding({ id: "save", scope: "dialog", key: "k" })
	registry.register(page.binding)
	registry.register(dialog.binding)
	const dispatcher = dispatcherFor(registry)
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(true)
	expect(page.calls()).toBe(1)
	dispatcher.pushScope("dialog")
	expect(dispatcher.scopes).toEqual(["page", "dialog"])
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(true)
	expect(dialog.calls()).toBe(1)
	expect(page.calls()).toBe(1)
	dispatcher.popScope()
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(true)
	expect(page.calls()).toBe(2)
})

test("a scope with no match falls through to the scope below", () => {
	const registry = new ShortcutRegistry()
	const page = countingBinding({ id: "play", scope: "page", key: "k" })
	registry.register(page.binding)
	const dispatcher = dispatcherFor(registry)
	dispatcher.pushScope("dialog")
	expect(dispatcher.handle(keyEvent({ key: "k" }))).toBe(true)
	expect(page.calls()).toBe(1)
})

test("popping the page scope changes nothing", () => {
	const dispatcher = dispatcherFor(new ShortcutRegistry())
	dispatcher.popScope()
	expect(dispatcher.scopes).toEqual(["page"])
})

test("a handled event outside a field is prevented, and one inside is not", () => {
	const registry = new ShortcutRegistry()
	const play = countingBinding({ id: "play", key: "k" })
	const echo = countingBinding({ id: "echo", key: "e", allowInEditable: true })
	registry.register(play.binding)
	registry.register(echo.binding)
	const dispatcher = dispatcherFor(registry)
	let prevented = 0
	const onPage = keyEvent({ key: "k", preventDefault: () => { prevented += 1 } })
	const inField = keyEvent({ key: "e", target: elementStub(true), preventDefault: () => { prevented += 1 } })
	expect(dispatcher.handle(onPage)).toBe(true)
	expect(prevented).toBe(1)
	expect(dispatcher.handle(inField)).toBe(true)
	expect(prevented).toBe(1)
	expect(echo.calls()).toBe(1)
})

/** A caller owned target that records its listeners. */
function fakeTarget(): EventTarget & { send: (event: Event) => void; listenerCount: () => number } {
	const listeners = new Map<string, ((event: Event) => void)[]>()
	const target = {
		send: (event: Event): void => {
			for (const listener of listeners.get("keydown") ?? []) listener(event)
		},
		listenerCount: (): number => listeners.get("keydown")?.length ?? 0,
		addEventListener: (kind: string, listener: (event: Event) => void): void => {
			listeners.set(kind, [...(listeners.get(kind) ?? []), listener])
		},
		removeEventListener: (kind: string, listener: (event: Event) => void): void => {
			listeners.set(kind, (listeners.get(kind) ?? []).filter((kept) => kept !== listener))
		}
	}
	return target as unknown as EventTarget & { send: (event: Event) => void; listenerCount: () => number }
}

test("start attaches to a caller passed target, and stop detaches", () => {
	const registry = new ShortcutRegistry()
	const play = countingBinding({ id: "play", key: "k" })
	registry.register(play.binding)
	const dispatcher = dispatcherFor(registry)
	const target = fakeTarget()
	dispatcher.start(target)
	dispatcher.start(target)
	expect(target.listenerCount()).toBe(1)
	target.send(keyEvent({ key: "k" }) as unknown as Event)
	expect(play.calls()).toBe(1)
	dispatcher.stop()
	expect(target.listenerCount()).toBe(0)
	target.send(keyEvent({ key: "k" }) as unknown as Event)
	expect(play.calls()).toBe(1)
})

test("the help label names modifiers and keys", () => {
	expect(formatBinding({ key: "z", modifiers: { mod: true } })).toBe("Control+Z")
	expect(formatBinding({ key: "z", modifiers: { mod: true } }, true)).toBe("Command+Z")
	expect(formatBinding({ key: "?" })).toBe("?")
	expect(formatBinding({ key: " " })).toBe("Space")
	expect(formatBinding({ code: "ArrowRight" })).toBe("ArrowRight")
	expect(formatBinding({ key: "Z", modifiers: { mod: true, shift: true } })).toBe("Control+Shift+Z")
})
