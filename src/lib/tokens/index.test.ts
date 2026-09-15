// The package ships no node type package, so the builtin that reads the
// stylesheet has no declaration. Suppress the one missing type here.
// @ts-expect-error node:fs has no type declarations in this project
import { readFileSync } from "node:fs"
import { expect, test } from "vitest"
import { checkTokens } from "./index"

const reference = readFileSync(
  new URL("./reference.css", import.meta.url),
  "utf8"
)

test("a complete token file reports no gap", () => {
  expect(checkTokens(reference)).toEqual([])
})

test("a theme block short of a role reports that role", () => {
  const planted = reference.replace("--on-accent:", "--on-accent-dropped:")
  expect(checkTokens(planted)).toEqual([
    { theme: "system light", missing: ["on-accent"] }
  ])
})
