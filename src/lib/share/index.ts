/**
 * Share target intake for an installable web app. A share opens the app with
 * a title, a text, and a URL, but senders disagree on where the link sits. The
 * helpers here normalise every shape into one payload, so one handler serves
 * the web share and a native intent alike.
 *
 * Importing this module touches no browser global. Reading the launch URL
 * happens inside `consumeShareLaunch`, so a server render may import freely.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { consumeShareLaunch } from "./intake.js"
export type { ConsumeShareOptions } from "./intake.js"
export { createShareSource, extractFirstUrl, readSharedPayload } from "./payload.js"
export type {
	ShareHandler,
	SharedPayload,
	ShareSource,
	TrackParamFilter
} from "./payload.js"
