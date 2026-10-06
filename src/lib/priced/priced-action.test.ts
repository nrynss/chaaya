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
