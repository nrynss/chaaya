import { expect, test } from "vitest"
import { EditHistory, type CommitRequest, type CommitResponse, type EditCommand } from "./history.svelte.js"

/** Add a fixed step to a counter. */
function add(step: number, label = `add ${step}`, coalesceKey?: string): EditCommand<number> {
	return {
		label,
		coalesceKey,
		apply: (doc) => doc + step,
		invert: (doc) => doc - step
	}
}

/** A commit stub that records its requests and answers from a script. */
function stubCommit(script: (request: CommitRequest<number>) => CommitResponse<number> | never): {
	commit: (request: CommitRequest<number>) => Promise<CommitResponse<number>>
	requests: () => CommitRequest<number>[]
} {
	const seen: CommitRequest<number>[] = []
	return {
		commit: async (request) => {
			seen.push(request)
			return script(request)
		},
		requests: () => [...seen]
	}
}

test("execute, undo, and redo move the document", () => {
	const history = new EditHistory<number>(0)
	expect(history.canUndo).toBe(false)
	expect(history.canRedo).toBe(false)
	history.execute(add(1))
	history.execute(add(2))
	expect(history.doc).toBe(3)
	expect(history.canUndo).toBe(true)
	expect(history.undo()).toBe(true)
	expect(history.doc).toBe(1)
	expect(history.canRedo).toBe(true)
	expect(history.redo()).toBe(true)
	expect(history.doc).toBe(3)
	expect(history.undo()).toBe(true)
	expect(history.undo()).toBe(true)
	expect(history.doc).toBe(0)
	expect(history.undo()).toBe(false)
	expect(history.canUndo).toBe(false)
})

test("apply then invert returns the start", () => {
	const history = new EditHistory<number>(10)
	const command = add(7, "seven")
	history.execute(command)
	expect(history.doc).toBe(17)
	expect(command.invert(history.doc)).toBe(10)
})

test("a coalescing key merges a drag into one undo step", () => {
	const history = new EditHistory<number>(0)
	history.execute(add(1, "nudge", "move"))
	history.execute(add(1, "nudge", "move"))
	history.execute(add(1, "nudge", "move"))
	expect(history.doc).toBe(3)
	expect(history.pastLabels).toEqual(["nudge"])
	expect(history.undo()).toBe(true)
	expect(history.doc).toBe(0)
	expect(history.canUndo).toBe(false)
})

test("another key breaks the run, and redo drops on a fresh execute", () => {
	const history = new EditHistory<number>(0)
	history.execute(add(1, "nudge", "move"))
	history.execute(add(10, "jump"))
	expect(history.pastLabels).toEqual(["nudge", "jump"])
	history.undo()
	history.undo()
	expect(history.doc).toBe(0)
	history.redo()
	expect(history.doc).toBe(1)
	history.execute(add(100, "fresh"))
	expect(history.canRedo).toBe(false)
	expect(history.doc).toBe(101)
})

test("a transaction groups several commands into one entry", () => {
	const history = new EditHistory<number>(0)
	history.transaction("insert word", () => {
		history.execute(add(1, "letter"))
		history.execute(add(2, "letter"))
		history.execute(add(4, "letter"))
	})
	expect(history.doc).toBe(7)
	expect(history.pastLabels).toEqual(["insert word"])
	expect(history.undo()).toBe(true)
	expect(history.doc).toBe(0)
	expect(history.redo()).toBe(true)
	expect(history.doc).toBe(7)
})

test("a throwing transaction rolls back and reruns nothing", () => {
	const history = new EditHistory<number>(5)
	history.execute(add(1, "before"))
	const failure = new Error("The frame failed.")
	expect(() =>
		history.transaction("broken", () => {
			history.execute(add(10, "inside"))
			throw failure
		})
	).toThrowError(failure)
	expect(history.doc).toBe(6)
	expect(history.pastLabels).toEqual(["before"])
})

test("undo and redo stay outside a transaction", () => {
	const history = new EditHistory<number>(0)
	history.execute(add(1))
	expect(() => history.transaction("bad", () => history.undo())).toThrowError(/outside a transaction/)
	expect(() => history.transaction("bad", () => history.redo())).toThrowError(/outside a transaction/)
	expect(history.doc).toBe(1)
})

test("proposals wait apart, and accepting one adds one undoable entry", () => {
	const history = new EditHistory<number>(0)
	const first = history.propose(add(3, "suggested"))
	const second = history.propose(add(30, "other"))
	expect(history.doc).toBe(0)
	expect(history.proposals.map((proposal) => proposal.id)).toEqual([first, second])
	expect(history.acceptProposal("missing")).toBe(false)
	expect(history.acceptProposal(first)).toBe(true)
	expect(history.doc).toBe(3)
	expect(history.pastLabels).toEqual(["suggested"])
	expect(history.undo()).toBe(true)
	expect(history.doc).toBe(0)
	expect(history.dismissProposal(second)).toBe(true)
	expect(history.dismissProposal(second)).toBe(false)
	expect(history.proposals).toEqual([])
})

