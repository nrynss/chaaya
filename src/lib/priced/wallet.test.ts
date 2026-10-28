// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import type { PriceAmount } from "./priced-action.svelte.js"
import { CreditWallet } from "./wallet.svelte.js"

interface Answer {
	readonly amount: number
	readonly credited?: readonly string[]
}

const label = "credit.label"
const noCleanup = (): void => {}
const register = (): ((task: () => () => void) => void) => () => noCleanup()

function toBalance(answer: Answer): PriceAmount {
	return { amount: answer.amount, currency: label }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((done, fail) => {
		resolve = done
		reject = fail
	})
	return { promise, resolve, reject }
}

afterEach(() => {
	vi.useRealTimers()
})

test("refresh publishes the balance and reports the first change against null", async () => {
	const changes: Array<[PriceAmount, PriceAmount | null]> = []
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => ({ amount: 120 }),
		toBalance,
		onChange: (next, previous) => changes.push([{ ...next }, previous && { ...previous }])
	})
	expect(wallet.phase).toBe("idle")
	expect(wallet.balance).toBeNull()
	const pending = wallet.refresh()
	expect(wallet.phase).toBe("reading")
	expect(await pending).toEqual({ amount: 120, currency: label })
	expect(wallet.phase).toBe("ready")
	await wallet.refresh()
	expect(changes).toEqual([[{ amount: 120, currency: label }, null]])
})

test("a failed refresh keeps the last balance and publishes the error", async () => {
	const failure = new Error("No balance today.")
	let fail = false
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => {
			if (fail) throw failure
			return { amount: 120 }
		},
		toBalance
	})
	await wallet.refresh()
	fail = true
	expect(await wallet.refresh()).toEqual({ amount: 120, currency: label })
	expect(wallet.phase).toBe("failed")
	expect(wallet.error).toBe(failure)
	fail = false
	await wallet.refresh()
	expect(wallet.phase).toBe("ready")
	expect(wallet.error).toBeNull()
})

test("a throwing map is a failed read", async () => {
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => ({ amount: 1 }),
		toBalance: () => {
			throw new Error("Unreadable.")
		}
	})
	await wallet.refresh()
	expect(wallet.phase).toBe("failed")
	expect(wallet.balance).toBeNull()
})

test("a newer refresh aborts the older one and the older answer never lands", async () => {
	const slow = deferred<Answer>()
	const signals: AbortSignal[] = []
	let calls = 0
	const wallet = new CreditWallet<Answer>({
		readBalance: (signal) => {
			signals.push(signal)
			calls += 1
			return calls === 1 ? slow.promise : Promise.resolve({ amount: 80 })
		},
		toBalance
	})
	const first = wallet.refresh()
	await wallet.refresh()
	expect(signals[0]?.aborted).toBe(true)
	slow.resolve({ amount: 200 })
	expect(await first).toEqual({ amount: 80, currency: label })
	expect(wallet.balance).toEqual({ amount: 80, currency: label })
	expect(wallet.phase).toBe("ready")
})

test("close aborts a refresh in flight and restores the settled phase", async () => {
	const slow = deferred<Answer>()
	let signal: AbortSignal | undefined
	const wallet = new CreditWallet<Answer>({
		readBalance: (next) => {
			signal = next
			return slow.promise
		},
		toBalance
	})
	const pending = wallet.refresh()
	wallet.close()
	expect(signal?.aborted).toBe(true)
	expect(wallet.phase).toBe("idle")
	slow.resolve({ amount: 5 })
	expect(await pending).toBeNull()
	expect(wallet.balance).toBeNull()
})

test("a throwing change hook never changes the balance", async () => {
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => ({ amount: 7 }),
		toBalance,
		onChange: () => {
			throw new Error("Bad hook.")
		}
	})
	await wallet.refresh()
	expect(wallet.balance).toEqual({ amount: 7, currency: label })
	expect(wallet.phase).toBe("ready")
})

test("an action made by the wallet refreshes after every run attempt", async () => {
	let amount = 100
	let reads = 0
	let settles = 0
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => {
			reads += 1
			return { amount }
		},
		toBalance
	})
	const action = wallet.action<string>({
		quote: async () => ({ id: "q1", price: { amount: 40, currency: label } }),
		run: async (id) => {
			amount -= 40
			return `ran ${id}`
		},
		onRunSettled: () => {
			settles += 1
		}
	})
	await action.requestQuote()
	expect(reads).toBe(0)
	await action.confirm()
	await vi.waitFor(() => expect(wallet.balance).toEqual({ amount: 60, currency: label }))
	expect(settles).toBe(1)
	expect(reads).toBe(1)
})

test("an action reads insufficient funds through the wallet parser unless it passes its own", async () => {
	const refusal = new Error("Not enough balance.")
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => ({ amount: 10 }),
		toBalance,
		parseInsufficientFunds: (error) => (error === refusal ? { balance: { amount: 10, currency: label } } : undefined)
	})
	const run = async (): Promise<string> => {
		throw refusal
	}
	const quote = async () => ({ id: "q1", price: { amount: 40, currency: label } })
	const plain = wallet.action<string>({ quote, run })
	await plain.confirm()
	expect(plain.phase).toBe("insufficient")
	expect(plain.insufficient).toEqual({ balance: { amount: 10, currency: label } })
	const own = wallet.action<string>({ quote, run, parseInsufficientFunds: () => undefined })
	await own.confirm()
	expect(own.phase).toBe("failed")
	await vi.waitFor(() => expect(wallet.phase).toBe("ready"))
})

