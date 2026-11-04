// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { createSnapshotRecovery } from "../../../../docs/examples/snapshot-recovery.js"
import type { Change, Snapshot } from "../../../../docs/examples/snapshot-recovery.js"
import { formatNamedFrame } from "./frame.js"

type Record = { id: number; change: Change<number> }
type Subscriber = {
	controller: ReadableStreamDefaultController<Uint8Array>
	ready: boolean
	buffer: Record[]
}

/** Equivalent of Keel's bounded replay and atomic replay-to-live handoff.
 * The application wrapper adds reset only after registration, before replay.
 * No Go server runs in this fixture; the real Chaaya fetch/parser loop does. */
class RecoveryBroker {
	epoch = "first"
	sequence = 0
	state = 0
	readonly cursors: (string | null)[] = []
	onReady: (() => void) | undefined
	#id = 0
	#history: Record[] = []
	#subscribers = new Set<Subscriber>()
	#encoder = new TextEncoder()

	publish(change: number): void {
		this.state += change
		const record = { id: ++this.#id, change: { epoch: this.epoch, sequence: ++this.sequence, change } }
		this.#history.push(record)
		this.#history = this.#history.slice(-2)
		for (const subscriber of this.#subscribers) {
			if (subscriber.ready) this.#write(subscriber, record)
			else subscriber.buffer.push(record)
		}
	}

	snapshot(): Snapshot<number> {
		return { epoch: this.epoch, sequence: this.sequence, state: this.state }
	}

	disconnect(): void {
		for (const subscriber of this.#subscribers) subscriber.controller.close()
		this.#subscribers.clear()
	}

	restart(): void {
		this.disconnect()
		this.#id = 0
		this.#history = []
		this.epoch = "second"
		this.sequence = 0
		this.state = 0
	}

	fetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const cursor = new Headers(init?.headers).get("last-event-id")
		this.cursors.push(cursor)
		const at = cursor === null ? -1 : this.#history.findIndex((record) => record.id === Number(cursor))
		const replay = at < 0 ? [] : this.#history.slice(at + 1)
		let subscriber: Subscriber
		const body = new ReadableStream<Uint8Array>({
			start: (controller) => {
				subscriber = { controller, ready: false, buffer: [] }
				// Registration precedes the response's first write/flush.
				this.#subscribers.add(subscriber)
				controller.enqueue(this.#encoder.encode(formatNamedFrame({ event: "reset", id: 0, data: "{}" })))
				// A publication during setup must follow captured replay, not disappear.
				this.onReady?.()
				for (const record of [...replay, ...subscriber.buffer]) this.#write(subscriber, record)
				subscriber.buffer = []
				subscriber.ready = true
			},
			cancel: () => { this.#subscribers.delete(subscriber) },
		})
		init?.signal?.addEventListener("abort", () => {
			if (this.#subscribers.delete(subscriber)) {
				subscriber.controller.error(new DOMException("stream aborted", "AbortError"))
			}
		}, { once: true })
		return new Response(body, { headers: { "content-type": "text/event-stream" } })
	}

	#write(subscriber: Subscriber, record: Record): void {
		subscriber.controller.enqueue(this.#encoder.encode(formatNamedFrame({
			event: "change", id: record.id, data: JSON.stringify(record.change),
		})))
	}
}

const cleanups: (() => void)[] = []
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup()
	vi.unstubAllGlobals()
})

function consumer(broker: RecoveryBroker, load: (signal: AbortSignal) => Promise<Snapshot<number>> = async () => broker.snapshot()) {
	vi.stubGlobal("fetch", vi.fn(broker.fetch))
	let value: number | undefined
	const replacements: (number | undefined)[] = []
	const applied: number[] = []
	const errors: unknown[] = []
	const readSnapshot = vi.fn(load)
	const recovery = createSnapshotRecovery("http://recovery.test/events", {
		events: ["change"],
		reconnect: { baseMs: 0, maxMs: 0, attempts: 3 },
		pauseWhenHidden: false,
		readSnapshot,
		decode: (event): Change<number> => JSON.parse(event.data),
		replace: (state) => { value = state; replacements.push(state) },
		apply: (change) => { value = (value ?? 0) + change; applied.push(change) },
		onError: (error) => { errors.push(error) },
	})
	cleanups.push(recovery.close)
	cleanups.push(recovery.stream.attach())
	return { ...recovery, readSnapshot, replacements, applied, errors, get value() { return value } }
}

