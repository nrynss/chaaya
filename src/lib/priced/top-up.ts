/** What `consumeTopUpReturn` needs. */
export interface ConsumeTopUpOptions {
	/**
	 * The query param the checkout return carries the top-up reference in.
	 * The app names it in the return URL it hands the checkout, so Chaaya
	 * names none.
	 */
	readonly param: string
	/** Consume only on this path. Ignore every other path. Omit for any path. */
	readonly path?: string
}

/**
 * Read the top-up reference once from a checkout return URL, then drop that
 * param from the address bar so a reload does not wait again. Answers
 * undefined off the return path, and when the param is missing or empty.
 * Reads the passed URL in a check, or the live location when the caller
 * passes none. Every other param and the hash stay.
 */
export function consumeTopUpReturn(input: string | URL | undefined, options: ConsumeTopUpOptions): string | undefined {
	const scope = globalThis as unknown as { location?: Location; history?: History }
	let current: URL
	if (typeof input === "string") current = new URL(input)
	else if (input instanceof URL) current = new URL(input.toString())
	else if (scope.location?.href) current = new URL(scope.location.href)
	else return undefined
	if (options.path !== undefined && current.pathname !== options.path) return undefined
	const reference = current.searchParams.get(options.param)?.trim()
	if (reference === undefined || reference === "") return undefined
	const clean = new URL(current.toString())
	clean.searchParams.delete(options.param)
	const address = `${clean.pathname}${clean.search}${clean.hash}`
	try {
		scope.history?.replaceState(scope.history.state, "", address)
	} catch {
		// A host without history keeps the param, and the next read repeats.
	}
	return reference
}
