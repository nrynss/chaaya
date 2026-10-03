/**
 * The generic HTTP client. It implements ApiClient and reads no backend
 * envelope. A Keel caller imports api from `@nrynss/chaaya/keel` instead.
 * `readApiError` is the read `api()` uses for a non-2xx body. Form actions
 * call it, so a response parsed outside the client keeps the same code.
 */
export { ApiError, api, createApi, readApiError } from "../core/api.js"
export type { ApiClient, ApiClientOptions, ApiErrorParser, ApiFailureBody, ApiRequestInit } from "../core/api.js"