describe("snapshot recovery against an equivalent Keel broker", () => {
	test("one snapshot per open and reset, including publication during subscription setup", async () => {
		const broker = new RecoveryBroker()
		broker.onReady = () => broker.publish(2)
		const client = consumer(broker)
		await vi.waitFor(() => expect(client.value).toBe(2))
		expect(client.readSnapshot).toHaveBeenCalledTimes(1)
		expect(client.applied).toEqual([]) // The snapshot already includes the setup event.
		expect(client.stream.events.map((event) => event.name)).toEqual(["reset", "change"])
		broker.disconnect()
		await vi.waitFor(() => expect(client.value).toBe(4))
		expect(client.readSnapshot).toHaveBeenCalledTimes(2)
		expect(client.stream.reconnects).toBe(1)
		expect(client.errors).toEqual([])
	})

	test("buffers live changes and applies only sequences newer than the coherent snapshot", async () => {
		const broker = new RecoveryBroker()
		broker.publish(10)
		const pending = Promise.withResolvers<Snapshot<number>>()
		const client = consumer(broker, () => pending.promise)
		await vi.waitFor(() => expect(client.readSnapshot).toHaveBeenCalledTimes(1))
		const snapshot = broker.snapshot()
		broker.publish(3)
		broker.publish(4)
		await vi.waitFor(() => expect(client.stream.lastEventId).toBe(3))
		expect(client.value).toBeUndefined()
		pending.resolve(snapshot)
		await vi.waitFor(() => expect(client.value).toBe(17))
		expect(client.applied).toEqual([3, 4])
		expect(client.readSnapshot).toHaveBeenCalledTimes(1)
	})

	test("a broker restart resets a high transport cursor and accepts new low ids", async () => {
		const broker = new RecoveryBroker()
		const client = consumer(broker)
		await vi.waitFor(() => expect(client.value).toBe(0))
		for (let count = 0; count < 8; count += 1) broker.publish(1)
		await vi.waitFor(() => expect(client.stream.lastEventId).toBe(8))
		broker.restart()
		await vi.waitFor(() => expect(client.readSnapshot).toHaveBeenCalledTimes(2))
		await vi.waitFor(() => expect(client.value).toBe(0))
		expect(broker.cursors).toEqual([null, "8"])
		expect(client.stream.lastEventId).toBe(0)
		broker.publish(5)
		await vi.waitFor(() => expect(client.value).toBe(5))
		expect(client.stream.lastEventId).toBe(1)
		expect(client.errors).toEqual([])
	})

	test("a cursor outside the replay ring recovers omitted changes from the snapshot", async () => {
		const broker = new RecoveryBroker()
		const client = consumer(broker)
		await vi.waitFor(() => expect(client.value).toBe(0))
		broker.publish(1)
		await vi.waitFor(() => expect(client.stream.lastEventId).toBe(1))
		broker.disconnect()
		broker.publish(2)
		broker.publish(3)
		broker.publish(4)
		await vi.waitFor(() => expect(client.value).toBe(10))
		expect(broker.cursors).toEqual([null, "1"])
		expect(client.readSnapshot).toHaveBeenCalledTimes(2)
		broker.publish(5)
		await vi.waitFor(() => expect(client.value).toBe(15))
		expect(client.errors).toEqual([])
	})

	test("late snapshots from superseded connections cannot replace current state", async () => {
		const broker = new RecoveryBroker()
		const first = Promise.withResolvers<Snapshot<number>>()
		let loads = 0
		const signals: AbortSignal[] = []
		const client = consumer(broker, async (signal) => {
			signals.push(signal)
			return ++loads === 1 ? first.promise : broker.snapshot()
		})
		await vi.waitFor(() => expect(client.readSnapshot).toHaveBeenCalledTimes(1))
		broker.publish(2)
		await vi.waitFor(() => expect(client.stream.lastEventId).toBe(1))
		broker.disconnect()
		broker.publish(3)
		await vi.waitFor(() => expect(client.value).toBe(5))
		expect(signals[0]?.aborted).toBe(true)
		first.resolve({ epoch: "first", sequence: 0, state: 1000 })
		await first.promise
		await Promise.resolve()
		expect(client.value).toBe(5)
		expect(client.replacements.filter((value) => value !== undefined)).toEqual([5])
		expect(client.errors).toEqual([])
	})

	test("closing invalidates and aborts a pending snapshot even if the loader ignores abort", async () => {
		const broker = new RecoveryBroker()
		const pending = Promise.withResolvers<Snapshot<number>>()
		let signal: AbortSignal | undefined
		const client = consumer(broker, (received) => { signal = received; return pending.promise })
		await vi.waitFor(() => expect(client.readSnapshot).toHaveBeenCalledTimes(1))
		client.close()
		expect(signal?.aborted).toBe(true)
		pending.resolve({ epoch: "first", sequence: 0, state: 42 })
		await pending.promise
		await Promise.resolve()
		expect(client.value).toBeUndefined()
		expect(client.stream.connection).toBe("closed")
	})

	test("snapshot failure closes recovery instead of publishing a partial model", async () => {
		const broker = new RecoveryBroker()
		const failure = new Error("snapshot unavailable")
		const client = consumer(broker, async () => { throw failure })
		await vi.waitFor(() => expect(client.stream.connection).toBe("closed"))
		expect(client.value).toBeUndefined()
		expect(client.errors).toEqual([failure])
		expect(client.readSnapshot).toHaveBeenCalledTimes(1)
	})

	test("an application sequence gap closes recovery and invalidates the model", async () => {
		const broker = new RecoveryBroker()
		const client = consumer(broker)
		await vi.waitFor(() => expect(client.value).toBe(0))
		broker.sequence = 1 // Simulate a missing application publication.
		broker.publish(3)
		await vi.waitFor(() => expect(client.stream.connection).toBe("closed"))
		expect(client.value).toBeUndefined()
		expect(client.errors).toHaveLength(1)
		expect(client.applied).toEqual([])
		expect(client.readSnapshot).toHaveBeenCalledTimes(1)
	})

	test("buffered changes from an older application epoch do not corrupt the snapshot", async () => {
		const broker = new RecoveryBroker()
		const pending = Promise.withResolvers<Snapshot<number>>()
		const client = consumer(broker, () => pending.promise)
		await vi.waitFor(() => expect(client.readSnapshot).toHaveBeenCalledTimes(1))
		broker.publish(4)
		await vi.waitFor(() => expect(client.stream.lastEventId).toBe(1))
		pending.resolve({ epoch: "second", sequence: 0, state: 10 })
		await vi.waitFor(() => expect(client.value).toBe(10))
		expect(client.applied).toEqual([])
		expect(client.errors).toEqual([])
		expect(client.stream.connection).toBe("live")
	})

	test("an application epoch change on a live connection fails instead of keeping stale state", async () => {
		const broker = new RecoveryBroker()
		const client = consumer(broker)
		await vi.waitFor(() => expect(client.value).toBe(0))
		broker.epoch = "second"
		broker.publish(3)
		await vi.waitFor(() => expect(client.stream.connection).toBe("closed"))
		expect(client.value).toBeUndefined()
		expect(client.errors).toHaveLength(1)
		expect(client.applied).toEqual([])
		expect(client.readSnapshot).toHaveBeenCalledTimes(1)
	})

	test("a stalled snapshot has a bounded event buffer", async () => {
		const broker = new RecoveryBroker()
		const pending = Promise.withResolvers<Snapshot<number>>()
		const client = consumer(broker, () => pending.promise)
		await vi.waitFor(() => expect(client.readSnapshot).toHaveBeenCalledTimes(1))
		for (let count = 0; count < 129; count += 1) broker.publish(1)
		await vi.waitFor(() => expect(client.stream.connection).toBe("closed"))
		expect(client.value).toBeUndefined()
		expect(client.errors).toHaveLength(1)
		expect(client.applied).toEqual([])
		pending.resolve(broker.snapshot())
	})
})
