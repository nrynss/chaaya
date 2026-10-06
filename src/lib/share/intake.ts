import { readSharedPayload, type ReadShareOptions } from "./payload.js"
import type { SharedPayload } from "./payload.js"

/** What `consumeShareLaunch` needs. */
export interface ConsumeShareOptions extends ReadShareOptions {
	/** Consume only on this path. Ignore every other path. Omit for any path. */
	readonly path?: string
}

/** The launch params this consumes. Only these leave the address bar. */
const SHARE_PARAMS = ["title", "text", "url"] as const

/**
 * Read the share payload once from the launch URL, then clean the address
 * bar so a reload shares nothing. Answers undefined off the share path, and
 * when the launch carries no share. Reads the passed URL in a check, or the
 * live location when the caller passes none.
 */
export function consumeShareLaunch(input?: string | URL, options: ConsumeShareOptions = {}): SharedPayload | undefined {
	const scope = globalThis as unknown as { location?: Location; history?: History }
	let current: URL
	if (typeof input === "string") current = new URL(input)
	else if (input instanceof URL) current = new URL(input.toString())
	else if (scope.location?.href) current = new URL(scope.location.href)
	else return undefined
	if (options.path !== undefined && current.pathname !== options.path) return undefined
	const payload = readSharedPayload(current, options)
	if (payload === undefined) return undefined
	const clean = new URL(current.toString())
	for (const name of SHARE_PARAMS) clean.searchParams.delete(name)
	const address = `${clean.pathname}${clean.search}${clean.hash}`
	try {
		scope.history?.replaceState(null, "", address)
	} catch {
		// A host without history keeps the params, and the next read repeats.
	}
	return payload
}
