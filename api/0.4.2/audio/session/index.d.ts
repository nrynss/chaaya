/**
 * A headless recording session. The phase table is the behaviour. The
 * capture port is the microphone. The upload port is the socket. Neither
 * port is Keel and neither port is a view.
 */
export { captureFromRecorder } from "./port.js";
export type { RecordingSource } from "./port.js";
export { RecordingCancelled, RecordingSessionError, createRecordingSession } from "./session.js";
export type { RecordingCapture, RecordingSession, RecordingSessionCode, RecordingSessionOptions, RecordingUpload } from "./session.js";
export type { RecordingPhase } from "./phase.js";
