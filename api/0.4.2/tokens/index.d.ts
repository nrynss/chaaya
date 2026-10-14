/** The Chaaya token contract.
 *
 * Every app that uses Chaaya fills these role names with its own values. A
 * piece of Chaaya styles itself through the roles alone, so it never invents
 * a name a consumer did not define.
 *
 * A theme block redefines the whole role list for one colour scheme. The
 * contract uses four blocks. The light block sits on the root, the dark block
 * sits on the root inside a system preference media query, and two more
 * blocks force a theme on the root element. A forced block carries higher
 * specificity than the media query, so an explicit theme beats the system
 * preference in both directions.
 *
 * The contract does not use light-dark(). Measurement in the rendering
 * engines showed that a role declared with light-dark() reads back as the
 * unevaluated expression, so code that reads a role outside CSS (a canvas, a
 * chart) gets a value it cannot use. The block mechanism keeps every role a
 * literal, so a consumer can read any role from a computed style.
 */
/** The role names every consumer defines. Each name becomes a --prefixed
 * custom property in the consumer's stylesheet. */
export declare const tokenRoles: readonly ["ground", "surface", "raised", "sunken", "line", "line-soft", "text", "dim", "faint", "accent", "accent-soft", "on-accent", "ok", "ok-soft", "warn", "warn-soft", "stop", "stop-soft", "radius-control", "radius-panel", "font-ui", "font-numeric", "focus-ring"];
/** A role name from the contract. */
export type TokenRole = (typeof tokenRoles)[number];
/** One theme block that does not declare every role. */
export interface TokenGap {
    /** The theme block, named by the colour scheme it serves. */
    theme: string;
    /** The role names the block leaves out, in contract order. */
    missing: TokenRole[];
}
/**
 * Report every role that a theme block leaves out.
 *
 * A theme block is a style rule that sets color-scheme. That declaration
 * names the scheme the block serves, so the checker finds theme blocks by it
 * rather than guessing from selectors. The result holds one entry per short
 * block and an empty array when every block is complete.
 */
export declare function checkTokens(css: string): TokenGap[];
