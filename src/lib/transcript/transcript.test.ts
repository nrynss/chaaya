import { expect, test } from "vitest"
import { TranscriptEditor } from "./editor.svelte"
import {
	cutSpans,
	editedEnd,
	editedLength,
	editedStart,
	mergeRanges,
	toEditedTime,
	toSourceTime,
	type TranscriptCut,
	type TranscriptWord
} from "./transcript"

/** Six synthetic words, each half a second long with a tenth gap. */
function words(): TranscriptWord[] {
	const texts = ["amber", "wakes", "before", "dawn", "daily", "early"]
	return texts.map((text, index) => ({
		start: index * 0.6,
		end: index * 0.6 + 0.5,
		text
	}))
}

/** One cut over the given word indexes. */
function cut(start: number, end: number, id = "cut-1"): TranscriptCut {
	return { id, range: { start, end }, reason: "clarity" }
}

test("a word after one cut maps to source minus the cut length both ways", () => {
	const list = words()
	const cuts = [cut(1, 2)]
	// Words 1 and 2 run 0.6 to 1.7, so the cut removes 1.1 seconds.
	const probe = 3.0
	const edited = toEditedTime(list, cuts, probe)
	expect(edited).toBeCloseTo(probe - 1.1, 10)
	expect(toSourceTime(list, cuts, edited)).toBeCloseTo(probe, 10)
	expect(editedStart(list, cuts, 3)).toBeCloseTo(list[3].start - 1.1, 10)
	expect(editedEnd(list, cuts, 4)).toBeCloseTo(list[4].end - 1.1, 10)
	expect(editedLength(list, cuts)).toBeCloseTo(list[5].end - 1.1, 10)
})

test("a boundary word maps at its own edge rather than the neighbour start", () => {
	const list = words()
	const cuts = [cut(1, 2)]
	// Word 1 ends at 1.1 and word 2 ends at 1.7. The shared collapsed point
	// is 0.6. Both cut words collapse there, and word 3 keeps its own start.
	expect(editedStart(list, cuts, 1)).toBeCloseTo(0.6, 10)
	expect(editedEnd(list, cuts, 1)).toBeCloseTo(0.6, 10)
	expect(editedStart(list, cuts, 2)).toBeCloseTo(0.6, 10)
	expect(editedEnd(list, cuts, 2)).toBeCloseTo(0.6, 10)
	expect(editedStart(list, cuts, 3)).toBeCloseTo(0.7, 10)
	// A position inside the cut maps to the collapsed point. A position
	// exactly on it maps back to the cut start, the earlier edge.
	expect(toEditedTime(list, cuts, 1.4)).toBeCloseTo(0.6, 10)
	expect(toSourceTime(list, cuts, 0.6)).toBeCloseTo(0.6, 10)
})

test("overlapping cuts merge into one span and never double count", () => {
	const list = words()
	const cuts = [cut(1, 3, "cut-1"), cut(2, 4, "cut-2")]
	const merged = mergeRanges(list.length, cuts)
	expect(merged).toEqual([{ start: 1, end: 4 }])
	const spans = cutSpans(list, cuts)
	expect(spans).toHaveLength(1)
	// Words 1 through 4 run 0.6 to 2.9, so one merged cut removes 2.3.
	expect(spans[0].start).toBeCloseTo(0.6, 10)
	expect(spans[0].end).toBeCloseTo(2.9, 10)
	const edited = toEditedTime(list, cuts, 3.1)
	expect(edited).toBeCloseTo(3.1 - 2.3, 10)
	expect(toSourceTime(list, cuts, edited)).toBeCloseTo(3.1, 10)
})

test("touching cuts join into one range", () => {
	const list = words()
	const merged = mergeRanges(list.length, [cut(0, 1, "cut-1"), cut(2, 3, "cut-2")])
	expect(merged).toEqual([{ start: 0, end: 3 }])
})

test("revert restores every original position by value", () => {
	const list = words()
	const editor = new TranscriptEditor(list)
	editor.select(1)
	editor.extend(2)
	const made = editor.cut("clarity")
	expect(made).not.toBeNull()
	const before = list.map((word) => word.start)
	const shifted = list.map((_, index) => editor.editedStart(index))
	expect(shifted[3]).toBeCloseTo(list[3].start - 1.1, 10)
	expect(editor.revert(made?.id ?? "missing")).not.toBe("unknown-cut")
	for (let index = 0; index < list.length; index += 1) {
		expect(editor.editedStart(index)).toBeCloseTo(before[index], 10)
		expect(editor.editedEnd(index)).toBeCloseTo(list[index].end, 10)
		expect(editor.toEdited(list[index].start)).toBeCloseTo(list[index].start, 10)
		expect(editor.toSource(list[index].start)).toBeCloseTo(list[index].start, 10)
	}
	expect(editor.length).toBeCloseTo(list[list.length - 1].end, 10)
})

test("an unknown revert id leaves every cut untouched", () => {
	const editor = new TranscriptEditor(words())
	editor.select(0)
	editor.cut("clarity")
	expect(editor.revert("cut-9")).toBe("unknown-cut")
	expect(editor.cuts).toHaveLength(1)
})

test("selection clamps to the word list and orders either way", () => {
	const editor = new TranscriptEditor(words())
	editor.select(9)
	expect(editor.selection).toEqual({ start: 5, end: 5 })
	editor.select(4)
	editor.extend(2)
	expect(editor.selection).toEqual({ start: 2, end: 4 })
})

test("a cut clears the selection and the next cut keeps counting", () => {
	const editor = new TranscriptEditor(words())
	editor.select(0)
	const first = editor.cut("clarity")
	editor.select(3)
	const second = editor.cut("aside")
	expect(editor.selection).toBeNull()
	expect(first?.id).toBe("cut-1")
	expect(second?.id).toBe("cut-2")
	editor.revertAll()
	expect(editor.cuts).toHaveLength(0)
})

test("empty words read a zero length and ignore selection", () => {
	const editor = new TranscriptEditor([])
	expect(editor.length).toBe(0)
	expect(editor.selection).toBeNull()
	editor.select(0)
	expect(editor.selection).toBeNull()
	expect(editor.cut()).toBeNull()
})
