import { ApiError, api, type ApiClient, type ApiRequestInit } from "../core/api.js"

/** An auth refusal the caller listed.
 * This extends ApiError, so `instanceof ApiError` still matches, and the
 * detail and retry delay are the ones ApiError already carried.
 * `instanceof GateError` is the marker that distinguishes an auth refusal. */
export class GateError extends ApiError {
	constructor(source: ApiError) {
		super(source.message, source.code, source.status, source.detail, source.retryAfterSeconds)
		this.name = "GateError"
	}
}

/** A document.cookie jar. The getter returns every cookie. The setter stores one.
 * This is a browser object. A server render has no document, so omit the jar there. */
export interface CookieTarget {
	cookie: string
}

/** Where one passcode is kept between requests. */
export interface PasscodeStore {
	read(): string
	write(value: string): void
	clear(): void
}

/** What a gate passcode needs. Header and cookie names are required. */
export interface GateOptions {
	/** Header the backend reads. */
	headerName: string
	/** Cookie the backend reads. */
	cookieName: string
	/** ApiError codes that should surface as GateError. A plain list, checked
	 * with `includes`, so a code named `constructor` or `toString` is not an
	 * inherited key. Omit to leave ApiError as-is. */
	authCodes?: readonly string[]
	/** Cookie jar, usually `document`, and only in the browser. Omit on the
	 * server. Importing this module does not read `document`. */
	jar?: CookieTarget
	/** A value known before the jar is read. */
	initial?: string
}

function shareable(value: string): boolean {
	return value.length > 0 && !/[\r\n\0]/.test(value)
}

/** Drop the surrounding quotes of an RFC 6265 quoted-string. The octets inside
 * stay as they are. An unquoted value is unchanged, including one that merely
 * contains a quote. */
function unquoteCookie(value: string): string {
	if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
	return value
}

/** Read one cookie from a cookie header. An absent cookie reads as empty.
 * A raw quoted-string loses its surrounding quotes before decoding, so
 * percent-encoded quotes stay data. */
export function readCookie(header: string, name: string): string {
	for (const part of header.split(";")) {
		const trimmed = part.trim()
		const at = trimmed.indexOf("=")
		if (at === -1) continue
		if (trimmed.slice(0, at) !== name) continue
		const bare = unquoteCookie(trimmed.slice(at + 1))
		try {
			return decodeURIComponent(bare)
		} catch {
			return bare
		}
	}
	return ""
}

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
export function readSetCookie(headers: Headers, name: string): string | undefined {
	const listed = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : []
	const lines = listed.length > 0 ? listed : splitSetCookie(headers.get("set-cookie"))
	for (const line of lines) {
		const first = line.split(";")[0] ?? ""
		const value = readCookie(first, name)
		if (value !== "") return value
	}
	return undefined
}

function splitSetCookie(header: string | null): string[] {
	if (header === null || header === "") return []
	return [header]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cookieStore(jar: CookieTarget, name: string): PasscodeStore {
	return {
		read: () => readCookie(jar.cookie, name),
		write(value: string) {
			jar.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`
		},
		clear() {
			jar.cookie = `${name}=; Path=/; Max-Age=0`
		},
	}
}

/**
 * A passcode sent on a caller-chosen header and cookie. This helper does not
 * pick a backend's default names.
 *
 * Importing this module does no DOM work. Pass `jar: document` only in the
 * browser. On the server, omit `jar`. Memory still holds a value set in this
 * process, and `apply()` still sets the header. A cookie the browser stored
 * is not visible here unless the caller passes a jar.
 */
export class GatePasscode {
	readonly headerName: string
	readonly cookieName: string
	readonly authCodes: readonly string[]
	#memory: string
	#jar: PasscodeStore | undefined

	constructor(options: GateOptions) {
		if (options.headerName === "" || options.cookieName === "") {
			throw new Error("a gate passcode needs a header name and a cookie name")
		}
		this.headerName = options.headerName
		this.cookieName = options.cookieName
		this.authCodes = options.authCodes ?? []
		this.#memory = ""
		this.#jar = options.jar === undefined ? undefined : cookieStore(options.jar, this.cookieName)
		if (options.initial !== undefined) this.set(options.initial)
	}

	/** The stored passcode, or the cookie when memory is empty. */
	get value(): string {
		if (this.#memory !== "") return this.#memory
		return this.#jar?.read() ?? ""
	}

	/** Keep a passcode and mirror it into the cookie jar. */
	set(value: string): void {
		if (!shareable(value)) throw new Error("a passcode cannot contain a line break or be empty")
		this.#memory = value
		this.#jar?.write(value)
	}

	/** Forget the passcode and expire its cookie. */
	clear(): void {
		this.#memory = ""
		this.#jar?.clear()
	}

	/**
	 * The init api() should send. A stored passcode is added unless the caller
	 * already set the header. credentials are not set. Pass
	 * `credentials: "include"` to send the cookie.
	 */
	apply(init: ApiRequestInit = {}): ApiRequestInit {
		const headers = new Headers(init.headers)
		const value = this.value
		if (value !== "" && !headers.has(this.headerName)) headers.set(this.headerName, value)
		return {
			...init,
			headers,
		}
	}

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
	remember(response: Response, body?: unknown): boolean {
		const fromCookie = readSetCookie(response.headers, this.cookieName)
		if (fromCookie !== undefined) {
			this.set(fromCookie)
			return true
		}
		if (isRecord(body) && typeof body.passcode === "string" && body.passcode !== "") {
			this.set(body.passcode)
			return true
		}
		return false
	}
}

/** api() with this passcode applied. Listed auth codes become GateError and keep detail and retryAfterSeconds. */
export function apiWithGate(passcode: GatePasscode, call: ApiClient = api) {
	return async function gated<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
		try {
			return await call<T>(path, passcode.apply(init))
		} catch (error) {
			if (error instanceof ApiError && passcode.authCodes.includes(error.code)) {
				throw new GateError(error)
			}
			throw error
		}
	}
}
