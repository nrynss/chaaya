import { Notifier } from "../core/observable.js"
import type { ChaayaError } from "../core/error.js"
import { JobPoller } from "../core/job/poll.js"
import {
	PricedAction,
	type InsufficientFunds,
	type PriceAmount,
	type PricedActionOptions
} from "./priced-action.js"

/**
 * Where the balance read stands. `idle` has never read. `reading` has a
 * refresh in flight. `ready` means the last read landed, a refresh or a
 * top-up follow answer. `failed` means the last refresh did not, and the
 * last balance that landed stays published.
 */
export type WalletPhase = "idle" | "reading" | "ready" | "failed"

/**
 * Where a top-up follow stands. `idle` has none. `following` polls the
 * balance, including while paused on a hidden page. `landed` saw the top-up
 * credited. `timed_out` ran past its timeout first. `failed` spent its error
 * budget. `closed` was stopped by close or by its signal. A newer follow
 * replaces the older one, so this reads the newer follow's state.
 */
export type TopUpPhase = "idle" | "following" | "landed" | "timed_out" | "failed" | "closed"

/** What a wallet needs. The adapter supplies the backend calls. */
export interface CreditWalletOptions<R> {
	/**
	 * Read the balance once. It receives an abort signal and resolves the raw
	 * answer. Chaaya names no header and no route.
	 */
	readonly readBalance: (signal: AbortSignal) => Promise<R>
	/** Map the raw answer onto the balance. A throw counts as a failed read. */
	readonly toBalance: (reading: R) => PriceAmount
	/**
	 * Read a run refusal for lack of balance. Actions made through `action`
	 * use it unless their own options pass one. The adapter owns the codes.
	 */
	readonly parseInsufficientFunds?: (error: unknown) => InsufficientFunds | undefined
	/**
	 * Runs when a read publishes a balance that differs from the last one in
	 * amount or label, including the first read, where `previous` is null. A
	 * refund the backend made after the fact arrives here. The app decides
	 * what to say about it. A throw is ignored.
	 */
	readonly onChange?: (next: PriceAmount, previous: PriceAmount | null) => void
}

/** What one top-up follow needs, past the wallet's own read. */
export interface TopUpFollowOptions<R> {
	/**
	 * Whether a raw balance answer shows this top-up credited. The backend
	 * credits when the payment provider confirms, so the first answers after
	 * the return may not show it yet. A throw counts as a failed read.
	 */
	readonly isCredited: (reading: R, reference: string) => boolean
	/** The whole follow ends as `timed_out` after this many milliseconds.
	 * Default 60000. Time spent paused does not count. */
	readonly timeoutMs?: number
	/** The first interval between reads, in milliseconds. Default 1000. */
	readonly intervalMs?: number
	/** The ceiling the interval backs off to, in milliseconds. Default 8000. */
	readonly maxIntervalMs?: number
	/** Consecutive failed reads the follow survives. Default 3. */
	readonly errorBudget?: number
	/** Stop the follow when this aborts. */
	readonly signal?: AbortSignal
	/** Pause while the page is hidden or offline. Defaults to true. */
	readonly pauseWhenHidden?: boolean
}

/** The state a wallet publishes. One write may set several fields, and a
 * view hears it once. */
interface WalletFields {
	balance: PriceAmount | null
	phase: WalletPhase
	error: unknown
}

/** The default top-up follow timeout, in milliseconds. */
const TOP_UP_TIMEOUT_MS = 60_000

/** One balance answer from the follow, tagged with the order its read began. */
interface TaggedReading<R> {
	readonly ticket: number
	readonly reading: R
}

function sameBalance(a: PriceAmount | null, b: PriceAmount): boolean {
	return a !== null && a.amount === b.amount && a.currency === b.currency
}

