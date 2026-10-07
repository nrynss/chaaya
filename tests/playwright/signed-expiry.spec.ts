import { expect, test, type Page } from "@playwright/test"

/** The seek target sits far from the head of the tone, outside every
 * engine's read ahead window. */
const SEEK_SECONDS = 50

/** Log every signed media request with its range and every signed answer
 * with its status, so the run shows which URL each range went to. */
function watchTraffic(page: Page): string[] {
	const traffic: string[] = []
	page.on("request", (request) => {
		if (!request.url().includes("/tests/signed/")) return
		traffic.push(`-> ${request.method()} ${request.url()} range=${request.headers()["range"] ?? ""}`)
	})
	page.on("response", (response) => {
		if (!response.url().includes("/tests/signed/")) return
		traffic.push(`<- ${response.status()} ${response.url()}`)
	})
	return traffic
}

async function readNumber(page: Page, id: string): Promise<number> {
	return Number(await page.getByTestId(id).textContent())
}

/** Open the harness once its buttons answer. Play the run's entry source
 * and expire every signed URL the entry minted. The test route drives
 * expiry, never a sleep. The run id isolates the token, so parallel
 * checks never share an expiry. */
async function playThenExpire(page: Page, run: string): Promise<void> {
	await page.goto("/tests/signed")
	await expect(page.getByTestId("play")).toBeEnabled()
	await page.getByTestId("source").fill(`/tests/signed/entry?run=${run}`)
	await page.getByTestId("play").click()
	await expect(page.getByTestId("playing")).toHaveText("true")
	await expect.poll(() => readNumber(page, "current-time")).toBeGreaterThan(1)
	const rotated = await page.request.post("/tests/signed/rotate", { data: { run } })
	expect(rotated.ok()).toBe(true)
	await page.getByTestId("pause").click()
	await expect(page.getByTestId("playing")).toHaveText("false")
}

test("a seek past expiry recovers at the same position in every engine", async ({
	page
}, testInfo) => {
	const traffic = watchTraffic(page)
	await playThenExpire(page, `recover-${testInfo.project.name}`)
	await page.getByTestId("recover").click()

	await page.getByTestId("seek-target").fill(String(SEEK_SECONDS))
	await page.getByTestId("seek").click()

	// The seek echoes its target at once. An engine that buffered the
	// whole file ahead never fetches again. Neither the position nor the
	// request log proves the resume on its own. Playing from the target
	// does: the clock must advance past it with no failure. On chromium the
	// seek refuses the expired redirect, recovery swaps in a fresh
	// signature, and play continues from the restored position. An engine
	// that reasks the entry route plays on without the player.
	await page.getByTestId("play").click()
	await expect
		.poll(() => readNumber(page, "current-time"), { timeout: 15_000 })
		.toBeGreaterThan(SEEK_SECONDS)
	const settled = await readNumber(page, "current-time")
	const recoveries = await readNumber(page, "recoveries")
	const signed = traffic.filter((entry) => entry.includes("/tests/signed/media"))
	console.log(JSON.stringify({ project: testInfo.project.name, settled, recoveries, signed }))

	expect(settled).toBeLessThan(SEEK_SECONDS + 5)
	expect(await page.getByTestId("failure").textContent()).toBe("none")
	// Chromium reuses the expired redirect, so recovery must run there. An
	// engine that reasks the entry route recovers without the player.
	if (testInfo.project.name === "chromium") expect(recoveries).toBeGreaterThanOrEqual(1)
})

test("without recovery an expired signature fails the seek on chromium", async ({
	page
}, testInfo) => {
	// Measured 2026-10-07: chromium reuses the redirected URL for the new
	// range and answers 403, while firefox reasks the entry route and plays
	// on. WebKit never got measured on this host, so only chromium pins the
	// failure here and every engine pins the recovery above.
	test.skip(
		testInfo.project.name !== "chromium",
		"only chromium is known to reuse the expired redirect, so only it pins the unrecovered failure"
	)
	const traffic = watchTraffic(page)
	await playThenExpire(page, `plain-${testInfo.project.name}`)

	await page.getByTestId("seek-target").fill(String(SEEK_SECONDS))
	await page.getByTestId("seek").click()

	await expect(page.getByTestId("failure")).toHaveText("network", { timeout: 15_000 })
	const signed = traffic.filter((entry) => entry.includes("/tests/signed/media"))
	console.log(JSON.stringify({ project: testInfo.project.name, signed }))
	expect(signed.some((entry) => entry.startsWith("<- 403"))).toBe(true)
})

test("a refusing resolver spends its budget and reports a network failure", async ({
	page
}, testInfo) => {
	const traffic = watchTraffic(page)
	await page.goto("/tests/signed")
	await expect(page.getByTestId("play")).toBeEnabled()
	await page.getByTestId("refuse").click()
	await page.getByTestId("source").fill("/tests/signed/media?token=expired&run=refuse")
	await page.getByTestId("play").click()

	// The source carries an expired signature with a budget of one, and the
	// resolver answers the same expired shape. The spent budget publishes
	// through the existing network failure shape, and no further recovery
	// runs. The expired URL fails on load in every engine, so no seek or
	// engine quirk enters the pin.
	await expect(page.getByTestId("failure")).toHaveText("network", { timeout: 15_000 })
	const recoveries = await readNumber(page, "recoveries")
	const refused = traffic.filter((entry) => entry.includes("token=expired"))
	console.log(JSON.stringify({ project: testInfo.project.name, recoveries, refused }))
	expect(recoveries).toBe(1)
	expect(refused.length).toBeGreaterThan(0)
})
