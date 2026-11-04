import { describe, expect, it, vi } from "vitest"
import { EditHistory } from "./history.js"

const add = (amount: number, label = `add ${amount}`) => ({
	label,
	apply: (doc: number) => doc + amount,
	invert: (doc: number) => doc - amount
})

describe("EditHistory notifications", () => {
	it("notifies once per method that changed it", () => {
		const history = new EditHistory<number>(0)
		const heard = vi.fn()
		history.subscribe(heard)
		history.execute(add(1))
		expect(heard).toHaveBeenCalledTimes(1)
		const entries = history.entries
		history.undo()
		expect(heard).toHaveBeenCalledTimes(2)
		expect(history.entries).not.toBe(entries)
		expect(history.redo()).toBe(true)
		expect(heard).toHaveBeenCalledTimes(3)
		expect(history.undo()).toBe(true)
		expect(history.undo()).toBe(false)
		expect(heard).toHaveBeenCalledTimes(4)
		const id = history.propose(add(5))
		expect(heard).toHaveBeenCalledTimes(5)
		history.acceptProposal(id)
		expect(heard).toHaveBeenCalledTimes(6)
		expect(history.proposals).toEqual([])
		expect(history.doc).toBe(5)
	})

	it("a transaction notifies once when the outermost frame closes", () => {
		const history = new EditHistory<number>(0)
		const heard = vi.fn()
		history.subscribe(heard)
		history.transaction("both", () => {
			history.execute(add(1))
			history.transaction("inner", () => history.execute(add(2)))
			expect(heard).not.toHaveBeenCalled()
		})
		expect(heard).toHaveBeenCalledTimes(1)
		expect(history.pastLabels).toEqual(["both"])
		expect(history.doc).toBe(3)
		history.transaction("empty", () => {})
		expect(heard).toHaveBeenCalledTimes(1)
	})

	it("a throwing transaction rolls back and notifies once only when it ran a command", () => {
		const history = new EditHistory<number>(0)
		const heard = vi.fn()
		history.subscribe(heard)
		expect(() => history.transaction("fails", () => {
			history.execute(add(1))
			throw new Error("stop")
		})).toThrow("stop")
		expect(history.doc).toBe(0)
		expect(heard).toHaveBeenCalledTimes(1)
		expect(() => history.transaction("fails", () => {
			throw new Error("stop")
		})).toThrow("stop")
		expect(heard).toHaveBeenCalledTimes(1)
	})

	it("a flush notifies its start, each answer, and its end", async () => {
		let revision = 0
		const history = new EditHistory<number>(0, { commit: async () => ({ revision: (revision += 1) }) })
		history.execute(add(1))
		history.execute(add(2))
		const statuses: string[] = []
		history.subscribe(() => statuses.push(`${history.status}:${history.serverRevision}`))
		await history.flush()
		expect(statuses).toEqual(["syncing:0", "syncing:1", "syncing:2", "idle:2"])
	})
})

describe("entries snapshots", () => {
	const step = { label: "one", apply: (doc: { n: number }) => ({ n: doc.n + 1 }), invert: (doc: { n: number }) => ({ n: doc.n - 1 }) }

	it("a kept snapshot never moves when a later undo, redo or commit lands", async () => {
		const history = new EditHistory({ n: 0 }, { commit: async () => ({ revision: 1 }) })
		history.execute(step)
		const before = history.entries
		history.undo()
		expect(before[0].applied).toBe(true)
		const undone = history.entries
		expect(undone[0]).not.toBe(before[0])
		history.redo()
		expect(undone[0].applied).toBe(false)
		const redone = history.entries
		await history.flush()
		expect(redone[0].committed).toBe(false)
		expect(history.entries[0].committed).toBe(true)
	})

	it("a snapshot is stable between changes and frozen", () => {
		const history = new EditHistory({ n: 0 })
		history.execute(step)
		expect(history.entries).toBe(history.entries)
		expect(Object.isFrozen(history.entries[0])).toBe(true)
	})
})
