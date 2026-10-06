import { expect, test, type Page } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"

/** The fixture server, resolved from this file so the spec runs from any
 * directory. */
const serverPath = fileURLToPath(new URL("../fixtures/sse-server.mjs", import.meta.url))

/** What the fixture server recorded about the client. */
interface FixtureLog {
	connections: number
	aborted: boolean
	open: boolean
	errors: string[]
	lastEventIds: (string | null)[]
}

/** One running fixture server. */
interface FixtureServer {
	/** The address the harness page follows. */
	url: string
	/** Read the fixture's own record of the client. */
	log(): Promise<FixtureLog>
	/** Write one wire fixture frame to the open stream. */
	push(frameName: string): Promise<void>
	/** Stop the fixture. */
	stop(): Promise<void>
}

/** Start a fixture server on a free port and wait for the port it prints. */
async function startServer(scenario: string): Promise<FixtureServer> {
	const child: ChildProcess = spawn("node", [serverPath, "--scenario", scenario, "--port", "0"], {
		stdio: ["ignore", "pipe", "ignore"]
	})
	const port = await new Promise<number>((resolve, reject) => {
		let printed = ""
		child.stdout?.setEncoding("utf8")
		child.stdout?.on("data", (chunk: string) => {
			printed += chunk
			const match = /\{"port":(\d+)\}/.exec(printed)
			if (match) resolve(Number(match[1]))
		})
		child.on("error", reject)
		child.on("exit", (code) => reject(new Error(`the fixture server exited with ${String(code)}`)))
	})
	const url = `http://127.0.0.1:${port}`
	return {
		url,
		async log() {
			return (await (await fetch(`${url}/log`)).json()) as FixtureLog
		},
		async push(frameName) {
			const response = await fetch(`${url}/push?frame=${frameName}`)
			if (!response.ok) throw new Error(`the fixture refused the frame ${frameName}`)
		},
		async stop() {
			if (child.exitCode !== null || child.signalCode !== null) return
			child.kill()
			await once(child, "exit")
		}
	}
}

/** Open the harness on one fixture server once its button answers a click. */
async function open(page: Page, server: FixtureServer): Promise<void> {
	await page.goto(`/tests/job?stream=${encodeURIComponent(server.url)}`)
	await expect(page.getByTestId("leave")).toBeEnabled()
}

/** Hide the page the way a backgrounded tab hides. The helper overrides the
 * read-only visibility flag and sends the event the loop listens for. */
async function hide(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
		document.dispatchEvent(new Event("visibilitychange"))
	})
}

/** Return the page to visible and let the loop resume. */
async function show(page: Page): Promise<void> {
	await page.evaluate(() => {
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
		document.dispatchEvent(new Event("visibilitychange"))
	})
}

test("a hidden page pauses and replays the missed frames on return", async ({ page }) => {
	const server = await startServer("pause-replay")
	try {
		await open(page, server)
		await expect(page.getByTestId("connection")).toHaveText("live")
		await expect(page.getByTestId("status")).toHaveText("running")
		await hide(page)
		await expect(page.getByTestId("connection")).toHaveText("paused")
		/* The page aborted its stream, so the frames below reach a closed
		 * response and are lost. The server still finishes the job. */
		await expect.poll(async () => (await server.log()).aborted).toBe(true)
		await server.push("event-progress.txt")
		await server.push("event-done.txt")
		await show(page)
		/* The resume opens one fresh stream with the last kept id, and the
		 * server replays the job to its end on that stream. */
		await expect(page.getByTestId("status")).toHaveText("done")
		await expect(page.getByTestId("connection")).toHaveText("closed")
		await expect(page.getByTestId("events")).toHaveText("progress,done")
		const log = await server.log()
		expect(log.connections).toBe(2)
		expect(log.lastEventIds).toContain("3")
		expect(log.errors).toEqual([])
	} finally {
		await server.stop()
	}
})
