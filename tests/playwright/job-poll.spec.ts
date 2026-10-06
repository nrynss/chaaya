import { expect, test, type Page } from "@playwright/test"

/** Hide the page the way a backgrounded tab hides. The helper overrides the
 * read-only visibility flag and sends the event the poller listens for. */
async function hide(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
		document.dispatchEvent(new Event("visibilitychange"))
	})
}

/** Return the page to visible and let the poller read at once. */
async function show(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
		document.dispatchEvent(new Event("visibilitychange"))
	})
}

/** Answer the poll route from a script. Each call takes the next entry, and
 * the last entry repeats, so the poll count alone decides the outcome. */
async function scriptRoute(page: Page, answers: { status: number; body: unknown }[]): Promise<void> {
	let calls = 0
	await page.route("**/tests/job-poll/state", async (route) => {
		const answer = answers[Math.min(calls, answers.length - 1)]
		calls += 1
		if (typeof answer === "undefined") throw new Error("the route ran out of answers")
		await route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) })
	})
}

function running(current: number): { status: number; body: unknown } {
	return { status: 200, body: { status: "running", current } }
}

function done(): { status: number; body: unknown } {
	return { status: 200, body: { status: "done", current: 4 } }
}

test("a route that fails twice then succeeds still completes", async ({ page }) => {
	await scriptRoute(page, [{ status: 500, body: {} }, { status: 500, body: {} }, running(2), running(3), done()])
	await page.goto("/tests/job-poll")
	await expect(page.getByTestId("hydrated")).toHaveText("ready")
	/* Two failures stay inside the default budget of three, so the watch
	 * keeps polling and ends on the terminal reading. */
	await expect(page.getByTestId("status")).toHaveText("done")
	await expect(page.getByTestId("connection")).toHaveText("closed")
	await expect(page.getByTestId("polls")).toHaveText("5")
	await expect(page.getByTestId("error")).toHaveText("")
})

test("hiding the page stops requests, read from the browser request log", async ({ page }) => {
	/* Every reading changes, so the interval stays at its 500 ms base and
	 * several polls would fire in two seconds without the pause. */
	const answers = Array.from({ length: 60 }, (_, index) => running(index + 1))
	await scriptRoute(page, answers)
	const seen: string[] = []
	page.on("request", (request) => {
		if (request.url().includes("/tests/job-poll/state")) seen.push(request.url())
	})
	await page.goto("/tests/job-poll")
	await expect(page.getByTestId("hydrated")).toHaveText("ready")
	await expect.poll(() => seen.length).toBeGreaterThan(2)
	await hide(page)
	await expect(page.getByTestId("connection")).toHaveText("paused")
	/* The interval would have fired several polls in two seconds. None may
	 * go out while paused, so the count stays exactly where it was. */
	const frozen = seen.length
	await page.waitForTimeout(2000)
	expect(seen.length).toBe(frozen)
	await show(page)
	await expect.poll(() => seen.length).toBeGreaterThan(frozen)
	await expect(page.getByTestId("connection")).toHaveText("live")
})
