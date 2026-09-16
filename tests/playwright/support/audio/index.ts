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
 * | generated input | yes | yes | partial |
 * | capture | yes | yes | partial |
 * | upload | yes | yes | no |
 * | playback | yes | yes | yes |
 * | levels | yes | yes | yes |
 *
 * WebKit on Linux runs the PCM capture path, the denied path and the
 * track-stop path. Its headless build defines no MediaRecorder, so the
 * compressed capture records nothing there. The upload cases and the three
 * generated take cases skip on WebKit for the same absence. WebKit runs the
 * stream-shape case of the generated input and the whole levels spec.
 *
 * Chromium and Firefox run every generated-input case. The page builds the
 * signal with Web Audio and MediaRecorder writes a container, so neither
 * engine needs a device or a launch flag. A clean clone proves both stay
 * deterministic.
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
