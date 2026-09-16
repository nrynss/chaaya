/**
 * One place for every helper a layer two audio check stands on.
 *
 * Layer two is the browser wiring layer. A check feeds the page a signal the
 * page builds itself, then reads back what the feature did with it. A
 * microphone belongs to the live check, which runs once at the end.
 *
 * ## Engine coverage
 *
 * | Check | Chromium | Firefox | WebKit |
 * |---|---|---|---|
 * | generated input | yes | yes | no |
 * | capture | yes | yes | no |
 * | upload | yes | yes | no |
 * | playback | yes | yes | yes |
 * | levels | yes | yes | no |
 *
 * WebKit on Linux runs playback only. Its headless build opens no capture
 * graph, so every other check records nothing there.
 *
 * Chromium and Firefox run the generated input. The page builds the signal
 * with Web Audio and MediaRecorder writes a container, so neither engine needs
 * a device or a launch flag. A clean clone proves both stay deterministic.
 *
 * A check that skips an engine states the reason in the spec, so a skip never
 * hides a defect.
 *
 * ## Importing
 *
 * `input.ts` holds the page side helpers. Import it alone from a harness
 * route, because `markers.ts` reaches for Node and cannot ride into a bundle.
 * A Playwright spec may import this barrel, which re-exports both halves.
 */
export {
	buildGeneratedStream,
	generateSamples,
	installGeneratedMicrophone,
	markerOnsetsSeconds,
	recordGeneratedTake
} from "./input"
export type {
	GeneratedInputOptions,
	GeneratedMicrophone,
	GeneratedStream,
	GeneratedTake
} from "./input"
export { readMarkers } from "./markers"
export type { MarkerReaderOptions, MarkerReading } from "./markers"
