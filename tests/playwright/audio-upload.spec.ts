import { expect, test, type Page } from "@playwright/test"
import { spawn, type ChildProcess } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { markerOnsetsSeconds, readMarkers } from "./support/audio"

/** The fixture server, resolved from this file so the spec runs from any
 * directory. */
const serverPath = fileURLToPath(new URL("../fixtures/upload-server.mjs", import.meta.url))

/** The chunk size the harness uploads with. A small chunk keeps several
 * chunks inside one short take. */
const CHUNK_BYTES = 4096

/** The owner the harness uploads under. */
const OWNER = "harness-owner"

/** The marker interval the generated signal uses, in seconds. */
const MARKER_INTERVAL_SECONDS = 0.1

/** How far a marker may drift from its declared slot. The reader averages over
 * five millisecond windows, so a slot boundary can land on either side. */
const MARKER_TOLERANCE_SECONDS = 0.02

/** What the fixture recorded about the client. */
interface FixtureLog {
	opens: { id: string; owner: string; contentType: string; visibility: string; chunkSize: number }[]
	reads: number
	completes: number
	/** The write count for each chunk index, keyed by the index as a string. */
	writes: Record<string, number>
	refusals: { status: number; code: string }[]
	errors: string[]
}

/** What the fixture holds for one upload. */
interface FixtureState {
	id: string
	stored_bytes: number
	received: number[]
	missing: number[]
}

/** What the fixture assembled for one upload. */
interface FixtureBytes {
	id: string
	size: number
	sha256: string
	chunk_size: number
	received: number[]
	base64: string
}

/** One running fixture server. */
interface FixtureServer {
	/** The collection path the harness uploads to. */
	url: string
	/** Hold one chunk index back, so its writes answer with a retryable
	 * shortage until the release. The hold is the fixture's own control and
	 * stays out of the refusal log. */
	hold(index: number): Promise<void>
	/** Release every held chunk, so its writes arrive again. */
	release(): Promise<void>
	/** Read the fixture's own record of the client. */
	log(): Promise<FixtureLog>
	/** Read what the fixture holds for one upload. */
	state(id: string): Promise<FixtureState>
	/** Read the bytes the fixture assembled, and their digest. */
	bytes(id: string): Promise<FixtureBytes>
	/** Stop the fixture. */
	stop(): Promise<void>
}

/** Start a fixture server on a free port and wait for the port it prints. */
async function startServer(): Promise<FixtureServer> {
	const child: ChildProcess = spawn("node", [serverPath, "--port", "0"], {
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
	const root = `http://127.0.0.1:${port}`
	return {
		url: `${root}/uploads`,
		async hold(index: number) {
			await fetch(`${root}/__hold`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ index })
			})
		},
		async release() {
			await fetch(`${root}/__release`, { method: "POST" })
		},
		async log() {
			return (await (await fetch(`${root}/log`)).json()) as FixtureLog
		},
		async state(id) {
			return (await (await fetch(`${root}/uploads/${id}`)).json()) as FixtureState
		},
		async bytes(id) {
			return (await (await fetch(`${root}/uploads/${id}/bytes`)).json()) as FixtureBytes
		},
		async stop() {
			if (child.exitCode !== null || child.signalCode !== null) return
			child.kill()
			await once(child, "exit")
		}
	}
}

/** Open the harness on one fixture once its button answers a click. */
async function open(page: Page, server: FixtureServer): Promise<void> {
	await page.goto(`/tests/audio-upload?upload=${encodeURIComponent(server.url)}`)
	await expect(page.getByTestId("record")).toBeEnabled()
}

/** Read one number the page reports. */
async function count(page: Page, testId: string): Promise<number> {
	return Number(await page.getByTestId(testId).textContent())
}

/** Read one text the page reports. */
async function text(page: Page, testId: string): Promise<string> {
	return (await page.getByTestId(testId).textContent()) ?? ""
}

/** Read the take the page recorded, as the base64 it exposed. */
async function recorded(page: Page): Promise<Buffer> {
	const base64 = await page.evaluate(
		() => (window as Window & { __recorded?: string }).__recorded ?? ""
	)
	return Buffer.from(base64, "base64")
}

/** The lowercase hex SHA-256 of one buffer. */
function digestOf(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex")
}

/* Skip WebKit on Linux. Its headless build defines no MediaRecorder, so the
 * take records nothing and no upload starts. Both cases would fail there for
 * an engine reason, not an upload defect. The support module's coverage table
 * records this skip, and the reason travels with it. */
test.skip(({ browserName }) => browserName === "webkit", "WebKitGTK headless defines no MediaRecorder, so the take records nothing and no upload starts.")

