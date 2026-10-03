/**
 * Generic contracts. An adapter implements these. This module imports no
 * adapter and names no backend.
 */
export { ApiError, api, createApi } from "./api.js"
export type { ApiClient, ApiClientOptions, ApiErrorParser, ApiFailureBody, ApiRequestInit } from "./api.js"
export { parseNamedFrame, takeFrames, defaultReconnect, reconnectDelay, reconnectSettings } from "./sse/index.js"
export type { CommentFrame, EventFrame, NamedEvent, ReconnectOptions, SseFrame } from "./sse/index.js"
export type { JobProgress } from "./progress.js"
export type { Uploader } from "./upload.js"
