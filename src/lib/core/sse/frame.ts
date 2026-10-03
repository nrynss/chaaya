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

/** Fields written into one SSE frame. Set `event` for an event frame, or `comment` for a comment frame, not both. */
export interface NamedFrameFields {
	/** A whole number, zero or more. Omitted writes no id line, which the reader treats as zero. */
	id?: number
	/** The event name. A line break is rejected. */
	event?: string
	/** The payload. A line break becomes another data line. The reader joins those lines with `\n`. */
	data?: string
	/** Comment text for a frame that has no event name. A line break is rejected. */
	comment?: string
}

function assertWholeId(id: number): void {
	if (!Number.isInteger(id) || id < 0) {
		throw new Error(`the frame id ${id} is not a whole number`)
	}
}

function assertSingleLine(value: string, label: string): void {
	if (value.includes("\n") || value.includes("\r")) {
		throw new Error(`a ${label} cannot hold a line break`)
	}
}

/**
 * Write one SSE frame as text. `takeFrames` splits it, and `parseNamedFrame`
 * reads the frame back. The payload is not interpreted. This does not build
 * an HTTP response.
 */
export function formatNamedFrame(fields: NamedFrameFields): string {
	const event = fields.event ?? ""
	const comment = fields.comment ?? ""
	if (fields.id !== undefined) assertWholeId(fields.id)
	assertSingleLine(event, "event name")
	assertSingleLine(comment, "comment")
	if (event !== "" && comment !== "") {
		throw new Error("a frame is either an event or a comment")
	}
	if (event === "" && comment === "") {
		throw new Error("the frame carries neither an event nor a comment")
	}
	if (event === "" && fields.data !== undefined && fields.data !== "") {
		throw new Error("a comment frame cannot carry data")
	}
	const lines: string[] = []
	if (fields.id !== undefined) lines.push(`id: ${fields.id}`)
	if (event !== "") {
		lines.push(`event: ${event}`)
		const data = fields.data ?? ""
		for (const part of data.split(/\r\n|\r|\n/)) lines.push(`data: ${part}`)
	} else {
		lines.push(`: ${comment}`)
	}
	return `${lines.join("\n")}\n\n`
}
