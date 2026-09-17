import { expect, test, type Page } from "@playwright/test"

/** Open the harness once its buttons answer, so a click never races hydration. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/transcript")
	await expect(page.getByTestId("word-0")).toBeEnabled()
}

test("keyboard alone selects, extends, cuts and reverts a word span", async ({ page }) => {
	await open(page)

	// Tab from the address bar lands on the first word. Every step below
	// moves focus with the keyboard and checks the page names it.
	await page.keyboard.press("Tab")
	await expect(page.getByTestId("word-0")).toBeFocused()
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("selection")).toHaveText("words 0 to 0")

	await page.getByTestId("extend-2").focus()
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("selection")).toHaveText("words 0 to 2")

	await page.getByTestId("cut").focus()
	await page.keyboard.press("Enter")
	// Words 0 to 2 run 0 to 1.7, so the cut removes 1.7 seconds.
	await expect(page.getByTestId("cuts")).toHaveText("cut-1: words 0 to 2")
	await expect(page.getByTestId("length")).toHaveText("1.80 seconds")
	await expect(page.getByTestId("edited-3")).toHaveText("edited 0.10 to 0.60")

	await page.getByTestId("revert-cut-1").focus()
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("cuts")).toHaveText("no cuts")
	await expect(page.getByTestId("length")).toHaveText("3.50 seconds")
	await expect(page.getByTestId("edited-3")).toHaveText("edited 1.80 to 2.30")
})

test("the docs page passes the accessibility and contrast gates", async ({ page }) => {
	await page.goto("/docs/transcript")
	await expect(page.getByTestId("word-0")).toBeEnabled()
	await page.getByTestId("run-gates").click()
	await expect(page.getByTestId("gates")).toHaveText("done", { timeout: 15_000 })
})
