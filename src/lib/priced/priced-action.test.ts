import { expect, test } from "vitest"
import { PricedAction, type PriceQuote } from "./priced-action.svelte.js"

/** A quote priced in whole minor units of any label. */
function quoteWith(id: string, amount: number, currency = "credit.label", expiresAt?: number): PriceQuote {
	return expiresAt === undefined
		? { id, price: { amount, currency } }
		: { id, price: { amount, currency }, expiresAt }
}

/** A deferred promise a check settles by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((done, fail) => {
		resolve = done
		reject = fail
	})
	return { promise, resolve, reject }
}

test("request then confirm moves idle to quoted to done", async () => {
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async (id) => `ran ${id}`
	})
	expect(action.phase).toBe("idle")
	await action.requestQuote()
	expect(action.phase).toBe("quoted")
	expect(action.quote?.price).toEqual({ amount: 40, currency: "credit.label" })
	const value = await action.confirm()
	expect(value).toBe("ran q1")
	expect(action.phase).toBe("done")
	expect(action.result).toBe("ran q1")
})

test("confirm without a quote quotes first", async () => {
	let quotes = 0
	const action = new PricedAction<string>({
		quote: async () => {
			quotes += 1
			return quoteWith("q1", 40)
		},
		run: async (id) => `ran ${id}`
	})
	await action.confirm()
	expect(quotes).toBe(1)
	expect(action.phase).toBe("done")
})

test("a second confirm while running does nothing", async () => {
	const gate = deferred<string>()
	let runs = 0
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async (id) => {
			runs += 1
			return gate.promise.then(() => `ran ${id}`)
		}
	})
	await action.requestQuote()
	const first = action.confirm()
	const second = action.confirm()
	gate.resolve("late")
	expect(await first).toBe("ran q1")
	expect(await second).toBeUndefined()
	expect(runs).toBe(1)
	expect(action.phase).toBe("done")
})

test("a failed quote ends in failed with the error", async () => {
	const failure = new Error("No quote today.")
	const action = new PricedAction<string>({
		quote: async () => {
			throw failure
		},
		run: async () => "never"
	})
	await action.requestQuote()
	expect(action.phase).toBe("failed")
	expect(action.error).toBe(failure)
})

test("an expired quote re-quotes before it runs", async () => {
	let now = 1000
	let quotes = 0
	const ids: string[] = []
	const action = new PricedAction<string>({
		quote: async () => {
			quotes += 1
			return quoteWith(`q${quotes}`, 40, "credit.label", now + 500)
		},
		run: async (id) => {
			ids.push(id)
			return `ran ${id}`
		},
		now: () => now
	})
	await action.requestQuote()
	expect(action.quote?.id).toBe("q1")
	now = 2000
	await action.confirm()
	expect(action.quote?.id).toBe("q2")
	expect(ids).toEqual(["q2"])
	expect(action.phase).toBe("done")
})

test("a refusal with a new quote returns to quoted at the new price", async () => {
	const fresh = quoteWith("q2", 60)
	const refusal = new Error("The price moved.")
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async () => {
			throw refusal
		},
		parsePriceChange: (error) => (error === refusal ? fresh : undefined)
	})
	await action.requestQuote()
	await action.confirm()
	expect(action.phase).toBe("quoted")
	expect(action.quote?.id).toBe("q2")
	expect(action.quote?.price.amount).toBe(60)
	expect(action.error).toBeNull()
})

test("an unknown run failure ends in failed and retries with the same id", async () => {
	const ids: string[] = []
	let attempts = 0
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async (id) => {
			ids.push(id)
			attempts += 1
			if (attempts === 1) throw new Error("The request timed out.")
			return `ran ${id}`
		}
	})
	await action.requestQuote()
	await action.confirm()
	expect(action.phase).toBe("failed")
	await action.confirm()
	expect(action.phase).toBe("done")
	expect(ids).toEqual(["q1", "q1"])
})

test("reset forgets everything and a late run stays lost", async () => {
	const gate = deferred<string>()
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: () => gate.promise
	})
	await action.requestQuote()
	const pending = action.confirm()
	action.reset()
	expect(action.phase).toBe("idle")
	expect(action.quote).toBeNull()
	gate.resolve("late")
	expect(await pending).toBeUndefined()
	expect(action.phase).toBe("idle")
	expect(action.result).toBeNull()
})

test("a throwing parser reads as no price change", async () => {
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async () => {
			throw new Error("Spent.")
		},
		parsePriceChange: () => {
			throw new Error("Bad parser.")
		}
	})
	await action.requestQuote()
	await action.confirm()
	expect(action.phase).toBe("failed")
})

test("a refusal for lack of balance is insufficient and keeps the quote", async () => {
	const refusal = new Error("Not enough balance.")
	const ids: string[] = []
	let funded = false
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async (id) => {
			ids.push(id)
			if (!funded) throw refusal
			return `ran ${id}`
		},
		parseInsufficientFunds: (error) =>
			error === refusal ? { balance: { amount: 10, currency: "credit.label" }, required: { amount: 40, currency: "credit.label" } } : undefined
	})
	await action.requestQuote()
	await action.confirm()
	expect(action.phase).toBe("insufficient")
	expect(action.error).toBeNull()
	expect(action.insufficient).toEqual({
		balance: { amount: 10, currency: "credit.label" },
		required: { amount: 40, currency: "credit.label" }
	})
	expect(action.quote?.id).toBe("q1")
	funded = true
	expect(await action.confirm()).toBe("ran q1")
	expect(action.phase).toBe("done")
	expect(action.insufficient).toBeNull()
	expect(ids).toEqual(["q1", "q1"])
})

test("an insufficient refusal with a lapsed quote re-quotes on the next confirm", async () => {
	let now = 1000
	let quotes = 0
	const ids: string[] = []
	const refusal = new Error("Not enough balance.")
	const action = new PricedAction<string>({
		quote: async () => {
			quotes += 1
			return quoteWith(`q${quotes}`, 40, "credit.label", now + 500)
		},
		run: async (id) => {
			ids.push(id)
			if (ids.length === 1) throw refusal
			return `ran ${id}`
		},
		parseInsufficientFunds: (error) => (error === refusal ? {} : undefined),
		now: () => now
	})
	await action.confirm()
	expect(action.phase).toBe("insufficient")
	now = 2000
	await action.confirm()
	expect(ids).toEqual(["q1", "q2"])
	expect(action.phase).toBe("done")
})

test("a price change wins over an insufficient refusal", async () => {
	const refusal = new Error("Moved and short.")
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async () => {
			throw refusal
		},
		parsePriceChange: (error) => (error === refusal ? quoteWith("q2", 60) : undefined),
		parseInsufficientFunds: (error) => (error === refusal ? {} : undefined)
	})
	await action.confirm()
	expect(action.phase).toBe("quoted")
	expect(action.quote?.id).toBe("q2")
	expect(action.insufficient).toBeNull()
})

test("a throwing insufficient parser reads as a generic failure", async () => {
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async () => {
			throw new Error("Spent.")
		},
		parseInsufficientFunds: () => {
			throw new Error("Bad parser.")
		}
	})
	await action.confirm()
	expect(action.phase).toBe("failed")
	expect(action.insufficient).toBeNull()
})

test("requestQuote and reset clear an insufficient refusal", async () => {
	const refusal = new Error("Not enough balance.")
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async () => {
			throw refusal
		},
		parseInsufficientFunds: (error) => (error === refusal ? {} : undefined)
	})
	await action.confirm()
	expect(action.phase).toBe("insufficient")
	await action.requestQuote()
	expect(action.phase).toBe("quoted")
	expect(action.insufficient).toBeNull()
	await action.confirm()
	expect(action.phase).toBe("insufficient")
	action.reset()
	expect(action.phase).toBe("idle")
	expect(action.insufficient).toBeNull()
})

test("the settle hook runs once per run attempt, never for a quote, and survives a throw", async () => {
	let settles = 0
	let attempts = 0
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: async (id) => {
			attempts += 1
			if (attempts === 1) throw new Error("The request timed out.")
			return `ran ${id}`
		},
		onRunSettled: () => {
			settles += 1
			throw new Error("Bad hook.")
		}
	})
	await action.requestQuote()
	expect(settles).toBe(0)
	await action.confirm()
	expect(action.phase).toBe("failed")
	expect(settles).toBe(1)
	expect(await action.confirm()).toBe("ran q1")
	expect(action.phase).toBe("done")
	expect(settles).toBe(2)
})

test("the settle hook still runs for a run a reset discarded", async () => {
	const gate = deferred<string>()
	let settles = 0
	const action = new PricedAction<string>({
		quote: async () => quoteWith("q1", 40),
		run: () => gate.promise,
		onRunSettled: () => {
			settles += 1
		}
	})
	await action.requestQuote()
	const pending = action.confirm()
	action.reset()
	gate.resolve("late")
	await pending
	expect(action.phase).toBe("idle")
	expect(settles).toBe(1)
})

test("an initial quote starts quoted and confirms without re-quoting", async () => {
	let quotes = 0
	const ids: string[] = []
	const action = new PricedAction<string>({
		quote: async () => {
			quotes += 1
			return quoteWith(`fresh${quotes}`, 40)
		},
		run: async (id) => {
			ids.push(id)
			return `ran ${id}`
		},
		initialQuote: quoteWith("kept", 40)
	})
	expect(action.phase).toBe("quoted")
	expect(action.quote?.id).toBe("kept")
	await action.confirm()
	expect(quotes).toBe(0)
	expect(ids).toEqual(["kept"])
})

test("a lapsed initial quote re-quotes on confirm", async () => {
	const ids: string[] = []
	const action = new PricedAction<string>({
		quote: async () => quoteWith("fresh", 40),
		run: async (id) => {
			ids.push(id)
			return `ran ${id}`
		},
		initialQuote: quoteWith("kept", 40, "credit.label", 500),
		now: () => 1000
	})
	expect(action.expired).toBe(true)
	await action.confirm()
	expect(ids).toEqual(["fresh"])
})