test("a flush sends pending steps in order with a running base", async () => {
	let revision = 4
	const stub = stubCommit(() => ({ revision: (revision += 1) }))
	const history = new EditHistory<number>(10, { commit: stub.commit })
	history.serverRevision = 4
	history.serverDoc = 10
	history.execute(add(1, "first"))
	history.execute(add(2, "second"))
	expect(history.pendingCount).toBe(2)
	expect(history.synced).toBe(false)
	await history.flush()
	expect(history.synced).toBe(true)
	expect(history.serverRevision).toBe(6)
	expect(stub.requests().map((request) => [request.base, request.doc])).toEqual([
		[4, 11],
		[5, 13]
	])
	expect(stub.requests().map((request) => request.label)).toEqual(["first", "second"])
})

test("a conflict pauses the queue, rolls back, and rebase replays", async () => {
	let serverRev = 7
	const stub = stubCommit((request) => {
		if (request.base !== serverRev) return { conflict: true, headRevision: serverRev, head: 100 }
		serverRev += 1
		return { revision: serverRev }
	})
	const history = new EditHistory<number>(10, { commit: stub.commit })
	history.serverRevision = 5
	history.serverDoc = 10
	history.execute(add(1, "first"))
	history.execute(add(2, "second"))
	await history.flush()
	expect(history.status).toBe("conflict")
	expect(history.conflict).toEqual({ headRevision: 7, head: 100 })
	expect(history.doc).toBe(10)
	expect(history.rebase()).toBe(true)
	expect(history.doc).toBe(103)
	expect(history.serverRevision).toBe(7)
	expect(history.status).toBe("idle")
	await history.flush()
	expect(history.synced).toBe(true)
	expect(history.serverRevision).toBe(9)
	expect(history.doc).toBe(103)
	expect(history.rebase()).toBe(false)
})

test("a conflict after a partial send keeps the acknowledged prefix", async () => {
	const stub = stubCommit((request) => {
		if (request.base === 5) return { revision: 6 }
		return { conflict: true, headRevision: 9, head: 50 }
	})
	const history = new EditHistory<number>(0, { commit: stub.commit })
	history.serverRevision = 5
	history.serverDoc = 0
	history.execute(add(1, "first"))
	history.execute(add(2, "second"))
	await history.flush()
	expect(history.status).toBe("conflict")
	// The first step landed, so the rollback shows it and drops the refused one.
	expect(history.doc).toBe(1)
	expect(history.serverRevision).toBe(6)
	expect(history.rebase()).toBe(true)
	// Only the pending step replays. The landed step belongs to the server now.
	expect(history.doc).toBe(52)
})

test("a thrown commit keeps local edits and a retry lands them", async () => {
	let attempts = 0
	const stub = stubCommit(() => {
		attempts += 1
		if (attempts === 1) throw new Error("The network dropped.")
		return { revision: 6 }
	})
	const history = new EditHistory<number>(0, { commit: stub.commit })
	history.serverRevision = 5
	history.serverDoc = 0
	history.execute(add(4, "edit"))
	await expect(history.flush()).rejects.toThrowError(/dropped/)
	expect(history.status).toBe("error")
	expect(history.lastError).toBeInstanceOf(Error)
	expect(history.doc).toBe(4)
	await history.flush()
	expect(history.synced).toBe(true)
	expect(history.doc).toBe(4)
	expect(history.serverRevision).toBe(6)
})

test("undo of a committed step sends its inverse on the next flush", async () => {
	let revision = 5
	const stub = stubCommit(() => ({ revision: (revision += 1) }))
	const history = new EditHistory<number>(0, { commit: stub.commit })
	history.serverRevision = 5
	history.serverDoc = 0
	history.execute(add(10, "ten"))
	await history.flush()
	expect(history.synced).toBe(true)
	history.undo()
	expect(history.doc).toBe(0)
	expect(history.pendingCount).toBe(1)
	await history.flush()
	expect(history.synced).toBe(true)
	expect(stub.requests().map((request) => [request.base, request.doc])).toEqual([
		[5, 10],
		[6, 0]
	])
})

test("discard forgets unsent steps and keeps committed undo depth", async () => {
	let revision = 5
	const stub = stubCommit(() => ({ revision: (revision += 1) }))
	const history = new EditHistory<number>(0, { commit: stub.commit })
	history.serverRevision = 5
	history.serverDoc = 0
	history.execute(add(10, "kept"))
	await history.flush()
	history.execute(add(1, "dropped"))
	expect(history.doc).toBe(11)
	history.discardPending()
	expect(history.doc).toBe(10)
	expect(history.pendingCount).toBe(0)
	expect(history.synced).toBe(true)
	expect(history.undo()).toBe(true)
	expect(history.doc).toBe(0)
})

test("a flush without a commit function throws while steps wait", async () => {
	const history = new EditHistory<number>(0)
	history.execute(add(1))
	await expect(history.flush()).rejects.toThrowError(/stays local/)
	history.undo()
	await history.flush()
	expect(history.synced).toBe(true)
})
