import { expect, test } from "vitest"
import { PcmStreamPlayer } from "./stream.svelte.js"

/** The times one scheduled source recorded. */
interface FakeSource {
	startedAt: number | null
	stoppedAt: number | null
}
/** A context with a hand driven clock and sources that record their times. */
interface FakeClock {
	currentTime: number
	sampleRate: number
	destination: object
	sources: FakeSource[]
	forward: (seconds: number) => void
	asContext: () => AudioContext
}

/** Builds a context whose clock moves only when the check moves it. */
function fakeClock(sampleRate: number): FakeClock {
	const clock: FakeClock = {
		currentTime: 0,
		sampleRate,
		destination: {},
		sources: [],
		forward(seconds: number): void {
			clock.currentTime += seconds
		},
		asContext(): AudioContext {
			const context = {
				get currentTime(): number {
					return clock.currentTime
				},
				sampleRate: clock.sampleRate,
				destination: clock.destination,
				createBuffer: (_channels: number, frames: number) => {
					const data = new Float32Array(frames)
					return {
						getChannelData: () => data,
						length: frames
					}
				},
				createBufferSource: () => {
					const source: FakeSource = { startedAt: null, stoppedAt: null }
					const node = {
						buffer: null,
						onended: null as (() => void) | null,
						connect: (): void => undefined,
						disconnect: (): void => undefined,
						start: (when?: number): void => {
							source.startedAt = when ?? clock.currentTime
						},
						stop: (when?: number): void => {
							source.stoppedAt = when ?? clock.currentTime
						}
					}
					clock.sources.push(source)
					return node
				}
			}
			return context as unknown as AudioContext
		}
	}
	return clock
}

/** A block of the given frame count filled with a ramp the check can spot. */
function block(frames: number): Float32Array {
	const samples = new Float32Array(frames)
	for (let index = 0; index < frames; index += 1) samples[index] = index / frames
	return samples
}

test("consecutive blocks abut with no gap", () => {
	const clock = fakeClock(48000)
	const player = new PcmStreamPlayer({ context: clock.asContext(), leadSeconds: 0.05 })
	const first = player.push(block(4800))
	expect(first.startTime).toBeCloseTo(0.05, 9)
	expect(first.endTime).toBeCloseTo(0.15, 9)
	expect(first.underrun).toBe(false)
	const second = player.push(block(4800))
	expect(second.startTime).toBeCloseTo(first.endTime, 9)
	expect(second.endTime).toBeCloseTo(0.25, 9)
	expect(second.underrun).toBe(false)
	expect(player.underruns).toBe(0)
})

test("a late block starts at now plus the lead and reports the gap", () => {
	const clock = fakeClock(48000)
	const player = new PcmStreamPlayer({ context: clock.asContext(), leadSeconds: 0.05 })
	const first = player.push(block(4800))
	clock.forward(0.5)
	const late = player.push(block(4800))
	expect(late.startTime).toBeCloseTo(0.55, 9)
	expect(late.startTime).toBeGreaterThan(first.endTime)
	expect(late.underrun).toBe(true)
	expect(player.underruns).toBe(1)
})

test("flush cuts at the clock reading and the next block starts fresh", () => {
	const clock = fakeClock(48000)
	const player = new PcmStreamPlayer({ context: clock.asContext(), leadSeconds: 0.05 })
	player.push(block(4800))
	player.push(block(4800))
	clock.forward(0.2)
	const cut = player.flush()
	expect(cut).toBe(0.2)
	expect(player.lastCut).toBe(0.2)
	for (const source of clock.sources) expect(source.stoppedAt).toBe(0.2)
	const after = player.push(block(4800))
	expect(after.startTime).toBeCloseTo(0.25, 9)
	expect(after.underrun).toBe(false)
	expect(player.underruns).toBe(0)
})

test("a stream rate below the context rate stretches the block", () => {
	const clock = fakeClock(48000)
	const player = new PcmStreamPlayer({
		context: clock.asContext(),
		streamRate: 24000,
		leadSeconds: 0.05
	})
	const placed = player.push(block(2400))
	expect(placed.endTime - placed.startTime).toBeCloseTo(4800 / 48000, 9)
	const next = player.push(block(2400))
	expect(next.startTime).toBeCloseTo(placed.endTime, 9)
})

test("an empty block schedules nothing and keeps the schedule", () => {
	const clock = fakeClock(48000)
	const player = new PcmStreamPlayer({ context: clock.asContext(), leadSeconds: 0.05 })
	player.push(block(4800))
	const count = player.blocks.length
	player.push(new Float32Array(0))
	expect(player.blocks.length).toBe(count)
	expect(clock.sources.length).toBe(count)
})
