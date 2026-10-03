/**
 * SvelteKit form-action helpers. They turn an ApiError into the value
 * fail() returns and the value error() throws. This module imports no
 * adapter. A caller passes an ApiError, or a response body plus the app's
 * parseError. Keel's parser stays on `@nrynss/chaaya/keel`.
 */
export { actionStatus, errorFromApiError, failFromApiError, toActionData } from "./action.js"
export type { ActionErrorData, ApiErrorInput, ApiFailureSource } from "./action.js"
