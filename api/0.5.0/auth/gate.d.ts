import { ApiError, type ApiClient, type ApiRequestInit } from "../core/api.js";
/** An auth refusal the caller listed.
 * This extends ApiError, so `instanceof ApiError` still matches, and the
 * detail and retry delay are the ones ApiError already carried.
 * `instanceof GateError` is the marker that distinguishes an auth refusal. */
export declare class GateError extends ApiError {
    constructor(source: ApiError);
}
/** A document.cookie jar. The getter returns every cookie. The setter stores one.
 * This is a browser object. A server render has no document, so omit the jar there. */
export interface CookieTarget {
    cookie: string;
}
/** Where one passcode is kept between requests. */
export interface PasscodeStore {
    read(): string;
    write(value: string): void;
    clear(): void;
}
/** What a gate passcode needs. Header and cookie names are required. */
export interface GateOptions {
    /** Header the backend reads. */
    headerName: string;
    /** Cookie the backend reads. */
    cookieName: string;
    /** ApiError codes that should surface as GateError. A plain list, checked
     * with `includes`, so a code named `constructor` or `toString` is not an
     * inherited key. Omit to leave ApiError as-is. */
    authCodes?: readonly string[];
    /** Cookie jar, usually `document`, and only in the browser. Omit on the
     * server. Importing this module does not read `document`. */
    jar?: CookieTarget;
    /** A value known before the jar is read. */
    initial?: string;
}
/** Read one cookie from a cookie header. An absent cookie reads as empty.
 * A raw quoted-string loses its surrounding quotes before decoding, so
 * percent-encoded quotes stay data. */
export declare function readCookie(header: string, name: string): string;
/**
 * The passcode a Set-Cookie line names, when this runtime still exposes that
 * header.
 *
 * Browsers implement `getSetCookie`, but a fetch response returns `[]` from
 * it. `Set-Cookie` is a forbidden response-header name, so the browser strips
 * it before script sees it, and `get("set-cookie")` is null for the same
 * reason. This then returns undefined. Node and undici still surface the
 * header, and that is the branch that returns a value. A browser stores the
 * cookie in its own jar, which a `document` jar then reads, or the JSON body
 * carries `passcode`.
 */
export declare function readSetCookie(headers: Headers, name: string): string | undefined;
/**
 * A passcode sent on a caller-chosen header and cookie. This helper does not
 * pick a backend's default names.
 *
 * Importing this module does no DOM work. Pass `jar: document` only in the
 * browser. On the server, omit `jar`. Memory still holds a value set in this
 * process, and `apply()` still sets the header. A cookie the browser stored
 * is not visible here unless the caller passes a jar.
 */
export declare class GatePasscode {
    #private;
    readonly headerName: string;
    readonly cookieName: string;
    readonly authCodes: readonly string[];
    constructor(options: GateOptions);
    /** The stored passcode, or the cookie when memory is empty. */
    get value(): string;
    /** Keep a passcode and mirror it into the cookie jar. */
    set(value: string): void;
    /** Forget the passcode and expire its cookie. */
    clear(): void;
    /**
     * The init api() should send. A stored passcode is added unless the caller
     * already set the header. credentials are not set. Pass
     * `credentials: "include"` to send the cookie.
     */
    apply(init?: ApiRequestInit): ApiRequestInit;
    /**
     * Store a passcode a response exposed.
     *
     * A Set-Cookie line wins when this runtime still exposes that header
     * (Node, undici), and it wins over a `passcode` member in the body when
     * both are present. Browser fetch hides the header: `getSetCookie()` is
     * `[]` and `get("set-cookie")` is null, because `Set-Cookie` is a
     * forbidden response-header name. The JSON member `passcode` is the path
     * that works in a browser. If the browser stored the cookie itself, the
     * next `value` read sees it through a `document` jar without this method.
     */
    remember(response: Response, body?: unknown): boolean;
}
/** api() with this passcode applied. Listed auth codes become GateError and keep detail and retryAfterSeconds. */
export declare function apiWithGate(passcode: GatePasscode, call?: ApiClient): <T>(path: string, init?: ApiRequestInit) => Promise<T>;
