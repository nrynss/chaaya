import { expect, test } from "vitest"
import { packageName } from "./index"

test("the package root imports and evaluates", () => {
  expect(packageName).toBe("@nrynss/chaaya")
})
