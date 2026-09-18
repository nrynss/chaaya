/**
 * One live session, closed exactly once when its page goes away. A page
 * builds one guard, calls attach() after it mounts, and calls destroy() when
 * it is destroyed. Building the guard touches no browser global, so a server
 * render may build one freely.
 */
export { SessionGuard } from "./session-guard.svelte.js";
export type { SessionGuardOptions } from "./session-guard.svelte.js";
