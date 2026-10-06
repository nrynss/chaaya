/**
 * Money as integer minor units with an opaque denomination label. The label
 * accepts any value, such as a currency code or a credit label. Chaaya
 * validates nothing, computes nothing, and formats nothing. Display belongs
 * to the app.
 */
export interface PriceAmount {
	/** Integer minor units. */
	readonly amount: number
	/** An opaque denomination label. */
	readonly currency: string
}

/** One quoted price. The id travels as the idempotency key of every run attempt. */
export interface PriceQuote {
	/** The quote id. Every run attempt sends it, including retries. */
	readonly id: string
	/** The quoted price. */
	readonly price: PriceAmount
	/** When the quote lapses, in milliseconds since the epoch. Omit for no expiry. */
	readonly expiresAt?: number
}

/**
 * The lifecycle of a priced action. `quoting` covers the first quote and a
 * re-quote. `quoted` holds a live quote. `running` holds one run attempt. A
 * refusal that carries a new quote returns to `quoted` with the new price.
 */
export type PricedPhase = "idle" | "quoting" | "quoted" | "running" | "done" | "failed"

/** What a priced action needs. */
export interface PricedActionOptions<T> {
	/** Ask for a fresh quote. */
	readonly quote: () => Promise<PriceQuote>
	/**
	 * Run once against a quote id. The app sends the id as the idempotency
	 * key on every attempt, including retries, so a repeated request spends
	 * once. Chaaya names no header and no route.
	 */
	readonly run: (quoteId: string) => Promise<T>
	/**
	 * Read a refusal that carries a new quote. Return the quote when the
	 * error is that refusal, else undefined. The adapter owns the codes, so
	 * core names none.
	 */
	readonly parsePriceChange?: (error: unknown) => PriceQuote | undefined
	/** The clock in milliseconds since the epoch. Defaults to Date.now. */
	readonly now?: () => number
}

/**
 * Quotes, confirms, and runs once. While a run is in flight, a second
 * confirm does nothing. An expired quote re-quotes before it runs. A refusal
 * that carries a new quote moves back to quoted with the new price, so the
 * app asks again instead of spending.
 */
export class PricedAction<T = unknown> {
	/** The lifecycle state of the action. */
	phase = $state<PricedPhase>("idle")
	/** The live quote, or null before the first quote and after reset. */
	quote = $state<PriceQuote | null>(null)
	/** The run value, or null before a run succeeds. */
	result = $state<T | null>(null)
	/** The failure behind a failed phase, or null elsewhere. */
	error = $state<unknown>(null)

	#quote: () => Promise<PriceQuote>
	#run: (quoteId: string) => Promise<T>
	#parsePriceChange: ((error: unknown) => PriceQuote | undefined) | undefined
	#now: () => number
	#session = 0

	constructor(options: PricedActionOptions<T>) {
		this.#quote = options.quote
		this.#run = options.run
		this.#parsePriceChange = options.parsePriceChange
		this.#now = options.now ?? Date.now
	}

	/** Whether the live quote has lapsed. A quote without expiry never lapses. */
	get expired(): boolean {
		const current = this.quote
		if (current?.expiresAt === undefined) return false
		return this.#now() >= current.expiresAt
	}

	/** Ask for a fresh quote. A second call while quoting or running does nothing. */
	async requestQuote(): Promise<void> {
		if (this.phase === "quoting" || this.phase === "running") return
		this.#session += 1
		const session = this.#session
		this.phase = "quoting"
		this.error = null
		try {
			const next = await this.#quote()
			if (session !== this.#session) return
			this.quote = next
			this.phase = "quoted"
		} catch (error) {
			if (session !== this.#session) return
			this.error = error
			this.phase = "failed"
		}
	}

	/**
	 * Run once against the live quote. Quotes first when there is none, and
	 * re-quotes when it lapsed. A second confirm while a run is in flight
	 * does nothing. A retry after a failure sends the same quote id again,
	 * so the backend dedupes on it.
	 */
	async confirm(): Promise<T | undefined> {
		if (this.phase === "running" || this.phase === "quoting") return undefined
		if (this.phase === "done") return this.result ?? undefined
		if (this.quote === null || this.expired) {
			await this.requestQuote()
			if (this.phase !== "quoted" || this.quote === null) return undefined
		}
		this.#session += 1
		const session = this.#session
		const id = this.quote.id
		this.phase = "running"
		this.error = null
		try {
			const value = await this.#run(id)
			if (session !== this.#session) return undefined
			this.result = value
			this.phase = "done"
			return value
		} catch (error) {
			if (session !== this.#session) return undefined
			const next = this.#readPriceChange(error)
			if (next !== undefined) {
				this.quote = next
				this.error = null
				this.phase = "quoted"
				return undefined
			}
			this.error = error
			this.phase = "failed"
			return undefined
		}
	}

	/** Forget the quote, the result, and the error, and return to idle. */
	reset(): void {
		this.#session += 1
		this.quote = null
		this.result = null
		this.error = null
		this.phase = "idle"
	}

	#readPriceChange(error: unknown): PriceQuote | undefined {
		if (this.#parsePriceChange === undefined) return undefined
		try {
			return this.#parsePriceChange(error)
		} catch {
			return undefined
		}
	}
}
