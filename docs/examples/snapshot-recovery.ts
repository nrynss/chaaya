import { createEventStream } from "$lib/core/sse/index.js"
import type { EventStreamOptions, NamedEvent } from "$lib/core/sse/index.js"

/** Application positions survive independently of the broker's transport ids. */
export interface SnapshotPosition {
	epoch: string
	sequence: number
}

export interface Snapshot<State> extends SnapshotPosition {
	state: State
}

export interface Change<Value> extends SnapshotPosition {
	change: Value
}

export interface SnapshotRecoveryOptions<State, Value> {
	events: readonly string[]
	/** Read one coherent, validated snapshot and its application position. */
	readSnapshot: (signal: AbortSignal) => Promise<Snapshot<State>>
	/** Validate the application's event payload. A malformed payload may throw. */
	decode: (event: NamedEvent) => Change<Value>
	/** Undefined invalidates the old view while the new snapshot loads. */
	replace: (state: State | undefined) => void
	apply: (change: Value) => void
	onError: (error: unknown) => void
	reconnect?: EventStreamOptions["reconnect"]
	pauseWhenHidden?: boolean
}

/** Copy into an app and adapt its payloads. This is an example, not a package export. */
export function createSnapshotRecovery<State, Value>(url: string, options: SnapshotRecoveryOptions<State, Value>) {
	let generation = 0
	let closed = false
	let request: AbortController | undefined
	let position: SnapshotPosition | undefined
	let pending: Change<Value>[] = []

	function close(): void {
		if (closed) return
		closed = true
		generation += 1
		request?.abort()
		pending = []
		stream.close()
	}

	function fail(error: unknown): void {
		close()
		position = undefined
		options.replace(undefined)
		options.onError(error)
	}

	function apply(change: Change<Value>, buffered = false): void {
		if (position === undefined) {
			if (pending.length >= 128) throw new Error("snapshot recovery buffer is full")
			pending.push(change)
			return
		}
		if (change.epoch !== position.epoch) {
			if (buffered) return
			throw new Error("snapshot recovery found a live change from another epoch")
		}
		if (change.sequence <= position.sequence) return
		if (change.sequence !== position.sequence + 1) {
			throw new Error("snapshot recovery found an application sequence gap")
		}
		options.apply(change.change)
		position = { epoch: change.epoch, sequence: change.sequence }
	}

	const stream = createEventStream(url, {
		// A filtered-out reset cannot clear Last-Event-ID.
		events: [...options.events, "reset"],
		reconnect: options.reconnect,
		pauseWhenHidden: options.pauseWhenHidden,
		onFrame(event) {
			// The transport accepts this frame and clears its cursor. No second fetch.
			if (event.name === "reset" || closed) return
			try {
				apply(options.decode(event))
			} catch (error) {
				fail(error)
			}
		},
		async catchUp() {
			const ownGeneration = ++generation
			request?.abort()
			const controller = new AbortController()
			request = controller
			pending = []
			position = undefined
			const current = () => !closed && generation === ownGeneration && stream.connection === "live"
			try {
				options.replace(undefined)
				const snapshot = await options.readSnapshot(controller.signal)
				// Cancellation alone cannot protect against a loader that ignores its signal.
				if (!current()) return
				position = { epoch: snapshot.epoch, sequence: snapshot.sequence }
				options.replace(snapshot.state)
				const buffered = pending
				pending = []
				for (const change of buffered) apply(change, true)
			} catch (error) {
				if (current()) fail(error)
			}
		},
	})

	return { stream, close }
}