/**
 * A prepaid balance an app reads anywhere a price shows. It holds integer
 * minor units and an opaque denomination label, the shape of `PriceAmount`,
 * and formats nothing.
 *
 * The balance refreshes after every run attempt of an action made through
 * `action`, and after `refresh` or a top-up follow reads it. Reads land in
 * the order they began, so a slow read never overwrites a newer balance.
 *
 * A hosted checkout leaves the page and comes back before the backend has
 * credited the payment. `followTopUp` polls the balance through `JobPoller`
 * until the adapter sees the top-up credited or a timeout passes. Read the
 * return with `consumeTopUpReturn`, which cleans the address bar so a reload
 * does not wait again.
 *
 * Construction touches nothing, so importing this module on a server is safe.
 */
export class CreditWallet<R = unknown> extends Notifier {
	#fields: WalletFields = {
		balance: null,
		phase: "idle",
		error: null
	}

	/** The last balance that landed, or null before the first. */
	get balance(): PriceAmount | null {
		return this.#fields.balance
	}

	/** Where the balance read stands. */
	get phase(): WalletPhase {
		return this.#fields.phase
	}

	/** The failure behind a failed phase, or null elsewhere. */
	get error(): unknown {
		return this.#fields.error
	}

	/** Apply one change to the published state and notify once when a value
	 * moved. Equal values notify nothing, the way a rune skipped them. */
	#write(patch: Partial<WalletFields>): void {
		let changed = false
		const next = { ...this.#fields }
		for (const key of Object.keys(patch) as (keyof WalletFields)[]) {
			if (Object.is(next[key], patch[key])) continue
			;(next as Record<keyof WalletFields, unknown>)[key] = patch[key]
			changed = true
		}
		if (!changed) return
		this.#fields = next
		if (this.#depth > 0) this.#dirty = true
		else this.notify()
	}


	#readBalance: (signal: AbortSignal) => Promise<R>
	#toBalance: (reading: R) => PriceAmount
	#parseInsufficientFunds: ((error: unknown) => InsufficientFunds | undefined) | undefined
	#onChange: ((next: PriceAmount, previous: PriceAmount | null) => void) | undefined
	#issued = 0
	#landed = 0
	#refresh: AbortController | undefined = undefined
	#settledPhase: WalletPhase = "idle"
	#follower: JobPoller<TaggedReading<R>> | undefined = undefined
	#unfollow: (() => void) | undefined = undefined
	#reference: string | null = null
	/** Above zero while one logical change runs. Writes then only mark the
	 * wallet dirty, and the change notifies once when it ends. */
	#depth = 0
	#dirty = false

	constructor(options: CreditWalletOptions<R>) {
		super()
		this.#readBalance = options.readBalance
		this.#toBalance = options.toBalance
		this.#parseInsufficientFunds = options.parseInsufficientFunds
		this.#onChange = options.onChange
	}

	/** Where the current top-up follow stands. */
	get topUp(): TopUpPhase {
		const follower = this.#follower
		if (follower === undefined) return "idle"
		if (follower.progress.status === "done") return "landed"
		if (follower.connection === "failed") return follower.error?.code === "poll_timeout" ? "timed_out" : "failed"
		if (follower.connection === "closed") return "closed"
		return "following"
	}

	/** The reference the current or last top-up follow waits on, or null. */
	get topUpReference(): string | null {
		return this.#reference
	}

	/** The failure that ended the last top-up follow, when it timed out or failed. */
	get topUpError(): ChaayaError | undefined {
		return this.#follower?.error
	}

	/**
	 * Read the balance now. A newer refresh aborts an older one still in
	 * flight. Resolves the balance published once the read settles, which is
	 * the last one that landed when this read failed.
	 */
	async refresh(): Promise<PriceAmount | null> {
		this.#refresh?.abort()
		const controller = new AbortController()
		this.#refresh = controller
		const ticket = this.#ticket()
		this.#write({ phase: "reading" })
		try {
			const reading = await this.#readBalance(controller.signal)
			if (this.#refresh !== controller) return this.balance
			const balance = this.#toBalance(reading)
			// The balance and the phase land as one change.
			this.#depth += 1
			try {
				this.#land(ticket, balance)
				this.#refresh = undefined
				this.#write({ error: null, phase: "ready" })
				this.#settledPhase = "ready"
			} finally {
				this.#depth -= 1
				if (this.#depth === 0 && this.#dirty) {
					this.#dirty = false
					this.notify()
				}
			}
		} catch (error) {
			if (this.#refresh !== controller) return this.balance
			this.#refresh = undefined
			this.#write({ error, phase: "failed" })
			this.#settledPhase = "failed"
		}
		return this.balance
	}

	/**
	 * Make a priced action whose every run attempt refreshes this wallet.
	 * It reads insufficient funds through the wallet's parser unless the
	 * options pass their own. An `onRunSettled` in the options runs first.
	 */
	action<T>(options: PricedActionOptions<T>): PricedAction<T> {
		const settled = options.onRunSettled
		return new PricedAction<T>({
			...options,
			parseInsufficientFunds: options.parseInsufficientFunds ?? this.#parseInsufficientFunds,
			onRunSettled: () => {
				try {
					settled?.()
				} finally {
					void this.refresh()
				}
			}
		})
	}

	/**
	 * Follow the balance after a top-up return until the adapter sees the
	 * reference credited or the timeout passes. A newer follow closes the
	 * older one. Each answer publishes the balance as a refresh would, and
	 * notifies once. Returns the teardown, which stops this follow; a
	 * teardown of a follow a newer one replaced does nothing. A Svelte
	 * component returns it from `onMount` or from an effect.
	 */
	followTopUp(reference: string, options: TopUpFollowOptions<R>): () => void {
		this.#follower?.close()
		this.#unfollow?.()
		const isCredited = options.isCredited
		const follower = new JobPoller<TaggedReading<R>>({
			fetchState: async (signal) => {
				const ticket = this.#ticket()
				return { ticket, reading: await this.#readBalance(signal) }
			},
			toProgress: ({ ticket, reading }) => {
				const balance = this.#toBalance(reading)
				const credited = isCredited(reading, reference)
				// Quiet: the follower notifies once this answer lands, and the
				// wallet re-notifies then, so one answer notifies once.
				this.#depth += 1
				try {
					this.#land(ticket, balance)
					this.#followed()
				} finally {
					this.#depth -= 1
				}
				return {
					status: credited ? "done" : "running",
					detail: { amount: balance.amount, currency: balance.currency }
				}
			},
			isTerminal: (progress) => progress.status === "done",
			timeoutMs: options.timeoutMs ?? TOP_UP_TIMEOUT_MS,
			intervalMs: options.intervalMs,
			maxIntervalMs: options.maxIntervalMs,
			errorBudget: options.errorBudget,
			signal: options.signal,
			pauseWhenHidden: options.pauseWhenHidden
		})
		this.#reference = reference
		this.#follower = follower
		const unsubscribe = follower.subscribe(() => {
			this.#dirty = false
			this.notify()
		})
		this.#unfollow = unsubscribe
		this.notify()
		const teardown = follower.attach()
		return () => {
			teardown()
			unsubscribe()
			if (this.#unfollow === unsubscribe) this.#unfollow = undefined
		}
	}

	/** Stop the top-up follow and abort a refresh in flight. The wallet keeps
	 * its balance and may refresh again. */
	close(): void {
		this.#follower?.close()
		if (this.#refresh !== undefined) {
			this.#refresh.abort()
			this.#refresh = undefined
			this.#write({ phase: this.#settledPhase })
		}
	}

	/** A follow answer is a read that landed. Unless a refresh is still in
	 * flight, the phase says so, and an earlier refresh failure clears. */
	#followed(): void {
		if (this.#refresh !== undefined) return
		this.#write({ error: null, phase: "ready" })
		this.#settledPhase = "ready"
	}

	#ticket(): number {
		this.#issued += 1
		return this.#issued
	}

	/** Publish a balance unless a read that began later already landed. */
	#land(ticket: number, next: PriceAmount): void {
		if (ticket < this.#landed) return
		this.#landed = ticket
		const previous = this.balance
		if (sameBalance(previous, next)) return
		const balance = { amount: next.amount, currency: next.currency }
		this.#write({ balance })
		if (this.#onChange === undefined) return
		try {
			this.#onChange(balance, previous)
		} catch {
			// The change hook is the app's. Its failure never changes the balance.
		}
	}
}
