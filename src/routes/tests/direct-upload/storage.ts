/** One test's bytes, so parallel projects never share a part. */
interface ScopeStore {
	parts: Map<number, Buffer>
	writes: Record<string, number>
	attempts: Record<string, number>
	failures: Map<number, number>
}

/** Every live scope, keyed by the run token a spec passes in. */
const scopes = new Map<string, ScopeStore>()

/** The store for one run token. A fresh token starts empty. */
function scopeStore(scope: string): ScopeStore {
	let store = scopes.get(scope)
	if (store === undefined) {
		store = { parts: new Map(), writes: {}, attempts: {}, failures: new Map() }
		scopes.set(scope, store)
	}
	return store
}

/** A usable scope name. Blanks fall back to the shared default. */
export function cleanScope(scope: string | null): string {
	if (scope === null || scope === "") return "default"
	return scope
}

export function storePart(scope: string, index: number, bytes: Buffer): void {
	const store = scopeStore(scope)
	store.parts.set(index, Buffer.from(bytes))
	store.writes[String(index)] = (store.writes[String(index)] ?? 0) + 1
}

export function readPart(scope: string, index: number): Buffer | undefined {
	return scopeStore(scope).parts.get(index)
}

export function partIndices(scope: string): number[] {
	return [...scopeStore(scope).parts.keys()].sort((left, right) => left - right)
}

export function writeCounts(scope: string): Record<string, number> {
	return { ...scopeStore(scope).writes }
}

/** Every PUT attempt per part number, refused ones included. */
export function attemptCounts(scope: string): Record<string, number> {
	return { ...scopeStore(scope).attempts }
}

/** Record one PUT attempt before it succeeds or fails. */
export function noteAttempt(scope: string, index: number): void {
	const store = scopeStore(scope)
	store.attempts[String(index)] = (store.attempts[String(index)] ?? 0) + 1
}

export function consumeFailure(scope: string, index: number): boolean {
	const store = scopeStore(scope)
	const left = store.failures.get(index) ?? 0
	if (left <= 0) return false
	store.failures.set(index, left - 1)
	return true
}

export function setFailures(scope: string, index: number, times: number): void {
	const store = scopeStore(scope)
	if (times <= 0) store.failures.delete(index)
	else store.failures.set(index, times)
}

export function clearScope(scope: string): void {
	scopes.delete(scope)
}
