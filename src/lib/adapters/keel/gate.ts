import { apiWithGate, GatePasscode, type GateOptions } from "../../auth/gate.js"
import { api } from "./api.js"

/** The header Keel's gate reads when the config leaves the name at its default. */
export const keelPasscodeHeader = "X-Passcode"

/** The cookie Keel's gate reads when the config leaves the name at its default. */
export const keelPasscodeCookie = "passcode"

/** A gate passcode with Keel's default header, cookie, and passcode_required code.
 * This is the canonical adapter. Copy it for another backend.
 * `GatePasscode` stays generic and does not know these names.
 * An empty string for `headerName` or `cookieName` means the Keel default.
 * `GatePasscode` throws on that empty string. This adapter substitutes. */
export function keelGate(options: Partial<GateOptions> = {}): GatePasscode {
	return new GatePasscode({
		headerName: options.headerName || keelPasscodeHeader,
		cookieName: options.cookieName || keelPasscodeCookie,
		authCodes: options.authCodes ?? ["passcode_required"],
		jar: options.jar,
		initial: options.initial,
	})
}

/** The Keel client with this passcode applied. */
export function apiWithKeelGate(passcode: GatePasscode) {
	return apiWithGate(passcode, api)
}
