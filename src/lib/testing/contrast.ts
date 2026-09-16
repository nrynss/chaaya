/**
 * Contrast gate. Every token pair a component draws must reach a minimum
 * ratio in every theme block a stylesheet defines.
 *
 * The gate reads the token values out of the stylesheet text it is handed, so
 * a caller points it at any theme file and any pair list. The ratio maths
 * follows the WCAG relative luminance definition, and the default minimum is
 * the WCAG AA ratio for normal text.
 */

/** One theme block, named by its selector and the media context it sits in. */
interface ThemeBlock {
  label: string
  body: string
}

/** One declaration rule, with the at-rule that wraps it kept as context. */
interface Rule {
  selector: string
  media: string | null
  body: string
}

/** A token pair a component draws, foreground over background. Each name is a
 * bare custom property name, without the leading dashes. */
export type ContrastPair = readonly [foreground: string, background: string]

const colorScheme = /\bcolor-scheme\s*:/
const systemDark = /prefers-color-scheme\s*:\s*dark/
const systemLight = /prefers-color-scheme\s*:\s*light/
const forcedDark = /data-theme\s*=\s*["']?dark\b/
const forcedLight = /data-theme\s*=\s*["']?light\b/

/** A custom property that holds a hex colour. A declaration with any other
 * value shape stays out of the map, because the gate cannot measure it. */
const hexToken = /--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g

/** Cut comments so a marker inside prose never reads as a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * Split a stylesheet into its declaration rules. A rule inside an at-rule
 * keeps that at-rule as its media context, so a theme block behind a media
 * query stays apart from a forced one.
 */
function parseRules(css: string): Rule[] {
  const text = stripComments(css)
  const rules: Rule[] = []
  let at = 0

  /** The text inside one brace pair, with the closing brace consumed. */
  function readBody(): string {
    let depth = 0
    const start = at
    while (at < text.length) {
      const char = text[at]
      if (char === "{") depth += 1
      else if (char === "}") {
        if (depth === 0) {
          const body = text.slice(start, at)
          at += 1
          return body
        }
        depth -= 1
      }
      at += 1
    }
    return text.slice(start)
  }

  function readRules(media: string | null): void {
    let prelude = ""
    while (at < text.length) {
      const char = text[at]
      if (char === "{") {
        const selector = prelude.trim()
        prelude = ""
        at += 1
        if (selector.startsWith("@")) readRules(selector)
        else rules.push({ selector, media, body: readBody() })
      } else if (char === "}") {
        at += 1
        return
      } else if (char === ";") {
        prelude = ""
        at += 1
      } else {
        prelude += char
        at += 1
      }
    }
  }

  readRules(null)
  return rules
}

/** A short name for a theme block, read from its selector and its media
 * context. */
function themeLabel(selector: string, media: string | null): string {
  if (forcedDark.test(selector)) return "forced dark"
  if (forcedLight.test(selector)) return "forced light"
  if (media && systemDark.test(media)) return "system dark"
  if (media && systemLight.test(media)) return "system light"
  if (/:root/.test(selector)) return "system light"
  return selector
}

/**
 * The theme blocks a stylesheet defines. A block that sets color-scheme names
 * the scheme it serves, so the gate finds themes by that declaration rather
 * than by a guess at the selectors.
 */
function themeBlocks(css: string): ThemeBlock[] {
  return parseRules(css)
    .filter((rule) => colorScheme.test(rule.body))
    .map((rule) => ({
      label: themeLabel(rule.selector, rule.media),
      body: rule.body
    }))
}

/** The hex token values one theme block declares, keyed by property name. */
function tokenValues(body: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const match of body.matchAll(hexToken)) {
    values[match[1]] = match[2]
  }
  return values
}

/** The red, green and blue channels of a hex colour. A three digit value
 * expands to six, and an alpha suffix is ignored. */
function channels(hex: string): [number, number, number] {
  const digits = hex.replace("#", "")
  const full =
    digits.length === 3
      ? digits.split("").map((c) => c + c).join("")
      : digits.slice(0, 6)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ]
}

/** The WCAG relative luminance of a hex colour, from 0 to 1. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => c / 255)
  const linear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** The WCAG contrast ratio between two hex colours, from 1 to 21. */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Check every pair against the minimum ratio, in every theme block the
 * stylesheet defines.
 *
 * The minimum defaults to 4.5, the WCAG AA ratio for normal text. The gate
 * throws one error that names every failure, so a run reports the whole
 * picture rather than the first pair it meets. A stylesheet with no theme
 * block throws too, because a gate that measures nothing must not pass.
 */
export function contrastGate(
  css: string,
  pairs: readonly ContrastPair[],
  minimum = 4.5
): void {
  const themes = themeBlocks(css)
  if (themes.length === 0) {
    throw new Error("contrastGate found no theme block, so it measured nothing")
  }
  const failures: string[] = []
  for (const theme of themes) {
    const values = tokenValues(theme.body)
    for (const [foreground, background] of pairs) {
      const missing = [foreground, background].filter((name) => !values[name])
      if (missing.length > 0) {
        const names = missing.map((name) => `--${name}`).join(" and ")
        failures.push(`${theme.label}: ${names} has no hex value in this theme`)
        continue
      }
      const measured = contrastRatio(values[foreground], values[background])
      if (measured < minimum) {
        failures.push(
          `${theme.label}: --${foreground} (${values[foreground]}) on --${background} (${values[background]}) is ${measured.toFixed(2)} to 1, below ${minimum}`
        )
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`Contrast below the minimum:\n${failures.join("\n")}`)
  }
}
