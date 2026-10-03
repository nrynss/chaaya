/**
 * The generic HTTP client. It implements ApiClient and reads no backend
 * envelope. A Keel caller imports api from `@nrynss/chaaya/keel` instead.
 */
export { ApiError, api, createApi } from "../core/api.js"
export type { ApiClient, ApiClientOptions, ApiErrorParser, ApiFailureBody, ApiRequestInit } from "../core/api.js"
export { GateError, GatePasscode, apiWithGate, readCookie, readSetCookie } from "./gate.js"
export type { CookieTarget, GateOptions, PasscodeStore } from "./gate.js"
