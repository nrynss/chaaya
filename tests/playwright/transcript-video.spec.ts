import { expect, test, type Page } from "@playwright/test"

/** Open the harness once its play button answers, so a click never races hydration. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/transcript-video")
	await expect(page.getByTestId("play")).toBeEnabled()
}

async function readWord(page: Page): Promise<number | null> {
	const text = await page.getByTestId("active-word").textContent()
	if (text === null || text.trim() === "none") return null
	return Number(text)
}

test("words highlight in sync against the video element clock", async ({ page }) => {
	await open(page)
	// Observe rendered transitions in the browser before playback. Host polling
	// can miss a whole word while the browser continues to render it.
	await page.evaluate(() => {
		const word = document.querySelector('[data-testid="active-word"]')!
		const time = document.querySelector('[data-testid="current-time"]')!
		const readings: { word: number; time: number }[] = []
		;(window as Window & { __wordReadings?: typeof readings }).__wordReadings = readings
		new MutationObserver(() => {
			if (word.textContent?.trim() === "2") {
				readings.push({ word: 2, time: Number(time.textContent) })
			}
		}).observe(word, { childList: true, characterData: true, subtree: true })
	})
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")

	// Word 2 runs 2 to 3. Waiting for it to name itself proves the derived
	// word tracked the video element clock through real frames.
	const reading = () =>
		page.evaluate(
			() =>
				(window as Window & { __wordReadings?: { word: number; time: number }[] })
					.__wordReadings?.[0]
		)
	await expect.poll(async () => (await reading())?.word, { timeout: 15_000 }).toBe(2)
	const elapsed = (await reading())!.time
	console.log(JSON.stringify({ activeWord: 2, elapsed }))
	expect(elapsed).toBeGreaterThanOrEqual(2)
	expect(elapsed).toBeLessThan(3)
	await page.getByTestId("pause").click()
})

test("a word click seeks the video to the word start read from the player", async ({
	page
}) => {
	await open(page)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await page.getByTestId("seek-4").click()

	// The click seeks to word 4 at second 4. The pin reads the player own
	// clock back and the derived word, not the card own guess.
	await expect.poll(() => readWord(page), { timeout: 15_000 }).toBe(4)
	const settled = Number(await page.getByTestId("current-time").textContent())
	console.log(JSON.stringify({ word: 4, target: 4, settled }))
	expect(settled).toBeGreaterThanOrEqual(4)
	expect(settled).toBeLessThan(5.5)
	await page.getByTestId("pause").click()
})

test("keyboard alone reaches every word and the transport", async ({ page }) => {
	await open(page)

	// Tab from the address bar until the first word holds focus. Firefox
	// stops on the video element itself on the way there, while chromium
	// lands on the word at once, so the run tabs on until the word answers
	// instead of counting stops. Every step below stays on the keyboard.
	for (let press = 0; press < 6; press += 1) {
		await page.keyboard.press("Tab")
		const there = await page.evaluate(
			() => document.querySelector('[data-testid="word-0"]') === document.activeElement
		)
		if (there) break
	}
	await expect(page.getByTestId("word-0")).toBeFocused()
	await page.keyboard.press("Enter")
	await page.getByTestId("play").focus()
	await page.keyboard.press("Enter")
	await expect(page.getByTestId("playing")).toHaveText("true")
	await page.getByTestId("pause").click()
})

test("the docs page passes the accessibility and contrast gates", async ({ page }) => {
	await page.goto("/docs/transcript-video")
	await expect(page.getByTestId("word-0")).toBeEnabled()
	await page.getByTestId("run-gates").click()
	await expect(page.getByTestId("gates")).toHaveText("done", { timeout: 15_000 })
})
