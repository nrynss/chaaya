/**
 * Still image capture. `CameraSession` opens the camera and grabs frames, and
 * `prepareImage` turns any picked or captured image into an upload-ready blob.
 * Both are behaviour only. The app renders the video element and its controls.
 *
 * Importing this module touches no browser global. The session reaches the
 * camera only inside `start`, and the preparation reaches the canvas only
 * inside `prepareImage`, so a server render may import freely.
 *
 * The re-exports name the .js extension. A plain node import resolves a
 * literal path and never searches for an extension, so the built barrel needs
 * that name to load.
 */
export { CameraSession } from "./camera-session.svelte.js";
export type { CameraCaptureOptions, CameraFacing, CameraPhase, CameraStartOptions } from "./camera-session.svelte.js";
export { fitDimensions, hasExifSegment, prepareImage, readExifOrientation, readStoredDimensions } from "./prepare-image.js";
export type { PreparedImage, PrepareImageOptions } from "./prepare-image.js";
export { fileBackend, nativeBackend, sessionBackend } from "./seam.js";
export type { ImageCaptureBackend } from "./seam.js";
