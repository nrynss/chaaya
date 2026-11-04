/**
 * The scope a binding belongs to when it names none. Most bindings live on
 * the page scope. A dialog scope shadows it while the dialog is open.
 */
export declare const DEFAULT_SCOPE = "page";
/** The modifiers a binding needs. Every flag defaults to off. */
export interface ShortcutModifiers {
    /** The platform modifier. Command on Apple platforms, Control elsewhere. */
    readonly mod?: boolean;
    /** Control as its own modifier, even on Apple platforms. */
    readonly ctrl?: boolean;
    readonly alt?: boolean;
    readonly shift?: boolean;
}
/** One named key binding. The registry is the one source the help view reads. */
export interface ShortcutBinding {
    /** A stable id, unique within its scope. */
    readonly id: string;
    /** The scope the binding lives in. Defaults to the page scope. */
    readonly scope?: string;
    /** Matched against event.key. Single characters match either case. */
    readonly key?: string;
    /** Matched against event.code when the key differs by layout. */
    readonly code?: string;
    /** The modifiers the binding needs. An exact match wins, except that a
     * glyph binding forgives a held Shift it never named. */
    readonly modifiers?: ShortcutModifiers;
    /** What the help view shows beside the keys. */
    readonly description: string;
    /**
     * Whether the binding fires from editable and interactive targets. The
     * dispatcher skips those targets unless a binding opts in here.
     */
    readonly allowInEditable?: boolean;
    readonly handler: (event: KeyboardEvent) => void;
}
/** The keys a help label shows. A help row passes its binding straight in. */
export type ShortcutLabel = Pick<ShortcutBinding, "key" | "code" | "modifiers">;
/** What the dispatcher needs. */
export interface ShortcutDispatcherOptions {
    /**
     * Which platform Mod maps to. True means Apple, so Mod is Command. False
     * means any other platform, so Mod is Control. A function is read on
     * every dispatch. When omitted, the dispatcher reads the navigator lazily
     * at dispatch time, so importing this module touches nothing.
     */
    readonly applePlatform?: boolean | (() => boolean);
}
/** Whether an event target is editable or interactive. Anything without a
 * closest method, such as the document itself, reads as not interactive. */
export declare function isInteractiveTarget(target: unknown): boolean;
/**
 * Holds bindings by scope. Registering an id twice in one scope throws at
 * registration. The same id in another scope is allowed, so a dialog scope
 * can shadow a page binding.
 */
export declare class ShortcutRegistry {
    #private;
    /**
     * Add a binding. Throws when the scope already holds the id. Returns an
     * unregister function for the binding.
     */
    register(binding: ShortcutBinding): () => void;
    /** Remove a binding by id and scope. Missing bindings cost nothing. */
    unregister(id: string, scope?: string): void;
    /** Every binding, or every binding in one scope, in registration order. */
    list(scope?: string): readonly ShortcutBinding[];
    /** The first binding in a scope that an event hits, or null. */
    find(event: KeyboardEvent, scope: string, apple: boolean, interactive: boolean): ShortcutBinding | null;
}
/**
 * Runs a registry against keydown events. Scopes nest: the dispatcher walks
 * the scope stack from the most recently pushed scope down, and the first
 * scope with a matching binding handles the event. A dialog scope pushed on
 * open shadows the page scope, and popping it on close restores the page.
 */
export declare class ShortcutDispatcher {
    #private;
    readonly registry: ShortcutRegistry;
    constructor(registry: ShortcutRegistry, options?: ShortcutDispatcherOptions);
    /** The active scope stack, least recent first. */
    get scopes(): readonly string[];
    /** Push a scope, so its bindings shadow every scope below. */
    pushScope(scope: string): void;
    /** Pop the most recent scope. The page scope stays, so popping it changes nothing. */
    popScope(): void;
    /**
     * Listen for keydown on a caller passed target. A second call on the same
     * target changes nothing. A call on another target moves the listener.
     */
    start(target: EventTarget): void;
    /** Stop listening. A dispatcher that never started costs nothing. */
    stop(): void;
    /**
     * Run one event through the scope stack. Returns true when a binding
     * handled it. A handled event outside editable targets is prevented, so
     * a space binding never scrolls the page. A binding that fires from an
     * editable target never prevents the default, so typing keeps working.
     * Its handler still may, when the key must not reach the field.
     */
    handle(event: KeyboardEvent): boolean;
}
/**
 * The label a help view shows for a binding, such as Control+Z, Command+Z,
 * or ?. Mod reads Command on Apple platforms and Control elsewhere. A
 * binding that sets both Mod and Control off Apple shows one Control. Only
 * the keys matter here, so a help row passes its binding straight in.
 */
export declare function formatBinding(binding: ShortcutLabel, apple?: boolean): string;
