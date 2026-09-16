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
	stateCalls: number
	stateBeforeOpen: number
	stateServed: number
	pushed: number
	aborted: boolean
	open: boolean
	errors: string[]
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

/** Log every request the browser failed for one fixture's stream. The log is
 * the browser's own record, not the client's state. */
function watchStream(page: Page, server: FixtureServer): string[] {
	const failed: string[] = []
	page.on("requestfailed", (request) => {
		if (!request.url().startsWith(`${server.url}/events`)) return
		failed.push(`${request.url()} ${request.failure()?.errorText ?? ""}`)
	})
	return failed
}

test("a terminal that arrives before the state read shows once", async ({ page }) => {
	const server = await startServer("terminal-first")
	try {
		await open(page, server)
		await expect(page.getByTestId("status")).toHaveText("done")
		await expect(page.getByTestId("events")).toHaveText("done")
		await expect(page.getByTestId("connection")).toHaveText("closed")
		/* The fixture answers the read only after the page closed the stream,
		 * so the terminal was first. The class keeps the terminal, so the
		 * stale answer never lands on the page. */
		await expect(page.getByTestId("read-settled")).toHaveText("running:done")
		await expect(page.getByTestId("stage")).toHaveText("")
		const log = await server.log()
		expect(log.stateCalls).toBe(1)
		expect(log.stateServed).toBe(1)
		expect(log.errors).toEqual([])
	} finally {
		await server.stop()
	}
})

test("a reconnect mid-job resumes from the state read", async ({ page }) => {
	const server = await startServer("drop")
	try {
		await open(page, server)
		/* The first stream ends after one frame, so the class reconnects. */
		await expect(page.getByTestId("reconnects")).toHaveText("1")
		await expect(page.getByTestId("connection")).toHaveText("live")
		await expect.poll(async () => (await server.log()).connections).toBe(2)
		/* The state read of the second connection reports the work the job did
		 * while the stream was away. */
		await expect(page.getByTestId("status")).toHaveText("running")
		await expect(page.getByTestId("stage")).toHaveText("uploading")
		await expect(page.getByTestId("current")).toHaveText("9")
		await expect(page.getByTestId("total")).toHaveText("12")
		/* The second stream replays the frame the first one sent, and a repeat
		 * never lands twice. */
		await expect(page.getByTestId("events")).toHaveText("progress")
		await expect(page.getByTestId("frames")).toHaveText("1")
		/* The job continues after the reconnect and ends exactly once. */
		await server.push("event-done.txt")
		await expect(page.getByTestId("status")).toHaveText("done")
		await expect(page.getByTestId("events")).toHaveText("progress,done")
		await expect(page.getByTestId("connection")).toHaveText("closed")
	} finally {
		await server.stop()
	}
})

test("leaving the page closes the connection", async ({ page }) => {
	const server = await startServer("hold")
	try {
		const failed = watchStream(page, server)
		await open(page, server)
		await expect(page.getByTestId("connection")).toHaveText("live")
		await page.getByTestId("leave").click()
		await expect(page).toHaveURL("/")
		/* The browser failed the stream it was reading. */
		await expect.poll(() => failed.length).toBeGreaterThan(0)
		/* The fixture sees the same close from its own side. */
		await expect.poll(async () => (await server.log()).aborted).toBe(true)
	} finally {
		await server.stop()
	}
})

test("the state read waits for the stream to open", async ({ page }) => {
	const server = await startServer("gate")
	try {
		await open(page, server)
		await expect(page.getByTestId("read-settled")).toHaveText("running:running")
		await expect(page.getByTestId("status")).toHaveText("running")
		await expect(page.getByTestId("stage")).toHaveText("transcoding")
		await expect(page.getByTestId("error")).toHaveText("")
		/* The fixture refuses a state read until a stream opens, so a read
		 * that ran early would have answered 409. */
		const log = await server.log()
		expect(log.stateBeforeOpen).toBe(0)
		expect(log.stateCalls).toBe(1)
	} finally {
		await server.stop()
	}
})
