import { fail, ok, type ParseResult } from "../result.js"

/** A named server-sent event. The data is the raw payload, so the app parses it. */
export interface NamedEvent {
	/** The frame id. Zero when the frame carries no id. */
	id: number
	/** The event name from the frame's event line. */
	name: string
	/** The data lines joined with a newline. Empty when the frame carries none. */
	data: string
}

/** A comment frame, such as a heartbeat. It carries no event name. */
export interface CommentFrame {
	kind: "comment"
	id: number
	comment: string
}

/** A named event frame. */
export interface EventFrame {
	kind: "event"
	id: number
	name: string
	data: string
}

/** One frame a stream can carry before a product parser reads it. */
export type SseFrame = CommentFrame | EventFrame

/**
 * Pull every whole frame out of a decode buffer and leave the unterminated
 * tail behind. A blank line of either ending closes a frame. A run of blank
 * lines adds no frame.
 */
export function takeFrames(buffer: string): { frames: string[]; rest: string } {
	const frames: string[] = []
	let rest = buffer
	for (;;) {
		const boundary = /\r?\n\r?\n/.exec(rest)
		if (boundary === null) break
		const frame = rest.slice(0, boundary.index)
		if (frame.trim() !== "") frames.push(frame)
		rest = rest.slice(boundary.index + boundary[0].length)
	}
	return { frames, rest }
}

/**
 * Read one SSE frame. Any event name is kept. A comment with no event name is
 * a comment frame. A bad id is a failure, and this never throws. The payload
 * is not interpreted.
 */
export function parseNamedFrame(text: string): ParseResult<SseFrame> {
	let id = 0
	let name = ""
	let comment = ""
	const data: string[] = []
	let sawField = false
	for (const raw of text.split("\n")) {
		const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
		if (line === "") {
			if (!sawField) continue
			break
		}
		sawField = true
		const at = line.indexOf(":")
		const field = at === -1 ? line : line.slice(0, at)
		let value = at === -1 ? "" : line.slice(at + 1)
		if (value.startsWith(" ")) value = value.slice(1)
		switch (field) {
			case "":
				comment = value
				break
			case "event":
				name = value
				break
			case "id": {
				const parsed = Number(value)
				if (!Number.isInteger(parsed) || parsed < 0) {
					return fail(`the frame id ${value} is not a whole number`)
				}
				id = parsed
				break
			}
			case "data":
				data.push(value)
				break
		}
	}
	if (name === "") {
		if (comment === "") return fail("the frame carries neither an event nor a comment")
		return ok({ kind: "comment", id, comment })
	}
	return ok({ kind: "event", id, name, data: data.join("\n") })
}
