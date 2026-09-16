import { expect, test } from "vitest"
import { contrastGate } from "./index"

/** Build a hex colour from its channels. The library ships no literal visual
 * value, so a fixture does the same and the gate still reads a real colour. */
function hex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")
  )
}

/** A light theme block and a dark one, both on the root selector. */
function themes(light: string, dark: string): string {
  return [
    `:root { color-scheme: light; ${light} }`,
    `@media (prefers-color-scheme: dark) { :root { color-scheme: dark; ${dark} } }`
  ].join("\n")
}

test("a pair below the minimum fails in each theme block", () => {
  const css = themes(
    `--text: ${hex(0x76, 0x76, 0x76)}; --surface: ${hex(0x78, 0x78, 0x78)};`,
    `--text: ${hex(0x11, 0x11, 0x11)}; --surface: ${hex(0x13, 0x13, 0x13)};`
  )
  let message = ""
  try {
    contrastGate(css, [["text", "surface"]])
  } catch (error) {
    message = (error as Error).message
  }
  expect(message).toContain("system light")
  expect(message).toContain("system dark")
})

test("a pair that meets the minimum passes", () => {
  const css = themes(
    `--text: ${hex(0x11, 0x11, 0x11)}; --surface: ${hex(0xff, 0xff, 0xff)};`,
    `--text: ${hex(0xff, 0xff, 0xff)}; --surface: ${hex(0x11, 0x11, 0x11)};`
  )
  expect(() => contrastGate(css, [["text", "surface"]])).not.toThrow()
})

test("the minimum argument replaces the default of 4.5", () => {
  // White on this grey measures about 3.5 to 1.
  const css = themes(
    `--text: ${hex(0xff, 0xff, 0xff)}; --surface: ${hex(0x89, 0x89, 0x89)};`,
    `--text: ${hex(0xff, 0xff, 0xff)}; --surface: ${hex(0x89, 0x89, 0x89)};`
  )
  expect(() => contrastGate(css, [["text", "surface"]], 3)).not.toThrow()
  expect(() => contrastGate(css, [["text", "surface"]])).toThrow(/below 4.5/)
})

test("a token a theme block never declares fails", () => {
  const css = `:root { color-scheme: light; --surface: ${hex(0xff, 0xff, 0xff)}; }`
  expect(() => contrastGate(css, [["text", "surface"]])).toThrow(/--text/)
})

test("a stylesheet with no theme block fails", () => {
  expect(() => contrastGate("body { color: black }", [["text", "surface"]])).toThrow(
    /no theme block/
  )
})
