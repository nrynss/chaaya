/**
 * SvelteKit helpers. Form-action mappers turn an ApiError into the value
 * fail() returns and the value error() throws. `createJobStreamResponse`
 * builds a `text/event-stream` Response a JobStream can follow. This module
 * imports no adapter. A caller passes an ApiError, or a response body plus
 * the app's parseError, or a frame iterable. Keel's parser and frame map stay
 * on `@nrynss/chaaya/keel`.
 */
export { actionStatus, errorFromApiError, failFromApiError, toActionData } from "./action.js";
export type { ActionErrorData, ApiErrorInput, ApiFailureSource } from "./action.js";
export { createJobStreamResponse } from "./stream.js";
export type { JobStreamResponseOptions, SseFrameInput } from "./stream.js";
