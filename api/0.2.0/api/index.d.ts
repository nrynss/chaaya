/**
 * The HTTP client a Chaaya consumer shares. One fetch wrapper turns a failed
 * response into an ApiError a caller branches on by code. It turns a timeout
 * and a lost network into the same shape, rather than a bare TypeError.
 */
export { ApiError, api } from "./client.js";
export type { ApiRequestInit } from "./client.js";
