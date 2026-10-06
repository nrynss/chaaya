import { expect, test } from "@playwright/test"

test.describe("priced action", () => {
	test("a double confirm runs once", async ({ page }) => {
		await page.goto("/tests/priced-action")
		await page.getByTestId("quote").click()
		await expect(page.getByTestId("phase")).toHaveText("quoted")
		await expect(page.getByTestId("quote-id")).toHaveText("q1")
		await page.getByTestId("confirm").dblclick()
		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 10_000 })
		await expect(page.getByTestId("run-calls")).toHaveText("1")
		await expect(page.getByTestId("run-keys")).toHaveText("q1")
		await expect(page.getByTestId("result")).toHaveText("ok q1")
	})

	test("a retried request resends the same quote id", async ({ page }) => {
		await page.goto("/tests/priced-action?fail=1")
		await page.getByTestId("quote").click()
		await expect(page.getByTestId("phase")).toHaveText("quoted")
		await page.getByTestId("confirm").click()
		await expect(page.getByTestId("phase")).toHaveText("failed", { timeout: 10_000 })
		await page.getByTestId("confirm").click()
		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 10_000 })
		// Two attempts, one idempotency key, so the backend spends once.
		await expect(page.getByTestId("run-keys")).toHaveText("q1,q1")
	})

	test("the docs demo runs from the keyboard and passes the gates", async ({ page }) => {
		await page.goto("/docs/priced-action")
		await expect(page.getByTestId("hydrated")).toHaveText("ready")
		await page.getByTestId("demo-quote-button").focus()
		await page.keyboard.press("Enter")
		await expect(page.getByTestId("demo-phase")).toHaveText("quoted")
		await expect(page.getByTestId("demo-price")).toHaveText("40 credit.label")
		await page.keyboard.press("Tab")
		await expect(page.getByTestId("demo-confirm")).toBeFocused()
		await page.keyboard.press("Enter")
		await expect(page.getByTestId("demo-phase")).toHaveText("done")
		await expect(page.getByTestId("demo-result")).not.toHaveText("")
		await page.getByTestId("run-checks").click()
		await expect(page.getByTestId("checks")).toHaveText("pass", { timeout: 30_000 })
		await expect(page.getByTestId("check-failure")).toHaveText("")
	})
})
