import { expect, test } from "@playwright/test"

test("the app page renders with no console errors", async ({ page }) => {
	const problems: string[] = []
	page.on("console", (message) => {
		if (message.type() === "error") problems.push(message.text())
	})
	page.on("pageerror", (error) => problems.push(String(error)))

	await page.goto("/")
	await expect(page.getByRole("heading", { name: "Chaaya" })).toBeVisible()
	expect(problems).toEqual([])
})
