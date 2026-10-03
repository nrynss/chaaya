/**
 * Generic server-sent events. The frame splitter and the field parser keep
 * any event name and do not read a payload. `formatNamedFrame` writes a frame
 * the same parser reads back. A stream opts into the reconnect schedule
 * instead of hard-coding one.
 */
export { formatNamedFrame, parseNamedFrame, takeFrames } from "./frame.js"
export type { CommentFrame, EventFrame, NamedEvent, NamedFrameFields, SseFrame } from "./frame.js"
export { defaultReconnect, reconnectDelay, reconnectSettings } from "./reconnect.js"
export type { ReconnectOptions } from "./reconnect.js"
