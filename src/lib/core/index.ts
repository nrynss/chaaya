/**
 * Generic contracts. An adapter implements these. This module imports no
 * adapter and names no backend.
 */
export { ApiError, api, createApi } from "./api.js"
export type { ApiClient, ApiClientOptions, ApiErrorParser, ApiFailureBody, ApiRequestInit } from "./api.js"
export { decodeJson, fail, isRecord, ok } from "./result.js"
export type { ParseFailure, ParseResult } from "./result.js"
export { formatNamedFrame, parseNamedFrame, takeFrames, defaultReconnect, reconnectDelay, reconnectSettings } from "./sse/index.js"
export type { CommentFrame, EventFrame, NamedEvent, NamedFrameFields, ReconnectOptions, SseFrame } from "./sse/index.js"
export type { JobProgress } from "./progress.js"
export type { Uploader } from "./upload.js"
