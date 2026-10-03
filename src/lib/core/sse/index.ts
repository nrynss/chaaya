/**
 * Generic server-sent event reading. The frame splitter and the field parser
 * keep any event name and do not read a payload. A stream opts into the
 * reconnect schedule instead of hard-coding one.
 */
export { parseNamedFrame, takeFrames } from "./frame.js"
export type { CommentFrame, EventFrame, NamedEvent, SseFrame } from "./frame.js"
export { defaultReconnect, reconnectDelay, reconnectSettings } from "./reconnect.js"
export type { ReconnectOptions } from "./reconnect.js"
