import { expect, test } from "vitest"
import { TranscriptEditor } from "./editor.svelte.js"
import { createTranscriptBridge, type TranscriptFrame } from "./stream.js"

function frame(name: string, data: unknown, kind?: TranscriptFrame["kind"]): TranscriptFrame {
	return {
		kind,
		name,
		data: typeof data === "string" ? data : JSON.stringify(data)
	}
}

const hello = { start: 0.1, end: 0.4, text: "hello" }
const there = { start: 0.5, end: 0.9, text: "there", speaker: "a" }

test("appends timed words and keeps a speaker", () => {
	const bridge = createTranscriptBridge()
	expect(bridge.apply(frame("word", hello))).toMatchObject({ type: "append", index: 0 })
	expect(bridge.apply(frame("word", there))).toMatchObject({ type: "append", index: 1 })
	expect(bridge.words).toEqual([
		{ start: 0.1, end: 0.4, text: "hello" },
		{ start: 0.5, end: 0.9, text: "there", speaker: "a" }
	])
})

test("ignores comments, empty payloads, and objects that are not words", () => {
	const bridge = createTranscriptBridge()
	bridge.apply(frame("word", hello))
	expect(bridge.apply({ kind: "comment", name: "word", data: JSON.stringify(there) }).type).toBe("ignore")
	expect(bridge.apply(frame("word", "")).type).toBe("ignore")
	expect(bridge.apply(frame("progress", { percent: 1 })).type).toBe("ignore")
	expect(bridge.apply(frame("word", null)).type).toBe("ignore")
	expect(bridge.words).toHaveLength(1)
})

test("a bad word or bad json leaves the list alone", () => {
	const bridge = createTranscriptBridge()
	bridge.apply(frame("word", hello))
	expect(bridge.apply(frame("word", { start: 1, end: 0.2, text: "backwards" })).type).toBe("invalid")
	expect(bridge.apply(frame("word", { start: 1, end: 2 })).type).toBe("invalid")
	expect(bridge.apply(frame("word", { start: 1, end: 2, text: "x", speaker: 4 })).type).toBe("invalid")
	expect(bridge.apply({ name: "word", data: "{not json" })).toEqual({ type: "invalid", reason: "json" })
	expect(bridge.words.map((word) => word.text)).toEqual(["hello"])
})

test("an index revises, an index at the length appends, and a gap is invalid", () => {
	const bridge = createTranscriptBridge()
	bridge.apply(frame("word", hello))
	expect(bridge.apply(frame("word", { ...hello, text: "hi", index: 0 }))).toMatchObject({
		type: "revise",
		index: 0
	})
	expect(bridge.words[0].text).toBe("hi")
	expect(bridge.apply(frame("word", { ...there, index: 1 })).type).toBe("append")
	expect(bridge.apply(frame("word", { ...there, index: 3 }))).toEqual({ type: "invalid", reason: "index" })
	expect(bridge.words).toHaveLength(2)
})

test("a snapshot replaces the list and a bad snapshot does not", () => {
	const bridge = createTranscriptBridge()
	bridge.apply(frame("word", hello))
	expect(bridge.apply(frame("word", [there])).type).toBe("snapshot")
	expect(bridge.words).toEqual([{ start: 0.5, end: 0.9, text: "there", speaker: "a" }])
	expect(bridge.apply(frame("word", { words: [hello, there] })).type).toBe("snapshot")
	expect(bridge.words).toHaveLength(2)
	expect(bridge.apply(frame("word", { words: [{ start: 1, end: 0, text: "no" }] })).type).toBe("invalid")
	expect(bridge.words).toHaveLength(2)
	expect(bridge.apply(frame("word", { start: 0, end: 1, text: "no", words: [] }))).toEqual({
		type: "invalid",
		reason: "both"
	})
	expect(bridge.words).toHaveLength(2)
})

test("snapshots can be turned off", () => {
	const bridge = createTranscriptBridge({ snapshots: false })
	expect(bridge.apply(frame("word", [hello])).type).toBe("ignore")
	expect(bridge.words).toHaveLength(0)
})

test("an events list drops other names, and done ends the list", () => {
	const bridge = createTranscriptBridge({ events: ["word"], doneEvent: "done" })
	expect(bridge.apply(frame("partial", hello)).type).toBe("ignore")
	bridge.apply(frame("word", hello))
	expect(bridge.apply(frame("done", "")).type).toBe("done")
	expect(bridge.done).toBe(true)
	expect(bridge.apply(frame("word", there)).type).toBe("ignore")
	expect(bridge.words).toHaveLength(1)
	bridge.reset()
	expect(bridge.done).toBe(false)
	expect(bridge.words).toHaveLength(0)
	bridge.apply(frame("word", there))
	expect(bridge.words).toHaveLength(1)
})

test("done is recognised even when the events list would hide it", () => {
	const bridge = createTranscriptBridge({ events: ["word"], doneEvent: "done" })
	expect(bridge.apply({ name: "done", data: "ignored" }).type).toBe("done")
})

test("a custom parser can name fields the default reader does not", () => {
	const bridge = createTranscriptBridge({
		parse: (data) => {
			const value = JSON.parse(data) as { tStart: number; tEnd: number; w: string }
			return { start: value.tStart, end: value.tEnd, text: value.w }
		}
	})
	bridge.apply(frame("word", { tStart: 0, tEnd: 0.2, w: "custom" }))
	expect(bridge.words).toEqual([{ start: 0, end: 0.2, text: "custom" }])
})

test("a parser that throws or returns null does not clear the list", () => {
	const bridge = createTranscriptBridge({
		parse: (data) => {
			if (data === "no") return null
			if (data === "ok") return { start: 0, end: 1, text: "kept" }
			throw new Error("bad")
		}
	})
	bridge.apply(frame("word", "ok"))
	expect(bridge.words).toHaveLength(1)
	expect(bridge.apply(frame("word", "no")).type).toBe("ignore")
	expect(bridge.words).toHaveLength(1)
	expect(bridge.apply(frame("word", "x"))).toEqual({ type: "invalid", reason: "parse" })
	expect(bridge.words).toHaveLength(1)
})

test("ordered sorts a copy and leaves arrival order stored", () => {
	const bridge = createTranscriptBridge()
	bridge.apply(frame("word", { start: 1, end: 1.2, text: "second" }))
	bridge.apply(frame("word", { start: 0, end: 0.4, text: "first" }))
	expect(bridge.ordered().map((word) => word.text)).toEqual(["first", "second"])
	expect(bridge.words.map((word) => word.text)).toEqual(["second", "first"])
})

test("the word list is the editor input, with no editor change", () => {
	const bridge = createTranscriptBridge({ doneEvent: "done" })
	bridge.apply(frame("word", hello))
	bridge.apply(frame("word", there))
	bridge.apply(frame("done", ""))
	const editor = new TranscriptEditor(bridge.ordered())
	expect(editor.words.map((word) => word.text)).toEqual(["hello", "there"])
	expect(editor.length).toBeGreaterThan(0)
})
