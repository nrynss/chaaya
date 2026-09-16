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

/** The interactive controls the focus rule covers. An element outside this
 * set may carry any tabindex, so the rule skips it. */
const controlSelector = "button, a[href], input, select, textarea"

/**
 * Check the accessibility rules against a rendered container.
 *
 * The container must already sit in the document, because axe reads the
 * document that holds it. The gate throws one error that lists every failure,
 * so a run reports the whole picture rather than the first rule it meets.
 */
export async function a11yGate(container: HTMLElement): Promise<void> {
  // A static import would load axe at module load and touch the document,
  // which breaks a server render. The specifier is a literal, so this is the
  // one case where a lazy import is the point rather than an accident.
  const axe = (await import("axe-core")).default
  const failures: string[] = []

  const results = await axe.run(container, {
    rules: {
      // Colour contrast needs a layout engine, and jsdom has none. A separate
      // token gate measures the declared theme colours instead.
      "color-contrast": { enabled: false },
      // jsdom has no viewport, so a landmark check would read nothing.
      region: { enabled: false }
    }
  })
  for (const violation of results.violations) {
    if (violation.impact !== "serious" && violation.impact !== "critical") {
      continue
    }
    failures.push(
      `axe ${violation.impact}: ${violation.id} on ${violation.nodes.length} node(s)`
    )
  }

  for (const element of container.querySelectorAll("[title]")) {
    failures.push(
      `title attribute on <${element.tagName.toLowerCase()}>: ${element.getAttribute("title")}`
    )
  }

  for (const element of container.querySelectorAll<HTMLElement>(controlSelector)) {
    if (element.hasAttribute("disabled")) continue
    if (element.getAttribute("tabindex") === "-1") {
      failures.push(
        `control cannot take focus: ${element.outerHTML.slice(0, 120)}`
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(`Accessibility gate failed:\n${failures.join("\n")}`)
  }
}
