import { expect, test, type Page } from "@playwright/test"

/** Open the harness once it answers, so a drag never races hydration. */
async function open(page: Page): Promise<void> {
	await page.goto("/tests/timeline")
	await expect(page.getByTestId("hydrated")).toHaveText("ready")
}

/** Drag a handle by pixels. Fifty pixels is one second on the harness scale. */
async function drag(page: Page, id: string, dx: number): Promise<void> {
	const box = await page.getByTestId(id).boundingBox()
	if (!box) throw new Error(`the handle ${id} has no box`)
	const x = box.x + box.width / 2
	const y = box.y + box.height / 2
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + dx, y, { steps: 5 })
	await page.mouse.up()
}

test("a move handle drags by pointer and snaps to a target", async ({ page }) => {
	await open(page)
	await expect(page.getByTestId("segment")).toHaveText("1.00 to 3.00")

	// Fifty pixels is one second, so the start lands exactly on target 2.
	await drag(page, "handle-move", 50)
	await expect(page.getByTestId("segment")).toHaveText("2.00 to 4.00")
	await expect(page.getByTestId("snapped")).toHaveText("2.00")
	await expect(page.getByTestId("committed")).toHaveText("2.00 to 4.00")
})

test("an end handle drags by pointer and snaps to a target", async ({ page }) => {
	await open(page)

	// One hundred pixels is two seconds, so the end lands on target 5.
	await drag(page, "handle-end", 100)
	await expect(page.getByTestId("segment")).toHaveText("1.00 to 5.00")
	await expect(page.getByTestId("snapped")).toHaveText("5.00")
	await expect(page.getByTestId("committed")).toHaveText("1.00 to 5.00")
})

test("a drag stops at a neighbour instead of overlapping", async ({ page }) => {
	await open(page)

	// Two hundred pixels is four seconds toward the neighbour at 6 to 7.
	// The span keeps its length of two, so it rests at 4 to 6.
	await drag(page, "handle-move", 200)
	await expect(page.getByTestId("segment")).toHaveText("4.00 to 6.00")
	await expect(page.getByTestId("snapped")).toHaveText("none")
	await expect(page.getByTestId("committed")).toHaveText("4.00 to 6.00")
})

test("escape restores the start after a pointer drag", async ({ page }) => {
	await open(page)
	const box = await page.getByTestId("handle-move").boundingBox()
	if (!box) throw new Error("the move handle has no box")
	const x = box.x + box.width / 2
	const y = box.y + box.height / 2
	await page.mouse.move(x, y)
	await page.mouse.down()
	await page.mouse.move(x + 50, y, { steps: 5 })
	await expect(page.getByTestId("segment")).toHaveText("2.00 to 4.00")

	await page.keyboard.press("Escape")
	await page.mouse.up()
	await expect(page.getByTestId("segment")).toHaveText("1.00 to 3.00")
	await expect(page.getByTestId("cancelled")).toHaveText("1.00 to 3.00")
})

test("arrow keys nudge, shift steps coarse, and escape restores", async ({ page }) => {
	await open(page)
	await page.getByTestId("handle-move").focus()

	await page.keyboard.press("ArrowRight")
	await expect(page.getByTestId("segment")).toHaveText("1.10 to 3.10")
	await expect(page.getByTestId("committed")).toHaveText("1.10 to 3.10")

	// A coarse step of one second carries the start onto target 2.
	await page.keyboard.press("Shift+ArrowRight")
	await expect(page.getByTestId("segment")).toHaveText("2.00 to 4.00")
	await expect(page.getByTestId("snapped")).toHaveText("2.00")

	await page.keyboard.press("Escape")
	await expect(page.getByTestId("segment")).toHaveText("1.00 to 3.00")
	await expect(page.getByTestId("cancelled")).toHaveText("1.00 to 3.00")
})

test("alt steps fine and a resize keeps the minimum length", async ({ page }) => {
	await open(page)
	await page.getByTestId("handle-move").focus()
	await page.keyboard.press("Alt+ArrowRight")
	await expect(page.getByTestId("segment")).toHaveText("1.01 to 3.01")

	// Three coarse steps left would cross the start, so the end stops at
	// start plus the half second minimum.
	await page.getByTestId("handle-end").focus()
	await page.keyboard.press("Shift+ArrowLeft")
	await page.keyboard.press("Shift+ArrowLeft")
	await page.keyboard.press("Shift+ArrowLeft")
	await expect(page.getByTestId("segment")).toHaveText("1.01 to 1.51")
})

test("focus order follows the handles and each names its time", async ({ page }) => {
	await open(page)

	await page.keyboard.press("Tab")
	await expect(page.getByTestId("handle-start")).toBeFocused()
	await expect(page.getByTestId("handle-start")).toHaveAttribute("role", "separator")
	await expect(page.getByTestId("handle-start")).toHaveAttribute("aria-valuetext", "1.00 seconds")

	await page.keyboard.press("Tab")
	await expect(page.getByTestId("handle-move")).toBeFocused()
	await expect(page.getByTestId("handle-move")).toHaveAttribute("role", "slider")
	await expect(page.getByTestId("handle-move")).toHaveAttribute("aria-valuetext", "1.00 seconds")

	await page.keyboard.press("Tab")
	await expect(page.getByTestId("handle-end")).toBeFocused()
	await expect(page.getByTestId("handle-end")).toHaveAttribute("role", "separator")
	await expect(page.getByTestId("handle-end")).toHaveAttribute("aria-valuetext", "3.00 seconds")

	await page.keyboard.press("Shift+Tab")
	await expect(page.getByTestId("handle-move")).toBeFocused()
})

test("the docs page passes the accessibility and contrast gates", async ({ page }) => {
	await page.goto("/docs/timeline")
	await expect(page.getByTestId("zoom-in")).toBeEnabled()
	await page.getByTestId("run-gates").click()
	await expect(page.getByTestId("gates")).toHaveText("done", { timeout: 15_000 })
})
