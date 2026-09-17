import { expect, test, type APIRequestContext } from "@playwright/test";

/** Read the close count the app server logged. */
async function closes(request: APIRequestContext, base: string): Promise<number> {
	const response = await request.get(`${base}/docs/session-guard/close`);
	return ((await response.json()) as { closes: number }).closes;
}

/** Reset the count, so this run starts from zero. */
async function reset(request: APIRequestContext, base: string): Promise<void> {
	await request.delete(`${base}/docs/session-guard/close`);
}

test("hiding and unloading a guarded page sends exactly one close", async ({ page, request, baseURL }) => {
	const base = baseURL ?? "http://127.0.0.1:4173";
	await reset(request, base);
	const target = `${base}/docs/session-guard/close`;
	await page.goto(`/tests/session-guard?close=${encodeURIComponent(target)}`);
	await expect(page.getByTestId("attached")).toHaveText("yes");
	expect(await closes(request, base)).toBe(0);

	/* Hiding the page fires pagehide, which sends the close first. */
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
	await expect.poll(() => closes(request, base)).toBe(1);

	/* Leaving through the harness calls destroy, which must not send again. */
	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await closes(request, base)).toBe(1);

	/* A second run on a fresh page closes its own session exactly once. */
	await reset(request, base);
	await page.goto(`/tests/session-guard?close=${encodeURIComponent(target)}`);
	await expect(page.getByTestId("attached")).toHaveText("yes");
	await page.getByTestId("close-twice").click();
	await expect.poll(() => closes(request, base)).toBe(1);
	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await closes(request, base)).toBe(1);
});
