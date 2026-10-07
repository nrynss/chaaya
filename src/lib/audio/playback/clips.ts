/** Timed audio clips planned against a media element clock. The maths here
 * is pure, so a logic check asserts it exactly on synthetic clips. A
 * browser wrapper in the sibling module places the plan on a context.
 */

/** One clip of a browser mix preview. */
export interface TimedClip {
	/** The decode cache identity. Clips sharing a key decode once. */
	readonly key: string
	/** Where the bytes come from. */
	readonly url: string
	/** The media clock second the clip starts at. */
	readonly offset: number
	/** The second into the decoded buffer the clip starts from. */
	readonly inPoint: number
	/** How many seconds of the buffer play. */
	readonly length: number
	/** The clip gain, linear. */
	readonly gain: number
}

/** Where one clip lands on the context clock. */
export interface ClipPlacement {
	/** The decode cache identity. */
	readonly key: string
	/** The context second the source starts at. */
	readonly startAt: number
	/** The second into the decoded buffer playback starts from. */
	readonly bufferOffset: number
	/** How many seconds of the buffer play. */
	readonly playLength: number
	/** The clip gain, linear. */
	readonly gain: number
}

/** Plan one clip against a playhead. A clip starting later waits for its
 * offset, and a clip already under the playhead starts now partway in. A
 * clip the playhead has passed returns null, so it never sounds. */
export function placementAt(
	clip: TimedClip,
	playhead: number,
	now: number,
	rate = 1
): ClipPlacement | null {
	const speed = rate === 0 ? 1 : rate
	if (playhead < clip.offset) {
		return {
			key: clip.key,
			startAt: now + (clip.offset - playhead) / speed,
			bufferOffset: clip.inPoint,
			playLength: clip.length,
			gain: clip.gain
		}
	}
	const elapsed = playhead - clip.offset
	if (elapsed >= clip.length) return null
	return {
		key: clip.key,
		startAt: now,
		bufferOffset: clip.inPoint + elapsed,
		playLength: clip.length - elapsed,
		gain: clip.gain
	}
}

/** Plan every clip that still has sound at a playhead. The order follows
 * the clip list, so a consumer schedules deterministically. */
export function planPlacements(
	clips: readonly TimedClip[],
	playhead: number,
	now: number,
	rate = 1
): ClipPlacement[] {
	const placements: ClipPlacement[] = []
	for (const clip of clips) {
		const placement = placementAt(clip, playhead, now, rate)
		if (placement) placements.push(placement)
	}
	return placements
}
