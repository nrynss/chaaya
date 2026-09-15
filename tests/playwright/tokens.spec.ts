import { expect, test, type Page } from "@playwright/test"

// The reference stylesheet is the contract a consumer copies, so the browser
// gate loads the real file instead of a component that reports its own theme.
const reference = "src/lib/tokens/reference.css"

// The probe paints a role, so the value read back is the one the engine
// resolved rather than the token text.
const markup = `<!doctype html>
<html>
	<head></head>
	<body><div id="probe" style="color: var(--ground)"></div></body>
</html>`

/** The rendered ground colour under one system preference and one forced
 * theme. A null theme leaves the choice to the system. */
async function ground(
	target: Page,
	scheme: "light" | "dark",
	theme: "light" | "dark" | null
): Promise<string> {
	await target.emulateMedia({ colorScheme: scheme })
	await target.setContent(markup)
	await target.addStyleTag({ path: reference })
	await target.evaluate((value) => {
		if (value) document.documentElement.setAttribute("data-theme", value)
		else document.documentElement.removeAttribute("data-theme")
	}, theme)
	return target.evaluate(() => {
		const probe = document.getElementById("probe")
		return probe ? getComputedStyle(probe).color : ""
	})
}

test("an explicit theme beats the system preference in both directions", async ({
	page
}) => {
	const light = await ground(page, "light", null)
	const dark = await ground(page, "dark", null)
	expect(light).not.toBe(dark)

	const combinations = [
		{ scheme: "light", theme: "light", wins: light },
		{ scheme: "light", theme: "dark", wins: dark },
		{ scheme: "dark", theme: "light", wins: light },
		{ scheme: "dark", theme: "dark", wins: dark }
	] as const

	for (const { scheme, theme, wins } of combinations) {
		const rendered = await ground(page, scheme, theme)
		expect(
			rendered,
			`system ${scheme} with the ${theme} theme forced`
		).toBe(wins)
	}
})
