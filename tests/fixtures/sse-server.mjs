/**
 * A job fixture for the browser tests. It replays the wire module's fixture
 * frames over one event stream and answers one state read per connection, so a
 * test can drive a job client through a terminal, a drop and a late open.
 *
 * Run it with `node tests/fixtures/sse-server.mjs --scenario <name>`. It
 * prints one JSON line with its port as soon as it listens. A spec starts one
 * server per test and reads /log for what the client asked it.
 *
 * Routes. `/events` is the stream, `/state` is the job's state, `/push?frame=`
 * writes one fixture frame to the open stream, and `/log` reports what
 * happened.
 */
import { readFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/** The job every fixture frame reports on. */
const jobId = "3f9a1c7e5b2d8046a1c3e5f7092b4d68"

/** The directory holding the wire module's fixture frames. */
const frameDirectory = fileURLToPath(new URL("../../src/lib/adapters/keel/wire/fixtures/", import.meta.url))

/** Read one fixture frame from its file name. */
function frame(name) {
	return readFileSync(join(frameDirectory, name), "utf8")
}

/** The state of a job that is running, in the shape a state read returns. */
function running(stage, current) {
	return { jobId, status: "running", stage, current, total: 12 }
}

/**
 * The scenarios. A plan is a list of steps the stream plays in order, and it
 * may depend on which connection it is.
 * `stateNeedsOpen` refuses a state read until the stream wrote its headers.
 * `stateAfterClose` answers a state read only once the client closed its
 * stream, so the terminal is provably first.
 */
const scenarios = {
	hold: {
		/* One heartbeat carries the stream open. A response with no body byte
		 * leaves some engines waiting on the headers. */
		plan: [{ op: "frame", name: "event-heartbeat.txt" }],
		state: () => running("transcoding", 4)
	},
	"terminal-first": {
		plan: [{ op: "frame", name: "event-done.txt" }],
		stateAfterClose: true,
		state: () => running("transcoding", 4)
	},
	drop: {
		plan: (connection) =>
			connection === 1
				? [{ op: "frame", name: "event-progress.txt" }, { op: "end" }]
				: [{ op: "frame", name: "event-progress.txt" }],
		state: (calls) => (calls === 1 ? running("transcoding", 4) : running("uploading", 9))
	},
	gate: {
		stateNeedsOpen: true,
		plan: [{ op: "frame", name: "event-progress.txt" }],
		state: () => running("transcoding", 4)
	}
}

const args = process.argv.slice(2)

/** Read one command line argument. */
function argument(name, fallback) {
	const at = args.indexOf(`--${name}`)
	return at === -1 ? fallback : args[at + 1]
}

const scenarioName = argument("scenario", "hold")
const scenario = scenarios[scenarioName]
if (scenario === undefined) {
	process.stderr.write(`the scenario ${scenarioName} does not exist\n`)
	process.exit(1)
}

/** What the client asked this fixture, for a spec to read back. */
const log = {
	connections: 0,
	stateCalls: 0,
	stateBeforeOpen: 0,
	stateServed: 0,
	pushed: 0,
	aborted: false,
	open: false,
	errors: []
}

/** The readers waiting for the client to close a stream. */
const closers = []

/** Record that the client closed a stream and wake every reader. */
function noteClose() {
	log.aborted = true
	for (const resolve of closers.splice(0)) resolve()
}

/** Wait for the client to close a stream, and give up after a while so a slow
 * engine still gets an answer. */
async function waitForClose() {
	if (log.aborted) return
	await Promise.race([
		new Promise((resolve) => closers.push(resolve)),
		new Promise((resolve) => setTimeout(resolve, 2000))
	])
}

/** The writer of the newest open stream, so /push can reach it. */
let live = undefined

/** Answer one request with a JSON body. */
function json(response, body, status = 200) {
	const text = JSON.stringify(body)
	response.writeHead(status, {
		"access-control-allow-origin": "*",
		"content-length": Buffer.byteLength(text),
		"content-type": "application/json"
	})
	response.end(text)
}

/** Serve one event stream and play its scenario plan. */
function events(request, response) {
	log.connections += 1
	const connection = log.connections
	const steps = typeof scenario.plan === "function" ? scenario.plan(connection) : scenario.plan
	let closed = false
	const timers = new Set()

	/** Run one callback after a delay, and hold the timer for cleanup. */
	function later(callback, ms) {
		const timer = setTimeout(() => {
			timers.delete(timer)
			callback()
		}, ms)
		timers.add(timer)
	}

	function clear() {
		for (const timer of timers) clearTimeout(timer)
		timers.clear()
	}

	function write(text) {
		if (!closed) response.write(text)
	}

	function finish() {
		if (closed) return
		closed = true
		clear()
		response.end()
	}

	response.on("close", () => {
		closed = true
		clear()
		/** The browser went away first when the fixture did not end the body. */
		if (!response.writableEnded) noteClose()
	})

	async function play() {
		try {
			for (const step of steps) {
				if (closed) return
				if (step.op === "frame") write(frame(step.name))
				else if (step.op === "wait") await new Promise((resolve) => later(resolve, step.ms))
				else if (step.op === "end") return finish()
			}
		} catch (error) {
			log.errors.push(String(error))
			finish()
		}
	}

	function start() {
		live = { write, connection }
		void play()
	}

	response.writeHead(200, {
		"access-control-allow-origin": "*",
		"cache-control": "no-store",
		connection: "keep-alive",
		"content-type": "text/event-stream"
	})
	/* The headers are an open stream, so a state read may answer from here. */
	log.open = true
	response.flushHeaders()
	start()
}

/** Answer one state read. A scenario may hold the answer until the client
 * closed its stream, so a test can prove the frame beat the read. */
async function state(response) {
	log.stateCalls += 1
	if (scenario.stateNeedsOpen && !log.open) {
		log.stateBeforeOpen += 1
		json(response, { error: { error: { code: "not_ready", message: "The stream has not opened." } } }, 409)
		return
	}
	if (scenario.stateAfterClose) await waitForClose()
	json(response, scenario.state(log.stateCalls))
	log.stateServed += 1
}

/** Write one fixture frame to the open stream. */
function push(url, response) {
	if (live === undefined) {
		json(response, { pushed: false }, 409)
		return
	}
	live.write(frame(url.searchParams.get("frame") ?? ""))
	log.pushed += 1
	json(response, { pushed: true })
}

/** Answer a cross-origin preflight. The job client sends Last-Event-ID on
 * reconnect. That header is not CORS-safelisted, so the browser asks before
 * the second GET. Counting that OPTIONS as a stream would consume the drop
 * plan and the reconnect would never open. */
function preflight(response) {
	response.writeHead(204, {
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "GET, OPTIONS",
		"access-control-allow-headers": "last-event-id, authorization",
		"access-control-max-age": "600"
	})
	response.end()
}

const server = createServer(async (request, response) => {
	try {
		if (request.method === "OPTIONS") return preflight(response)
		const url = new URL(request.url ?? "/", "http://127.0.0.1")
		if (url.pathname === "/events") return events(request, response)
		if (url.pathname === "/state") return await state(response)
		if (url.pathname === "/push") return push(url, response)
		if (url.pathname === "/log") return json(response, log)
		json(response, { error: "the fixture has no such route" }, 404)
	} catch (error) {
		/** Report the failure and drop the response, so a spec fails instead
		 * of waiting for an answer that will never come. */
		log.errors.push(String(error))
		response.destroy()
	}
})

server.listen(Number(argument("port", "0")), "127.0.0.1", () => {
	const address = server.address()
	const port = typeof address === "object" && address !== null ? address.port : 0
	process.stdout.write(`${JSON.stringify({ port })}\n`)
})