test("a top-up follow polls until the reference is credited", async () => {
	vi.useFakeTimers()
	const answers: Answer[] = [{ amount: 10 }, { amount: 10 }, { amount: 510, credited: ["ref-1"] }]
	const changes: number[] = []
	const readBalance = vi.fn(async () => answers.shift() ?? { amount: 510, credited: ["ref-1"] })
	const wallet = new CreditWallet<Answer>({
		readBalance,
		toBalance,
		onChange: (next) => changes.push(next.amount)
	})
	expect(wallet.topUp).toBe("idle")
	wallet.followTopUp("ref-1", { isCredited: (answer, reference) => answer.credited?.includes(reference) ?? false, intervalMs: 1000 }, register())
	expect(wallet.topUp).toBe("following")
	expect(wallet.topUpReference).toBe("ref-1")
	await vi.advanceTimersByTimeAsync(0)
	expect(wallet.balance).toEqual({ amount: 10, currency: label })
	expect(wallet.topUp).toBe("following")
	await vi.advanceTimersByTimeAsync(1000)
	expect(wallet.topUp).toBe("following")
	// The second answer matched the first, so the interval doubled.
	await vi.advanceTimersByTimeAsync(2000)
	expect(wallet.topUp).toBe("landed")
	expect(wallet.balance).toEqual({ amount: 510, currency: label })
	expect(changes).toEqual([10, 510])
	await vi.advanceTimersByTimeAsync(10_000)
	expect(readBalance).toHaveBeenCalledTimes(3)
})

test("a top-up follow that never sees the credit times out", async () => {
	vi.useFakeTimers()
	const wallet = new CreditWallet<Answer>({ readBalance: async () => ({ amount: 10 }), toBalance })
	wallet.followTopUp("ref-1", { isCredited: () => false, intervalMs: 1000, maxIntervalMs: 1000, timeoutMs: 3500 }, register())
	await vi.advanceTimersByTimeAsync(3000)
	expect(wallet.topUp).toBe("following")
	await vi.advanceTimersByTimeAsync(1000)
	expect(wallet.topUp).toBe("timed_out")
	expect(wallet.topUpError?.code).toBe("poll_timeout")
	expect(wallet.balance).toEqual({ amount: 10, currency: label })
})

test("a top-up follow fails past its error budget", async () => {
	vi.useFakeTimers()
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => {
			throw new Error("Down.")
		},
		toBalance
	})
	wallet.followTopUp("ref-1", { isCredited: () => true, intervalMs: 1000, errorBudget: 1 }, register())
	await vi.advanceTimersByTimeAsync(0)
	expect(wallet.topUp).toBe("following")
	await vi.advanceTimersByTimeAsync(1000)
	expect(wallet.topUp).toBe("failed")
	expect(wallet.topUpError?.code).toBe("poll_failed")
})

test("a newer follow closes the older one, and close stops it", async () => {
	vi.useFakeTimers()
	const signals: AbortSignal[] = []
	const wallet = new CreditWallet<Answer>({
		readBalance: (signal) => {
			signals.push(signal)
			return new Promise<Answer>(() => {})
		},
		toBalance
	})
	wallet.followTopUp("ref-1", { isCredited: () => false }, register())
	wallet.followTopUp("ref-2", { isCredited: () => false }, register())
	expect(signals[0]?.aborted).toBe(true)
	expect(wallet.topUpReference).toBe("ref-2")
	expect(wallet.topUp).toBe("following")
	wallet.close()
	expect(signals[1]?.aborted).toBe(true)
	expect(wallet.topUp).toBe("closed")
})

test("a follow answer that began later beats a slow refresh", async () => {
	const slow = deferred<Answer>()
	let calls = 0
	const wallet = new CreditWallet<Answer>({
		readBalance: () => {
			calls += 1
			return calls === 1 ? slow.promise : Promise.resolve({ amount: 510, credited: ["ref-1"] })
		},
		toBalance
	})
	const pending = wallet.refresh()
	wallet.followTopUp("ref-1", { isCredited: (answer, reference) => answer.credited?.includes(reference) ?? false }, register())
	await vi.waitFor(() => expect(wallet.topUp).toBe("landed"))
	slow.resolve({ amount: 10 })
	await pending
	expect(wallet.balance).toEqual({ amount: 510, currency: label })
	expect(wallet.phase).toBe("ready")
})

test("a throwing credit check counts as a failed read and publishes nothing", async () => {
	vi.useFakeTimers()
	const wallet = new CreditWallet<Answer>({ readBalance: async () => ({ amount: 10 }), toBalance })
	wallet.followTopUp(
		"ref-1",
		{
			isCredited: () => {
				throw new Error("Unreadable.")
			},
			intervalMs: 1000,
			errorBudget: 0
		},
		register()
	)
	await vi.advanceTimersByTimeAsync(0)
	expect(wallet.topUp).toBe("failed")
	expect(wallet.balance).toBeNull()
})

test("a follow answer marks the wallet ready and clears an earlier refresh failure", async () => {
	vi.useFakeTimers()
	let fail = true
	const wallet = new CreditWallet<Answer>({
		readBalance: async () => {
			if (fail) throw new Error("Down.")
			return { amount: 510, credited: ["ref-1"] }
		},
		toBalance
	})
	await wallet.refresh()
	expect(wallet.phase).toBe("failed")
	fail = false
	wallet.followTopUp("ref-1", { isCredited: (answer, reference) => answer.credited?.includes(reference) ?? false }, register())
	await vi.advanceTimersByTimeAsync(0)
	expect(wallet.topUp).toBe("landed")
	expect(wallet.phase).toBe("ready")
	expect(wallet.error).toBeNull()
})
