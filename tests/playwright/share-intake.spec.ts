import { expect, test } from "@playwright/test"

test.describe("share intake", () => {
	test("a share launch yields the payload once, and a reload yields none", async ({ page }) => {
		await page.goto(
			"/share?title=An%20item&text=Try%20this%20https%3A%2F%2Fshop.test%2Fitem%2F9&url=https%3A%2F%2Fshop.test%2Fitem%2F9"
		)
		await expect(page.getByTestId("ready")).toHaveText("yes")
		await expect(page.getByTestId("payload-present")).toHaveText("yes")
		await expect(page.getByTestId("share-url")).toHaveText("https://shop.test/item/9")
		await expect(page.getByTestId("share-text")).toHaveText("Try this https://shop.test/item/9")
		await expect(page.getByTestId("share-title")).toHaveText("An item")
		await page.reload()
		await expect(page.getByTestId("ready")).toHaveText("yes")
		await expect(page.getByTestId("payload-present")).toHaveText("no")
		await expect(page.getByTestId("share-url")).toHaveText("")
	})

	test("a URL inside the text becomes the link", async ({ page }) => {
		await page.goto("/share?text=Look%20at%20https%3A%2F%2Fshop.test%2Fitem%2F7%20today")
		await expect(page.getByTestId("ready")).toHaveText("yes")
		await expect(page.getByTestId("payload-present")).toHaveText("yes")
		await expect(page.getByTestId("share-url")).toHaveText("https://shop.test/item/7")
		await page.reload()
		await expect(page.getByTestId("payload-present")).toHaveText("no")
	})

	test("the share intake docs pass the gates", async ({ page }) => {
		await page.goto("/docs/share-intake")
		await expect(page.getByTestId("hydrated")).toHaveText("ready")
		await expect(page.getByTestId("manifest")).toContainText("share_target")
		await page.getByTestId("run-checks").click()
		await expect(page.getByTestId("checks")).toHaveText("pass", { timeout: 30_000 })
		await expect(page.getByTestId("check-failure")).toHaveText("")
	})
})
