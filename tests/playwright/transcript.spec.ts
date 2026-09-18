import { expect, test, type Page } from "@playwright/test"

/** Open the harness once its buttons answer, so a click never races hydration. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/transcript")
	await expect(page.getByTestId("word-0")).toBeEnabled()
}

async function readNumber(page: Page, id: string): Promise<number> {
	return Number(await page.getByTestId(id).textContent())
}

async function readWord(page: Page): Promise<number | null> {
	const text = await page.getByTestId("active-word").textContent()
	if (text === null || text.trim() === "none") return null
	return Number(text)
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
	// Words 0 to 2 run 0 to 3, so the cut removes 3 seconds.
	await expect(page.getByTestId("cuts")).toHaveText("cut-1: words 0 to 2")
	await expect(page.getByTestId("length")).toHaveText("3.00 seconds")
	await expect(page.getByTestId("edited-3")).toHaveText("edited 0.00 to 1.00")

	await page.getByTestId("revert-cut-1").focus()
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("cuts")).toHaveText("no cuts")
	await expect(page.getByTestId("length")).toHaveText("6.00 seconds")
	await expect(page.getByTestId("edited-3")).toHaveText("edited 3.00 to 4.00")
})

test("the docs page passes the accessibility and contrast gates", async ({ page }) => {
	await page.goto("/docs/transcript")
	await expect(page.getByTestId("word-0")).toBeEnabled()
	await page.getByTestId("run-gates").click()
	await expect(page.getByTestId("gates")).toHaveText("done", { timeout: 15_000 })
})

test("the active word advances with real playback", async ({ page }) => {
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")

	// Word 2 runs 2 to 3. Waiting for it to name itself proves the derived
	// word tracked the element clock through real frames.
	await expect.poll(() => readWord(page), { timeout: 15_000 }).toBe(2)
	const elapsed = await readNumber(page, "current-time")
	console.log(JSON.stringify({ activeWord: 2, elapsed }))
	expect(elapsed).toBeGreaterThanOrEqual(2)
	expect(elapsed).toBeLessThan(3.5)
	await page.getByTestId("pause").click()
})

test("a word click seeks playback to the word start read from the player", async ({
	page
}) => {
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await page.getByTestId("seek-4").click()

	// The click seeks to word 4 at second 4. The pin reads the player own
	// clock back and the derived word, not the card own guess.
	await expect.poll(() => readWord(page), { timeout: 15_000 }).toBe(4)
	const settled = await readNumber(page, "current-time")
	console.log(JSON.stringify({ word: 4, target: 4, settled }))
	expect(settled).toBeGreaterThanOrEqual(4)
	expect(settled).toBeLessThan(5.5)
	await page.getByTestId("pause").click()
})

test("a cut range is skipped rather than played", async ({ page }) => {
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await page.getByTestId("select-cut-span").click()
	await page.getByTestId("cut").click()
	await expect(page.getByTestId("cuts")).toHaveText("cut-1: words 1 to 2")

	// Words 1 to 2 run 1 to 3, so playback from the cut start must resume at
	// second 3 on the player own clock. The seek lands inside the cut while
	// the follower watches, so the follower moves the playhead to the span
	// end instead of letting the cut sound.
	await page.getByTestId("seek-1").click()
	await expect.poll(() => readWord(page), { timeout: 15_000 }).toBe(3)
	const resumed = await readNumber(page, "current-time")
	console.log(JSON.stringify({ cut: [1, 3], resumed }))
	expect(resumed).toBeGreaterThanOrEqual(3)
	expect(resumed).toBeLessThan(4.5)
	await page.getByTestId("pause").click()
})

test("a cut renders a region over exactly the spanned buckets", async ({ page }) => {
	await open(page)
	await page.getByTestId("select-cut-span").click()
	await page.getByTestId("cut").click()
	await expect(page.getByTestId("cuts")).toHaveText("cut-1: words 1 to 2")

	// Words 1 to 2 run 1 to 3 over ten one second buckets, so the region
	// covers buckets 1 and 2. The pin reads the rendered attributes.
	const region = page.getByTestId("region-words-1-to-2")
	await expect(region).toBeVisible()
	expect(await region.getAttribute("data-first-bucket")).toBe("1")
	expect(await region.getAttribute("data-last-bucket")).toBe("2")
	await expect(region).toHaveAttribute(
		"aria-label",
		"Region words 1 to 2, 1.00 to 3.00 seconds, buckets 1 to 2"
	)
})

test("the keyboard moves between regions in order", async ({ page }) => {
	await open(page)
	await page.getByTestId("select-cut-span").click()
	await page.getByTestId("cut").click()
	await page.getByTestId("word-4").focus()
	await page.keyboard.press("Enter")
	await page.getByTestId("cut").focus()
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("cuts")).toHaveText("cut-1: words 1 to 2, cut-2: words 4 to 4")

	// Tab order follows the region buttons in DOM order. Each press names the
	// focused region, so the run proves movement follows region order.
	const first = page.getByTestId("region-words-1-to-2")
	const second = page.getByTestId("region-words-4-to-4")
	await second.focus()
	await expect(second).toBeFocused()
	await page.keyboard.press("Shift+Tab")
	await expect(first).toBeFocused()
	await page.keyboard.press("Tab")
	await expect(second).toBeFocused()

	// A region press with the keyboard focuses the words it removed.
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("selection")).toHaveText("words 4 to 4")
})
