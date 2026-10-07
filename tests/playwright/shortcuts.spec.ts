import { expect, test } from "@playwright/test"

test.describe("shortcuts", () => {
	test("a binding fires on the page, stays silent in a field, and yields to a dialog", async ({ page }) => {
		await page.goto("/tests/shortcuts")
		await expect(page.getByTestId("page-count")).toHaveText("0")
		await page.keyboard.press("k")
		await expect(page.getByTestId("page-count")).toHaveText("1")

		// Typing in a field feeds the field, not the page binding.
		await page.getByTestId("field").click()
		await page.keyboard.press("k")
		await expect(page.getByTestId("page-count")).toHaveText("1")
		await expect(page.getByTestId("field")).toHaveValue("k")

		// A binding that opts in still fires from the field.
		await page.keyboard.press("e")
		await expect(page.getByTestId("edit-count")).toHaveText("1")
		await expect(page.getByTestId("field")).toHaveValue("ke")

		// An open dialog shadows the page binding with its own.
		await page.getByTestId("open").click()
		await expect(page.getByTestId("dialog")).toBeVisible()
		await page.keyboard.press("k")
		await expect(page.getByTestId("dialog-count")).toHaveText("1")
		await expect(page.getByTestId("page-count")).toHaveText("1")

		// Closing the dialog restores the page binding.
		await page.getByTestId("close").click()
		await expect(page.getByTestId("dialog-open")).toHaveText("closed")
		await page.keyboard.press("k")
		await expect(page.getByTestId("page-count")).toHaveText("2")
		await expect(page.getByTestId("dialog-count")).toHaveText("1")
	})

	test("the docs help list matches the bound keys", async ({ page }) => {
		await page.goto("/docs/shortcuts")
		await expect(page.getByTestId("hydrated")).toHaveText("ready")
		await expect(page.getByTestId("help-play")).toHaveText("K: Count one play.")
		await expect(page.getByTestId("help-help")).toHaveText("?: Count one help request.")
		await expect(page.getByTestId("help-undo")).toHaveText("Control+Z: Count one undo.")
		await expect(page.getByTestId("help-step")).toHaveText("ArrowRight: Count one step forward.")

		// The rows come from the live registry, so a key press moves a counter.
		await page.keyboard.press("k")
		await expect(page.getByTestId("demo-play")).toHaveText("1")
		await page.keyboard.press("?")
		await expect(page.getByTestId("demo-help")).toHaveText("1")
		await page.keyboard.press("ArrowRight")
		await expect(page.getByTestId("demo-step")).toHaveText("1")
	})
})
