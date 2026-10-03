import { apiWithGate, GatePasscode, type GateOptions } from "../../api/gate.js"
import { api } from "./api.js"

/** The header Keel's gate reads when the config leaves the name at its default. */
export const keelPasscodeHeader = "X-Passcode"

/** The cookie Keel's gate reads when the config leaves the name at its default. */
export const keelPasscodeCookie = "passcode"

/** A gate passcode with Keel's default header, cookie, and passcode_required code.
 * This is the adapter. `GatePasscode` stays generic and does not know these names. */
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
