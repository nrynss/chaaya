/**
 * The sync lifecycle. `idle` means nothing is in flight. `syncing` means a
 * flush is running. `conflict` means the server refused a commit and the
 * queue is paused. `error` means the commit function threw and a retry may
 * follow. The document never silently overwrites the server.
 */
export type SyncStatus = "idle" | "syncing" | "conflict" | "error"

/**
 * One undoable change over plain data. Apply and invert must be true
 * inverses: invert(apply(anything)) returns that anything. Undo, redo,
 * rollback, and rebase all rely on that round trip.
 */
export interface EditCommand<T> {
	/** What a history view names this step. */
	readonly label: string
	/**
	 * Merges consecutive entries with the same key into one undo step, such
	 * as a drag or repeated nudges. Omit it for a standalone step.
	 */
	readonly coalesceKey?: string
	apply: (doc: T) => T
	invert: (doc: T) => T
}

/** A proposed change awaiting review. Accepting one runs it as one undoable entry. */
export interface HistoryProposal<T> extends EditCommand<T> {
	readonly id: string
}

/** What the sync layer sends per step, in order, with a running base. */
export interface CommitRequest<T> {
	/** The server revision this send builds on. */
	readonly base: number
	/** The document after this step, from the last acknowledged state. */
	readonly doc: T
	readonly label: string
}

/**
 * What a commit answers. Success carries the new revision. A conflict
 * refusal carries the server head instead, and never applies the send.
 */
export type CommitResponse<T> = { readonly revision: number } | { readonly conflict: true; readonly headRevision: number; readonly head: T }

/** Sends one step to the server. Throwing reports a network failure. */
export type CommitFn<T> = (request: CommitRequest<T>) => Promise<CommitResponse<T>>

/** What an edit history needs. */
export interface EditHistoryOptions<T> {
	/** Sends one step to the server. Omit it for a local history. */
	readonly commit?: CommitFn<T>
}

/** One entry in the undo list. */
interface HistoryEntry<T> {
	label: string
	apply: (doc: T) => T
	invert: (doc: T) => T
	readonly coalesceKey: string | undefined
	applied: boolean
	committed: boolean
}

/** One open transaction frame. */
interface TransactionFrame<T> {
	readonly label: string
	readonly entries: HistoryEntry<T>[]
	readonly doc: T
}

/** A deep copy for plain data. Histories hold data, never functions. */
function clone<T>(doc: T): T {
	return structuredClone(doc)
}

/**
 * Undo, redo, and server sync over plain data. Every local change runs
 * through entries, so undo inverts them in place. Sync replays the same
 * entries against the server in order. Proposals wait in a separate list
 * until the caller accepts or dismisses them.
 */
export class EditHistory<T> {
	/** The live document, with every local change applied. */
	doc = $state<T>() as T
	/** The last acknowledged server revision. */
	serverRevision = $state(0)
	/** The document the server last acknowledged. */
	serverDoc = $state<T>() as T
	/** The sync lifecycle. */
	status = $state<SyncStatus>("idle")
	/** The server head behind a conflict, or null elsewhere. */
	conflict = $state<{ headRevision: number; head: T } | null>(null)
	/** The failure behind an error status, or null elsewhere. */
	lastError = $state<unknown>(null)
	/** Proposals awaiting review. Accepting one runs it as one entry. */
	proposals = $state<HistoryProposal<T>[]>([])
	entries = $state<HistoryEntry<T>[]>([])

	#commit: CommitFn<T> | undefined
	#frames: TransactionFrame<T>[] = []
	#proposalCount = 0
	#inflight: Promise<void> | null = null

	constructor(initial: T, options: EditHistoryOptions<T> = {}) {
		this.doc = clone(initial)
		this.serverDoc = clone(initial)
		this.#commit = options.commit
	}

	/** Whether an undo step exists. */
	get canUndo(): boolean {
		return this.entries.some((entry) => entry.applied)
	}

	/** Whether a redo step exists. */
	get canRedo(): boolean {
		return this.entries.some((entry) => !entry.applied)
	}

	/** The labels of applied steps, oldest first. A history view reads these. */
	get pastLabels(): string[] {
		return this.entries.filter((entry) => entry.applied).map((entry) => entry.label)
	}

	/** The labels of undone steps, oldest first. A history view reads these. */
	get futureLabels(): string[] {
		return this.entries.filter((entry) => !entry.applied).map((entry) => entry.label)
	}

