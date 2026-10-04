import { type ApiClient, type ApiErrorParser } from "../../core/api.js";
/** Read Keel's `{ error: { code, message, detail? } }` envelope. Anything else is left for http_error. */
export declare const keelErrorParser: ApiErrorParser;
/** Fetch client that reads Keel's error envelope. The generic `api` does not. */
export declare const api: ApiClient;
