import { type ActionFailure } from "@sveltejs/kit";
import { ApiError, type ApiErrorParser } from "../core/api.js";
/** The fields a form result and an error page share with ApiError.
 * `code` is what a caller branches on. It is the ApiError code, unchanged. */
export interface ActionErrorData {
    /** The stable identifier a caller branches on. */
    code: string;
    /** A sentence a caller may show and never branch on. */
    message: string;
    /** Detail the app alone reads. Empty when the error carried none. */
    detail: Record<string, unknown>;
    /** The seconds a 429 told the caller to wait, when the error named one. */
    retryAfterSeconds?: number;
}
/** A refused response whose body the app's parser can read.
 * Pass text, because a Response body reads once. */
export interface ApiFailureSource {
    /** The refused response. Status and Retry-After come from here. */
    response: Response;
    /** The body text already read from the response. */
    text: string;
    /** The app's parser. Omit it and a body that is not parsed stays http_error. */
    parseError?: ApiErrorParser;
}
/** An ApiError, or a refused response to turn into one. */
export type ApiErrorInput = ApiError | ApiFailureSource;
/** Copy the stable fields. The code is the ApiError code. */
export declare function toActionData(source: ApiErrorInput): ActionErrorData;
/** The status SvelteKit's fail() and error() accept.
 * An integer from 400 to 599 passes through. `timeout` becomes 504.
 * `network` becomes 503. Any other status becomes 502. The code is not changed. */
export declare function actionStatus(source: ApiErrorInput): number;
/** Return this from a form action. The data keeps the ApiError code. */
export declare function failFromApiError(source: ApiErrorInput, status?: number): ActionFailure<ActionErrorData>;
/** Throw this from a load or an action that should render the error page.
 * The thrown body keeps the ApiError code. SvelteKit types that body as
 * App.Error, whose default is message. Extend App.Error to type the code. */
export declare function errorFromApiError(source: ApiErrorInput, status?: number): never;