	/** How many steps await a commit. */
	get pendingCount(): number {
		return this.entries.filter((entry) => (entry.applied && !entry.committed) || (!entry.applied && entry.committed)).length
	}

	/** Whether every step is committed and nothing failed. */
	get synced(): boolean {
		return this.status === "idle" && this.pendingCount === 0
	}

	/** The topmost applied entry, or undefined. */
	#topApplied(): HistoryEntry<T> | undefined {
		for (let index = this.entries.length - 1; index >= 0; index -= 1) {
			if (this.entries[index].applied) return this.entries[index]
		}
		return undefined
	}

	/** The earliest undone entry, or undefined. Redo runs earliest first. */
	#firstUndone(): HistoryEntry<T> | undefined {
		return this.entries.find((entry) => !entry.applied)
	}

	/**
	 * Run one command. A coalescing key merges into the topmost applied
	 * entry with the same key when that entry is still unsent. Merging a
	 * committed entry would rewrite what the server already holds, so a
	 * committed top starts a fresh entry instead.
	 */
	execute(command: EditCommand<T>): void {
		if (this.#frames.length > 0) {
			this.#executeBuffered(command)
			return
		}
		this.entries = this.entries.filter((entry) => entry.applied || entry.committed)
		this.doc = command.apply(this.doc)
		const top = this.#topApplied()
		if (
			top !== undefined &&
			command.coalesceKey !== undefined &&
			top.coalesceKey === command.coalesceKey &&
			!top.committed
		) {
			const first = top.apply
			const last = top.invert
			top.apply = (doc: T) => command.apply(first(doc))
			top.invert = (doc: T) => last(command.invert(doc))
			return
		}
		this.entries = [
			...this.entries,
			{ label: command.label, apply: command.apply, invert: command.invert, coalesceKey: command.coalesceKey, applied: true, committed: false }
		]
	}

	/** Run one command inside the open transaction frame. Buffered commands
	 * never merge into earlier entries, so the frame commit groups exactly
	 * what ran inside it. */
	#executeBuffered(command: EditCommand<T>): void {
		this.entries = this.entries.filter((entry) => entry.applied || entry.committed)
		this.doc = command.apply(this.doc)
		this.entries = [
			...this.entries,
			{ label: command.label, apply: command.apply, invert: command.invert, coalesceKey: command.coalesceKey, applied: true, committed: false }
		]
	}

	/** Undo the topmost applied step. Returns false with nothing to undo. */
	undo(): boolean {
		if (this.#frames.length > 0) throw new Error("Undo runs outside a transaction.")
		const top = this.#topApplied()
		if (top === undefined) return false
		top.applied = false
		this.doc = top.invert(this.doc)
		return true
	}

	/** Redo the earliest undone step. Returns false with nothing to redo. */
	redo(): boolean {
		if (this.#frames.length > 0) throw new Error("Redo runs outside a transaction.")
		const first = this.#firstUndone()
		if (first === undefined) return false
		first.applied = true
		this.doc = first.apply(this.doc)
		return true
	}

	/**
	 * Group several commands into one undo step under one label. The
	 * commands run at once, so the document moves during the frame. A throw
	 * rolls every buffered command back and reruns nothing. Undo and redo
	 * stay outside, and frames nest.
	 */
	transaction(label: string, run: () => void): void {
		const frame: TransactionFrame<T> = { label, entries: this.entries, doc: clone(this.doc) }
		this.#frames.push(frame)
		try {
			run()
		} catch (error) {
			this.#frames.pop()
			this.entries = frame.entries
			this.doc = frame.doc
			throw error
		}
		this.#frames.pop()
		const buffered = this.entries.filter((entry) => !frame.entries.includes(entry))
		if (buffered.length === 0) return
		const kept = this.entries.filter((entry) => frame.entries.includes(entry))
		const applies = buffered.map((entry) => entry.apply)
		const inverts = buffered.map((entry) => entry.invert).reverse()
		const grouped: HistoryEntry<T> = {
			label,
			apply: (doc: T) => applies.reduce((next, apply) => apply(next), doc),
			invert: (doc: T) => inverts.reduce((next, invert) => invert(next), doc),
			coalesceKey: undefined,
			applied: true,
			committed: false
		}
		this.entries = [...kept, grouped]
	}

	/**
	 * Park a change for review. Returns the proposal id. A proposal changes
	 * nothing until the caller accepts it.
	 */
	propose(command: EditCommand<T>): string {
		this.#proposalCount += 1
		const id = `proposal-${this.#proposalCount}`
		this.proposals = [...this.proposals, { ...command, id }]
		return id
	}

	/**
	 * Accept a proposal as one undoable entry. Returns false for an unknown id.
	 */
	acceptProposal(id: string): boolean {
		const proposal = this.proposals.find((candidate) => candidate.id === id)
		if (proposal === undefined) return false
		if (this.#frames.length > 0) throw new Error("Proposals are accepted outside a transaction.")
		this.proposals = this.proposals.filter((candidate) => candidate.id !== id)
		this.execute({ label: proposal.label, apply: proposal.apply, invert: proposal.invert })
		return true
	}

	/** Dismiss a proposal unread. Returns false for an unknown id. */
	dismissProposal(id: string): boolean {
		if (!this.proposals.some((candidate) => candidate.id === id)) return false
		this.proposals = this.proposals.filter((candidate) => candidate.id !== id)
		return true
	}

	/**
	 * Send every pending step in order with a running base. Undone steps
	 * that reached the server go first as inverses, oldest undone last, so
	 * the server sheds them before it takes the new work. A conflict refusal
	 * pauses the queue, rolls the document back to the last acknowledged
	 * state, and exposes the server head. A thrown failure keeps every local
	 * change and reports for a retry.
	 */
	async flush(): Promise<void> {
		if (this.#inflight !== null) return this.#inflight
		this.#inflight = this.#flushOnce()
		try {
			await this.#inflight
		} finally {
			this.#inflight = null
		}
	}

	async #flushOnce(): Promise<void> {
		const commit = this.#commit
		if (commit === undefined) {
			if (this.pendingCount === 0) return
			throw new Error("A history without a commit function stays local.")
		}
		this.status = "syncing"
		this.lastError = null
		let sendDoc = clone(this.serverDoc)
		let revision = this.serverRevision
		try {
			const undone = this.entries.filter((entry) => !entry.applied && entry.committed).reverse()
			for (const entry of undone) {
				sendDoc = entry.invert(sendDoc)
				const answer = await commit({ base: revision, doc: clone(sendDoc), label: `Revert ${entry.label}` })
				if ("conflict" in answer) {
					this.#pause(answer.headRevision, answer.head)
					return
				}
				revision = answer.revision
				this.serverRevision = revision
				this.serverDoc = clone(sendDoc)
				entry.committed = false
			}
			const applied = this.entries.filter((entry) => entry.applied && !entry.committed)
			for (const entry of applied) {
				sendDoc = entry.apply(sendDoc)
				const answer = await commit({ base: revision, doc: clone(sendDoc), label: entry.label })
				if ("conflict" in answer) {
					this.#pause(answer.headRevision, answer.head)
					return
				}
				revision = answer.revision
				this.serverRevision = revision
				this.serverDoc = clone(sendDoc)
				entry.committed = true
			}
			this.conflict = null
			this.status = "idle"
		} catch (error) {
			this.status = "error"
			this.lastError = error
			throw error
		}
	}

	/** Pause on a conflict and roll back to the last acknowledged state. */
	#pause(headRevision: number, head: T): void {
		this.conflict = { headRevision, head: clone(head) }
		this.doc = clone(this.serverDoc)
		this.status = "conflict"
	}

	/**
	 * Adopt the exposed head and replay every pending step onto it. Returns
	 * false with no conflict to adopt. Committed steps stay committed: the
	 * server already holds them, and the head builds on them. Pending steps
	 * replay as deltas onto the head, so a step must change the document
	 * relative to its base rather than replace it outright. The queue
	 * resumes as unsent, so the next flush sends the replayed steps against
	 * the new base.
	 */
	rebase(): boolean {
		const conflict = this.conflict
		if (conflict === null || this.status !== "conflict") return false
		this.serverDoc = clone(conflict.head)
		this.serverRevision = conflict.headRevision
		let next = clone(conflict.head)
		for (const entry of this.entries) {
			if (!entry.applied || entry.committed) continue
			next = entry.apply(next)
		}
		this.doc = next
		this.conflict = null
		this.lastError = null
		this.status = "idle"
		return true
	}

	/**
	 * Forget every unsent step and return to the last acknowledged state.
	 * Committed steps keep their undo depth. A conflict clears with the rest.
	 */
	discardPending(): void {
		this.entries = this.entries.filter((entry) => entry.committed)
		this.doc = clone(this.serverDoc)
		this.conflict = null
		this.lastError = null
		this.status = "idle"
	}
}
