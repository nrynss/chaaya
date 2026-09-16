import { QUIET_DB, measureAnalyser, type Level } from "./measure.js"

/** A live level meter fed by an analyser. The meter reads one block per
 * animation frame while a watcher holds it, and stops the frame loop when
 * the last watcher leaves, so an idle meter costs nothing. */
export class LiveLevel {
	rmsDb = $state(QUIET_DB)
	peakDb = $state(QUIET_DB)

	#analyser: AnalyserNode
	#buffer: Float32Array<ArrayBuffer>
	#frame = 0
	#watchers = 0

	/** True while the frame loop runs. */
	get running(): boolean {
		return this.#frame !== 0
	}

	constructor(analyser: AnalyserNode) {
		this.#analyser = analyser
		this.#buffer = new Float32Array(analyser.fftSize)
	}

	/** Read one block now and publish the result. */
	read(): Level {
		const level = measureAnalyser(this.#analyser, this.#buffer)
		this.rmsDb = level.rmsDb
		this.peakDb = level.peakDb
		return level
	}

	/** Watch the meter, and get back a function that stops watching. The
	 * frame loop runs only while at least one watcher holds it. */
	watch(): () => void {
		this.#watchers += 1
		if (this.#watchers === 1) {
			this.#frame = requestAnimationFrame(this.#tick)
		}
		let held = true
		return () => {
			if (!held) return
			held = false
			this.#watchers -= 1
			if (this.#watchers === 0) {
				cancelAnimationFrame(this.#frame)
				this.#frame = 0
			}
		}
	}

	#tick = (): void => {
		this.read()
		this.#frame = requestAnimationFrame(this.#tick)
	}
}
