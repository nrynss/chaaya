/** In memory bytes for the direct upload harness. One server process holds one map. */
const parts = new Map<number, Buffer>()

/** PUT attempts per part number, keyed by the number as a string. */
const writes: Record<string, number> = {}

/** Every PUT attempt per part number, including refused ones. */
const attempts: Record<string, number> = {}

/** Remaining forced failures per part number. */
const failures = new Map<number, number>()

export function storePart(index: number, bytes: Buffer): void {
	parts.set(index, Buffer.from(bytes))
	writes[String(index)] = (writes[String(index)] ?? 0) + 1
}

export function readPart(index: number): Buffer | undefined {
	return parts.get(index)
}

export function partIndices(): number[] {
	return [...parts.keys()].sort((left, right) => left - right)
}

export function writeCounts(): Record<string, number> {
	return { ...writes }
}

/** Every PUT attempt per part number, refused ones included. */
export function attemptCounts(): Record<string, number> {
	return { ...attempts }
}

/** Record one PUT attempt before it succeeds or fails. */
export function noteAttempt(index: number): void {
	attempts[String(index)] = (attempts[String(index)] ?? 0) + 1
}

export function consumeFailure(index: number): boolean {
	const left = failures.get(index) ?? 0
	if (left <= 0) return false
	failures.set(index, left - 1)
	return true
}

export function setFailures(index: number, times: number): void {
	if (times <= 0) failures.delete(index)
	else failures.set(index, times)
}

export function clearAll(): void {
	parts.clear()
	failures.clear()
	for (const key of Object.keys(writes)) delete writes[key]
	for (const key of Object.keys(attempts)) delete attempts[key]
}
