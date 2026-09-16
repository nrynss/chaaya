// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { a11yGate } from "./index"

/** Attach a container to the document, because axe reads the document that
 * holds the container. */
function mount(html: string): HTMLElement {
  const container = document.createElement("div")
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

afterEach(() => {
  document.body.innerHTML = ""
})

test("a container of reachable controls passes", async () => {
  const container = mount(
    '<button type="button">Save</button><a href="#target">Target</a>'
  )
  await expect(a11yGate(container)).resolves.toBeUndefined()
})

test("an axe violation fails the gate", async () => {
  // A button with no accessible name is a serious axe violation.
  const container = mount('<button type="button"></button>')
  await expect(a11yGate(container)).rejects.toThrow(/axe critical: button-name/)
})

test("a title attribute fails the gate", async () => {
  const container = mount(
    '<button type="button" title="Save the file">Save</button>'
  )
  await expect(a11yGate(container)).rejects.toThrow(/title attribute/)
})

test("a control that cannot take focus fails the gate", async () => {
  const container = mount('<button type="button" tabindex="-1">Save</button>')
  await expect(a11yGate(container)).rejects.toThrow(/cannot take focus/)
})
