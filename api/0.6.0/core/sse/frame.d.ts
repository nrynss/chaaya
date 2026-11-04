import { type ParseResult } from "../result.js";
/** A named server-sent event. The data is the raw payload, so the app parses it. */
export interface NamedEvent {
    /** The frame id. Zero when the frame carries no id, an empty id line, or an explicit zero. */
    id: number;
    /** The event name from the frame's event line. */
    name: string;
    /** The data lines joined with a newline. Empty when the frame carries none. */
    data: string;
    /** True when the frame included an id line. Absent when it did not, so a stored id stays. */
    idSet?: boolean;
    /** True when that id line was empty. `id` is 0. Accepting the frame resets Last-Event-ID. */
    resetId?: boolean;
}
/** A comment frame, such as a heartbeat. It carries no event name.
 * The follow loop does not hand it to `onFrame` and does not move Last-Event-ID for it. */
export interface CommentFrame {
    kind: "comment";
    id: number;
    comment: string;
    /** True when the frame included an id line. The loop does not apply it. */
    idSet?: boolean;
    /** True when that id line was empty. `id` is 0. A comment still does not reset Last-Event-ID. */
    resetId?: boolean;
}
/** A named event frame. */
export interface EventFrame {
    kind: "event";
    id: number;
    name: string;
    data: string;
    /** True when the frame included an id line. */
    idSet?: boolean;
    /** True when that id line was empty. `id` is 0. That resets Last-Event-ID. */
    resetId?: boolean;
}
/** One frame a stream can carry before a product parser reads it. */
export type SseFrame = CommentFrame | EventFrame;
/**
 * Pull every whole frame out of a decode buffer and leave the unterminated
 * tail behind. A blank line of either ending closes a frame. A run of blank
 * lines adds no frame.
 */
export declare function takeFrames(buffer: string): {
    frames: string[];
    rest: string;
};
/**
 * Read one SSE frame. Any event name is kept. A comment with no event name is
 * a comment frame. A bad id is a failure, and this never throws. The payload
 * is not interpreted.
 *
 * A whole-number id line is kept, including `id: 0`. An empty id line (`id:`)
 * is a reset: `id` is 0 and `resetId` is set. It is not parsed with
 * `Number("")`. A frame with no id line has `id` 0 and neither flag, so a
 * stored Last-Event-ID stays. A job stream clears Last-Event-ID only when it
 * accepts a frame that carries `resetId` or an explicit id of 0.
 */
export declare function parseNamedFrame(text: string): ParseResult<SseFrame>;
/** Fields written into one SSE frame. Set `event` for an event frame, or `comment` for a comment frame, not both. */
export interface NamedFrameFields {
    /** A whole number, zero or more. Omitted writes no id line. The reader then reports id 0 and does not reset Last-Event-ID. This writer does not emit an empty id line; that reset is `id:` on the wire. */
    id?: number;
    /** The event name. A line break is rejected. */
    event?: string;
    /** The payload. A line break becomes another data line. The reader joins those lines with `\n`. */
    data?: string;
    /** Comment text for a frame that has no event name. A line break is rejected. */
    comment?: string;
}
/**
 * Write one SSE frame as text. `takeFrames` splits it, and `parseNamedFrame`
 * reads the frame back. The payload is not interpreted. This does not build
 * an HTTP response.
 */
export declare function formatNamedFrame(fields: NamedFrameFields): string;
