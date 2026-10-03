/** How a dropped stream waits before it tries again. */
export interface ReconnectOptions {
	/** The delay before the first reconnect, in milliseconds. Default 500. */
	baseMs?: number
	/** The ceiling the delay doubles up to, in milliseconds. Default 8000. */
	maxMs?: number
	/** The attempts one stream gets before it gives up. Default 6. */
	attempts?: number
}

/** The schedule a stream uses when the caller passes none. */
export const defaultReconnect = { baseMs: 500, maxMs: 8000, attempts: 6 } as const

/** Fill the omitted fields of a reconnect schedule. */
export function reconnectSettings(options?: ReconnectOptions): {
	baseMs: number
	maxMs: number
	attempts: number
} {
	return {
		baseMs: options?.baseMs ?? defaultReconnect.baseMs,
		maxMs: options?.maxMs ?? defaultReconnect.maxMs,
		attempts: options?.attempts ?? defaultReconnect.attempts,
	}
}

/** The delay before one attempt, counting from zero. The delay doubles up to the ceiling. */
export function reconnectDelay(attempt: number, settings: { baseMs: number; maxMs: number }): number {
	return Math.min(settings.baseMs * 2 ** attempt, settings.maxMs)
}
