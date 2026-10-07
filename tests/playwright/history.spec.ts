import { expect, test } from "@playwright/test"

test.describe("history", () => {
	test("a successful commit advances the revision", async ({ page }) => {
		await page.goto("/tests/history")
		await expect(page.getByTestId("doc")).toHaveText("")
		await page.getByTestId("append").click()
		await expect(page.getByTestId("doc")).toHaveText("A")
		await expect(page.getByTestId("synced")).toHaveText("no")
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("revision")).toHaveText("1")
		await expect(page.getByTestId("status")).toHaveText("idle")
		await expect(page.getByTestId("synced")).toHaveText("yes")
	})

	test("a conflict rolls back on screen and a rebase replays the edits", async ({ page }) => {
		await page.goto("/tests/history")
		await page.getByTestId("append").click()
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("revision")).toHaveText("1")

		// A second client moves the server head forward.
		await page.getByTestId("remote").click()
		await page.getByTestId("append").click()
		await expect(page.getByTestId("doc")).toHaveText("AB")

		// The stale base refuses, and the screen rolls back to the last ack.
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("status")).toHaveText("conflict")
		await expect(page.getByTestId("head")).toHaveText("REMOTE")
		await expect(page.getByTestId("doc")).toHaveText("A")

		// Rebase replays the local edits onto the head, then commits them.
		await page.getByTestId("rebase").click()
		await expect(page.getByTestId("doc")).toHaveText("REMOTEB")
		await expect(page.getByTestId("revision")).toHaveText("2")
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("revision")).toHaveText("3")
		await expect(page.getByTestId("synced")).toHaveText("yes")
		await expect(page.getByTestId("doc")).toHaveText("REMOTEB")
	})

	test("a network failure keeps local edits and a retry lands them", async ({ page }) => {
		await page.goto("/tests/history")
		await page.getByTestId("append").click()
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("revision")).toHaveText("1")

		await page.getByTestId("mode-fail").click()
		await page.getByTestId("append").click()
		await expect(page.getByTestId("doc")).toHaveText("AB")
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("status")).toHaveText("error")
		await expect(page.getByTestId("failure")).not.toHaveText("")
		// Nothing refused the edit, so the screen keeps it.
		await expect(page.getByTestId("doc")).toHaveText("AB")
		await expect(page.getByTestId("revision")).toHaveText("1")

		await page.getByTestId("mode-ok").click()
		await page.getByTestId("flush").click()
		await expect(page.getByTestId("revision")).toHaveText("2")
		await expect(page.getByTestId("synced")).toHaveText("yes")
		await expect(page.getByTestId("doc")).toHaveText("AB")
	})

	test("the docs demo walks undo, redo, and proposals", async ({ page }) => {
		await page.goto("/docs/history")
		await expect(page.getByTestId("hydrated")).toHaveText("ready")
		await expect(page.getByTestId("demo-doc")).toHaveText("a")
		await page.getByTestId("demo-append").click()
		await expect(page.getByTestId("demo-doc")).toHaveText("ab")
		await page.getByTestId("demo-undo").click()
		await expect(page.getByTestId("demo-doc")).toHaveText("a")
		await expect(page.getByTestId("demo-can-redo")).toHaveText("yes")
		await page.getByTestId("demo-redo").click()
		await expect(page.getByTestId("demo-doc")).toHaveText("ab")
		await page.getByTestId("demo-propose").click()
		await expect(page.getByTestId("demo-proposals")).toHaveText("suggest c")
		await expect(page.getByTestId("demo-doc")).toHaveText("ab")
		await page.getByTestId("demo-accept").click()
		await expect(page.getByTestId("demo-doc")).toHaveText("abc")
		await expect(page.getByTestId("demo-past")).toHaveText("type b, suggest c")
	})
})
