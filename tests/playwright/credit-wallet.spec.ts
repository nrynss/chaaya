import { expect, test } from "@playwright/test"

test.describe("credit wallet", () => {
	test("a short run tops up, follows the return, and confirms on the same quote", async ({ page }) => {
		await page.goto("/tests/credit-wallet")
		await page.getByTestId("wipe").click()
		await expect(page.getByTestId("balance")).toHaveText("10")
		await page.getByTestId("confirm").click()
		await expect(page.getByTestId("phase")).toHaveText("insufficient", { timeout: 10_000 })
		await expect(page.getByTestId("insufficient-balance")).toHaveText("10")
		await expect(page.getByTestId("quote-id")).toHaveText("q1")

		await page.getByTestId("top-up-button").click()
		await page.waitForURL(/\/tests\/credit-wallet\?tab=credits$/)
		// The return reads once and replaces history, so the reference left the address bar.
		await expect(page.getByTestId("top-up-reference")).toHaveText("ref-1")
		await expect(page.getByTestId("top-up")).toHaveText("following")
		await expect(page.getByTestId("balance")).toHaveText("10")
		await expect(page.getByTestId("top-up")).toHaveText("landed", { timeout: 10_000 })
		await expect(page.getByTestId("balance")).toHaveText("510")

		// The app handed the kept quote back, so the confirm runs on q1 without re-quoting.
		await expect(page.getByTestId("phase")).toHaveText("quoted")
		await expect(page.getByTestId("quote-id")).toHaveText("q1")
		await page.getByTestId("confirm").click()
		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 10_000 })
		await expect(page.getByTestId("run-keys")).toHaveText("q1,q1")
		await expect(page.getByTestId("balance")).toHaveText("470", { timeout: 10_000 })
	})

	test("a reload after the return does not wait again", async ({ page }) => {
		await page.goto("/tests/credit-wallet")
		await page.getByTestId("wipe").click()
		await expect(page.getByTestId("balance")).toHaveText("10")
		await page.getByTestId("top-up-button").click()
		await expect(page.getByTestId("top-up")).toHaveText("landed", { timeout: 10_000 })
		await page.reload()
		await expect(page.getByTestId("balance")).toHaveText("510")
		await expect(page.getByTestId("top-up")).toHaveText("idle")
		await expect(page.getByTestId("top-up-reference")).toHaveText("")
	})

	test("the docs demo runs from the keyboard and passes the gates", async ({ page }) => {
		await page.goto("/docs/credit-wallet")
		await expect(page.getByTestId("hydrated")).toHaveText("ready")
		await expect(page.getByTestId("demo-balance")).toHaveText("30 credit.label")
		await page.getByTestId("demo-confirm").focus()
		await page.keyboard.press("Enter")
		await expect(page.getByTestId("demo-phase")).toHaveText("insufficient")
		await page.keyboard.press("Tab")
		await expect(page.getByTestId("demo-top-up")).toBeFocused()
		await page.keyboard.press("Enter")
		await expect(page.getByTestId("demo-top-up-phase")).toHaveText("following")
		await expect(page.getByTestId("demo-top-up-phase")).toHaveText("landed", { timeout: 10_000 })
		await expect(page.getByTestId("demo-balance")).toHaveText("530 credit.label")
		await page.getByTestId("demo-confirm").focus()
		await page.keyboard.press("Enter")
		await expect(page.getByTestId("demo-phase")).toHaveText("done")
		await expect(page.getByTestId("demo-balance")).toHaveText("490 credit.label")
		await page.getByTestId("run-checks").click()
		await expect(page.getByTestId("checks")).toHaveText("pass", { timeout: 30_000 })
		await expect(page.getByTestId("check-failure")).toHaveText("")
	})
})
