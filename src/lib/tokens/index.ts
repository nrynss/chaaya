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
export const tokenRoles = [
  "ground",
  "surface",
  "raised",
  "sunken",
  "line",
  "line-soft",
  "text",
  "dim",
  "faint",
  "accent",
  "accent-soft",
  "on-accent",
  "ok",
  "ok-soft",
  "warn",
  "warn-soft",
  "stop",
  "stop-soft",
  "radius-control",
  "radius-panel",
  "font-ui",
  "font-numeric",
  "focus-ring"
] as const

/** A role name from the contract. */
export type TokenRole = (typeof tokenRoles)[number]

/** One theme block that does not declare every role. */
export interface TokenGap {
  /** The theme block, named by the colour scheme it serves. */
  theme: string
  /** The role names the block leaves out, in contract order. */
  missing: TokenRole[]
}

interface Rule {
  selector: string
  media: string | null
  body: string
}

const colorScheme = /\bcolor-scheme\s*:/
const systemDark = /prefers-color-scheme\s*:\s*dark/
const systemLight = /prefers-color-scheme\s*:\s*light/
const forcedDark = /data-theme\s*=\s*["']?dark\b/
const forcedLight = /data-theme\s*=\s*["']?light\b/

/** Cut comments so a marker inside prose never reads as a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

/**
 * Split a stylesheet into its declaration rules. A rule inside an at-rule
 * such as a media query keeps that at-rule as its media context, so the
 * checker can tell a system preference block from a forced one.
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

/** The scheme a theme block serves, read from its selector and its media
 * context. */
function themeName(rule: Rule): string {
  if (forcedDark.test(rule.selector)) return "forced dark"
  if (forcedLight.test(rule.selector)) return "forced light"
  if (rule.media && systemDark.test(rule.media)) return "system dark"
  if (rule.media && systemLight.test(rule.media)) return "system light"
  if (/:root/.test(rule.selector)) return "system light"
  return rule.selector
}

/** True when the block body declares the role as a custom property. */
function declares(body: string, role: TokenRole): boolean {
  return new RegExp(`--${role}\\s*:`).test(body)
}

/**
 * Report every role that a theme block leaves out.
 *
 * A theme block is a style rule that sets color-scheme. That declaration
 * names the scheme the block serves, so the checker finds theme blocks by it
 * rather than guessing from selectors. The result holds one entry per short
 * block and an empty array when every block is complete.
 */
export function checkTokens(css: string): TokenGap[] {
  const gaps: TokenGap[] = []
  for (const rule of parseRules(css)) {
    if (!colorScheme.test(rule.body)) continue
    const missing = tokenRoles.filter((role) => !declares(rule.body, role))
    if (missing.length > 0) gaps.push({ theme: themeName(rule), missing })
  }
  return gaps
}
