/** Tokens by test run. The entry route mints at the run's token, and the
 * rotate route moves it, which expires every URL the entry minted before
 * for that run alone. Runs never share a token, so parallel checks stay
 * independent. */
const tokens = new Map<string, number>()

export function currentToken(run: string): number {
	return tokens.get(run) ?? 0
}

export function rotateToken(run: string): number {
	const next = currentToken(run) + 1
	tokens.set(run, next)
	return next
}
