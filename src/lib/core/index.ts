/**
 * Generic contracts. An adapter implements these. This module imports no
 * adapter and names no backend.
 *
 * `decodeJson`, `isRecord`, `ok`, and `fail` are decoder primitives for
 * adapter authors. They are not a utility belt for app code.
 *
 * Writing an adapter is covered in the package README under Adapters.
 * Supply `frameMap` and `parseError`.
 */
export { ApiError, api, createApi } from "./api.js"
export type { ApiClient, ApiClientOptions, ApiErrorParser, ApiFailureBody, ApiRequestInit } from "./api.js"
export type { ChaayaError } from "./error.js"
export { JobStream, createJobStream } from "./job/index.js"
export type { JobCatchUp, JobConnection, JobFrameAction, JobFrameHandler, JobStreamOptions } from "./job/index.js"
export { decodeJson, fail, isRecord, ok } from "./result.js"
export type { ParseFailure, ParseResult } from "./result.js"
export { FrameBuffer, FrameLoop, createEventStream, formatNamedFrame, parseNamedFrame, takeFrames, defaultReconnect, reconnectDelay, reconnectSettings } from "./sse/index.js"
export type { CommentFrame, EventConnection, EventFrame, EventStream, EventStreamOptions, FrameDecision, FrameLoopOptions, NamedEvent, NamedFrameFields, ReconnectOptions, SseFrame, StreamConnection } from "./sse/index.js"
export type { JobProgress } from "./progress.js"
export type { Uploader } from "./upload.js"
