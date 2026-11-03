import { expect, test } from "@playwright/test"

test("observable reads, private methods and setters update one template evaluation per notification", async ({ page }) => {
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(error.message))
	await page.goto("/tests/bindings")
	await expect(page.getByTestId("hydrated")).toHaveText("ready")
	await expect(page.getByTestId("reading")).toHaveText("1:0:0:0")
	await expect(page.getByTestId("stable-method")).toHaveText("yes")
	await expect(page.getByTestId("attaches")).toHaveText("1")

	await page.getByTestId("method").click()
	await expect(page.getByTestId("reading")).toHaveText("2:1:2:1")
	await page.getByTestId("setter").click()
	await expect(page.getByTestId("reading")).toHaveText("3:2:4:2")
	await page.getByTestId("unchanged").click()
	await expect(page.getByTestId("reading")).toHaveText("3:2:4:2")
	await expect(page.getByTestId("attaches")).toHaveText("1")
	await expect(page.getByTestId("teardowns")).toHaveText("0")

	await page.getByTestId("toggle").click()
	await expect(page.getByTestId("reading")).toHaveCount(0)
	await expect(page.getByTestId("teardowns")).toHaveText("1")
	await page.getByTestId("toggle").click()
	await expect(page.getByTestId("reading")).toHaveText("1:2:4:2")
	await expect(page.getByTestId("attaches")).toHaveText("2")
	await page.getByTestId("method").click()
	await expect(page.getByTestId("reading")).toHaveText("2:3:6:3")
	await expect(page.getByTestId("attaches")).toHaveText("2")
	await page.getByTestId("toggle").click()
	await expect(page.getByTestId("teardowns")).toHaveText("2")
	expect(errors).toEqual([])
})
