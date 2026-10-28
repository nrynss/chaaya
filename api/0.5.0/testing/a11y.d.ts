/**
 * Accessibility gate. A rendered container must pass three mechanical rules.
 *
 * 1. axe finds no serious or critical violation.
 * 2. No element carries a native title attribute, because help text must
 *    reach a keyboard user and a pointer-only tooltip does not.
 * 3. Every interactive control can take focus, so nothing is keyboard dead.
 *
 * The gate imports axe inside the call. Importing this module does no work, so
 * a server render stays safe and the axe payload only loads when a gate runs.
 */
/**
 * Check the accessibility rules against a rendered container.
 *
 * The container must already sit in the document, because axe reads the
 * document that holds it. The gate throws one error that lists every failure,
 * so a run reports the whole picture rather than the first rule it meets.
 */
export declare function a11yGate(container: HTMLElement): Promise<void>;
