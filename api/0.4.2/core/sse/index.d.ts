/**
 * Generic server-sent events. The frame splitter and the field parser keep
 * any event name and do not read a payload. `formatNamedFrame` writes a frame
 * the same parser reads back. A stream opts into the reconnect schedule
 * instead of hard-coding one. `FrameLoop` is the only follow loop.
 * `createEventStream` keeps arbitrary event names on that loop.
 */
export { formatNamedFrame, parseNamedFrame, takeFrames } from "./frame.js";
export type { CommentFrame, EventFrame, NamedEvent, NamedFrameFields, SseFrame } from "./frame.js";
export { FrameBuffer, createEventStream } from "./events.svelte.js";
export type { EventConnection, EventStream, EventStreamOptions } from "./events.svelte.js";
export { FrameLoop } from "./loop.svelte.js";
export type { FrameDecision, FrameLoopOptions, StreamConnection } from "./loop.svelte.js";
export { isPaused, watchPause } from "./pause.js";
export { defaultReconnect, reconnectDelay, reconnectSettings } from "./reconnect.js";
export type { ReconnectOptions } from "./reconnect.js";
