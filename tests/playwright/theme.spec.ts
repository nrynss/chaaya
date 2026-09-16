import { expect, test, type Page } from "@playwright/test"

import { THEME_KEY, themeScript } from "../../src/lib/theme/theme"

/** The theme painted on the document root, or null when none is set. */
async function painted(page: Page): Promise<string | null> {
	return page.evaluate(() => document.documentElement.dataset.theme ?? null)
}

test("a stored mode is painted before the app's own script runs", async ({ page }) => {
	await page.addInitScript((key) => localStorage.setItem(key, "dark"), THEME_KEY)
	/* Abort the app bundle, so only the inline head script can paint. A
	 * theme that survived this run is already correct before first paint. */
	await page.route("**/_app/**", (route) => route.abort())
	await page.goto("/tests/theme")

	const html = await (await page.request.get("/tests/theme")).text()
	expect(html).toContain(`<script>${themeScript}</script>`)
	expect(await painted(page)).toBe("dark")
})

test("system mode follows an emulated preference change", async ({ page }) => {
	await page.emulateMedia({ colorScheme: "dark" })
	await page.goto("/tests/theme")
	await expect(page.getByTestId("toggle")).toBeEnabled()

	await expect(page.getByTestId("mode")).toHaveText("system")
	await expect(page.getByTestId("resolved")).toHaveText("dark")

	await page.emulateMedia({ colorScheme: "light" })
	await expect(page.getByTestId("resolved")).toHaveText("light")
})

test("a page whose storage throws still applies a theme", async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get() {
				throw new Error("storage is blocked")
			}
		})
	})
	await page.goto("/tests/theme")
	await expect(page.getByTestId("toggle")).toBeEnabled()
	await expect(page.getByTestId("mode")).toHaveText("system")

	await page.getByTestId("toggle").click()
	await expect(page.getByTestId("mode")).toHaveText("dark")
	expect(await painted(page)).toBe("dark")

	await page.getByTestId("toggle").click()
	await expect(page.getByTestId("mode")).toHaveText("light")
	expect(await painted(page)).toBe("light")
})
