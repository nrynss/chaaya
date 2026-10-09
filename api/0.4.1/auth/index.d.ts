/**
 * A passcode gate. It names no backend. An adapter fills the header, the
 * cookie, and the auth codes. Keel's adapter is `keelGate` in
 * `src/lib/adapters/keel/gate.ts`.
 */
export { GateError, GatePasscode, apiWithGate, readCookie, readSetCookie } from "./gate.js";
export type { CookieTarget, GateOptions, PasscodeStore } from "./gate.js";
