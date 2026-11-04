import { GatePasscode, type GateOptions } from "../../auth/gate.js";
/** The header Keel's gate reads when the config leaves the name at its default. */
export declare const keelPasscodeHeader = "X-Passcode";
/** The cookie Keel's gate reads when the config leaves the name at its default. */
export declare const keelPasscodeCookie = "passcode";
/** A gate passcode with Keel's default header, cookie, and passcode_required code.
 * This is the canonical adapter. Copy it for another backend.
 * `GatePasscode` stays generic and does not know these names.
 * An empty string for `headerName` or `cookieName` means the Keel default.
 * `GatePasscode` throws on that empty string. This adapter substitutes. */
export declare function keelGate(options?: Partial<GateOptions>): GatePasscode;
/** The Keel client with this passcode applied. */
export declare function apiWithKeelGate(passcode: GatePasscode): <T>(path: string, init?: import("./index.js").ApiRequestInit) => Promise<T>;
