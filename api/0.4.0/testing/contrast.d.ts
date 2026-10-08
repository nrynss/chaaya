/**
 * Contrast gate. Every token pair a component draws must reach a minimum
 * ratio in every theme block a stylesheet defines.
 *
 * The gate reads the token values out of the stylesheet text it is handed, so
 * a caller points it at any theme file and any pair list. The ratio maths
 * follows the WCAG relative luminance definition, and the default minimum is
 * the WCAG AA ratio for normal text.
 */
/** A token pair a component draws, foreground over background. Each name is a
 * bare custom property name, without the leading dashes. */
export type ContrastPair = readonly [foreground: string, background: string];
/**
 * Check every pair against the minimum ratio, in every theme block the
 * stylesheet defines.
 *
 * The minimum defaults to 4.5, the WCAG AA ratio for normal text. The gate
 * throws one error that names every failure, so a run reports the whole
 * picture rather than the first pair it meets. A stylesheet with no theme
 * block throws too, because a gate that measures nothing must not pass.
 */
export declare function contrastGate(css: string, pairs: readonly ContrastPair[], minimum?: number): void;