test("a take streams in chunks through a brief network drop and arrives whole", async ({
	page,
	context
}, testInfo) => {
	test.setTimeout(90_000)
	const server = await startServer()
	try {
		await open(page, server)
		await page.getByTestId("record").click()
		/* The first acknowledged chunk proves the stream started before the
		 * network goes away. */
		await expect(page.getByTestId("acknowledged")).not.toHaveText("0")
		const capturedBeforeDrop = await count(page, "captured")

		await context.setOffline(true)
		/* A retry means the client felt the drop and is trying again. */
		await expect(page.getByTestId("retries")).not.toHaveText("0")
		/* The capture keeps producing while the network is down, so the blocks
		 * produced inside the drop wait for it to end. */
		await expect.poll(() => count(page, "captured"), { timeout: 15_000 }).toBeGreaterThan(
			capturedBeforeDrop
		)
		await context.setOffline(false)

		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 60_000 })
		expect(await text(page, "failure")).toBe("")
		expect(await count(page, "pending")).toBe(0)
		expect(await count(page, "retries")).toBeGreaterThan(0)

		const id = await text(page, "id")
		const assembled = await server.bytes(id)
		const log = await server.log()
		const recordedBytes = await recorded(page)
		writeFileSync(testInfo.outputPath("assembled.webm"), Buffer.from(assembled.base64, "base64"))

		console.log(
			JSON.stringify({
				opens: log.opens,
				reads: log.reads,
				completes: log.completes,
				writes: log.writes,
				refusals: log.refusals,
				retries: await count(page, "retries"),
				captured: await count(page, "captured"),
				recorded: recordedBytes.length,
				size: assembled.size,
				chunks: assembled.received
			})
		)

		/* The fixture refuses a chunk whose declared digest misses its bytes, a
		 * chunk past the allowed index and an early completion. No refusal
		 * means every chunk matched, and the completion waited for all of them. */
		expect(log.errors).toEqual([])
		expect(log.refusals).toEqual([])
		expect(log.opens).toHaveLength(1)
		expect(log.opens[0].owner).toBe(OWNER)
		expect(log.opens[0].chunkSize).toBe(CHUNK_BYTES)
		expect(log.completes).toBe(1)

		/* The bytes the page recorded and the bytes the fixture assembled are
		 * the same take, chunk for chunk and marker for marker. */
		expect(assembled.size).toBe(recordedBytes.length)
		expect(assembled.sha256).toBe(digestOf(recordedBytes))
		expect(assembled.received.length).toBeGreaterThan(1)
		expect(assembled.received).toEqual(assembled.received.map((_, index) => index))
		expect(assembled.size).toBeGreaterThan(CHUNK_BYTES)
		expect(await count(page, "captured")).toBe(recordedBytes.length)
		expect(await text(page, "receipt")).toBe(assembled.sha256)

		const reading = readMarkers(testInfo.outputPath("assembled.webm"))
		console.log(JSON.stringify({ reading }))
		expect(reading.count).toBe(markerOnsetsSeconds().length)
		expect(reading.order).toBe("ascending")
		for (const spacing of reading.spacingsSeconds) {
			const off = Number(Math.abs(spacing - MARKER_INTERVAL_SECONDS).toFixed(6))
			expect(off).toBeLessThanOrEqual(MARKER_TOLERANCE_SECONDS)
		}
	} finally {
		await server.stop()
	}
})

test("a reloaded page finishes the upload it left behind", async ({ page }) => {
	test.setTimeout(90_000)
	const server = await startServer()
	try {
		/* The fixture holds chunk one back from the start, so the original
		 * page can never send it, however the load schedules its retries.
		 * The old shape cut the network and restored it before the reload,
		 * and a loaded host let the original page's own retry flush the
		 * held chunk out, which is correct client behaviour that broke the
		 * record's bookkeeping. A hold the fixture owns removes the race:
		 * the chunk arrives exactly once, from the page that finishes the
		 * upload. */
		await server.hold(1)
		await open(page, server)
		await page.getByTestId("record").click()
		await expect(page.getByTestId("acknowledged")).not.toHaveText("0")
		await expect(page.getByTestId("retries")).not.toHaveText("0")
		const id = await text(page, "id")
		const held = await server.state(id)
		const beforeReload = await server.log()

		/* The held chunk never arrived, so the take cannot be done, and the
		 * chunks before it did. */
		expect(held.received).not.toContain(1)
		expect(held.received.length).toBeGreaterThan(0)
		expect(await text(page, "phase")).not.toBe("done")

		await page.reload()
		/* The resumed page finds every stored chunk in its own session, so
		 * it sends only what the fixture lacks, and chunk one is the first
		 * of those. The release lands inside its retry budget, so the hold
		 * orders the sends without deciding the outcome. */
		await server.release()
		await expect(page.getByTestId("phase")).toHaveText("done", { timeout: 60_000 })
		expect(await text(page, "failure")).toBe("")
		expect(await text(page, "resumed")).toBe("yes")
		expect(await text(page, "id")).toBe(id)

		const assembled = await server.bytes(id)
		const afterReload = await server.log()
		console.log(
			JSON.stringify({
				held: held.received,
				heldBytes: held.stored_bytes,
				received: assembled.received,
				size: assembled.size,
				writesBefore: beforeReload.writes,
				writesAfter: afterReload.writes,
				completes: afterReload.completes,
				refusals: afterReload.refusals
			})
		)

		expect(afterReload.errors).toEqual([])
		expect(afterReload.refusals).toEqual([])
		expect(afterReload.completes).toBe(1)

		/* The chunks the fixture held before the reload left exactly the
		 * writes they had, and the resumed page sent the held chunk once. */
		for (const index of held.received) {
			expect(afterReload.writes[String(index)]).toBe(beforeReload.writes[String(index)])
		}
		expect(afterReload.writes["1"]).toBe(1)
		expect(assembled.received.length).toBeGreaterThan(held.received.length)
		expect(assembled.size).toBeGreaterThan(held.stored_bytes)
		/* Nothing appended a tail after the reload, so every stored chunk is a
		 * full chunk and the whole upload lines up with its own digest. */
		expect(assembled.size % CHUNK_BYTES).toBe(0)
		expect(assembled.received).toEqual(assembled.received.map((_, index) => index))
		expect(assembled.size).toBe(assembled.received.length * CHUNK_BYTES)
		expect(digestOf(Buffer.from(assembled.base64, "base64"))).toBe(assembled.sha256)
		expect(await text(page, "receipt")).toBe(assembled.sha256)
	} finally {
		await server.stop()
	}
})
