/**
 * An upload fixture for the browser tests. It speaks the chunked upload
 * protocol the wire goldens carry: a collection path opens an upload, a chunk
 * write stores one block, a state read reports what arrived, and a completion
 * assembles the stored blocks and checks their digest.
 *
 * The fixture is the server the uploader is measured against, so it validates
 * what the real one validates. A chunk is stored only when its declared digest
 * matches. A repeated write of a held index is accepted. Chunks may arrive out
 * of order. A completion before every chunk is present is refused.
 *
 * It records what it saw, so a spec reads back the opens, the writes for each
 * chunk index, the digest each write declared, and the bytes it assembled.
 */
import { createHash } from "node:crypto"
import { createServer } from "node:http"

/** The collection path every upload hangs under. */
const collectionPath = "/uploads"

/** How many chunks one upload may carry. */
const maxChunks = 64

/** How long an upload stays open, in seconds. */
const ttlSeconds = 3600

/** The largest collection this fixture accepts, unless a caller says otherwise. */
const defaultMaxBytes = 8 * 1024 * 1024

const args = process.argv.slice(2)

/** Read one command line argument, or the fallback when it is absent. */
function argument(name, fallback) {
	const index = args.indexOf(`--${name}`)
	if (index === -1 || index + 1 >= args.length) return fallback
	return args[index + 1]
}

const maxBytes = Number(argument("max-bytes", String(defaultMaxBytes)))

/** How many uploads this fixture has opened, so an id is unique. */
let opened = 0

/** The chunk index a spec holds back, or null when nothing is held. A held
 * write answers with a retryable shortage and stays out of the refusal log,
 * because the hold is a deliberate control and not a protocol refusal. */
let heldIndex = null

/** Every upload this fixture knows, by id. */
const uploads = new Map()

/** What the client asked and what it sent, for a spec to read back. */
const log = {
	opens: [],
	reads: 0,
	completes: 0,
	/** The write count for each chunk index, keyed by the index as a string. */
	writes: {},
	/** The digest each chunk write declared, keyed by the index as a string. */
	digests: {},
	/** Every refusal this fixture answered, newest last. */
	refusals: [],
	errors: []
}

/** The headers every answer carries. The harness page runs on another origin,
 * so a browser refuses an answer that carries none of them. */
const corsHeaders = {
	"access-control-allow-origin": "*",
	"access-control-allow-methods": "GET, POST, PUT, OPTIONS",
	"access-control-allow-headers": "content-type, x-chunk-sha256",
	"access-control-max-age": "600"
}

/** Answer one request with a JSON body. */
function json(response, body, status = 200) {
	const text = JSON.stringify(body)
	response.writeHead(status, {
		...corsHeaders,
		"content-type": "application/json",
		"content-length": Buffer.byteLength(text)
	})
	response.end(text)
}

/** Answer one request with an error envelope, and record the refusal. */
function refuse(response, status, code, message, detail) {
	log.refusals.push({ status, code })
	const body = detail === undefined ? { code, message } : { code, message, detail }
	json(response, { error: body }, status)
}

/** Read the whole request body, so both JSON bodies and chunk bytes arrive. */
async function readBody(request) {
	const parts = []
	for await (const part of request) parts.push(part)
	return Buffer.concat(parts)
}

/** The lowercase hex SHA-256 of one buffer. */
function digestOf(bytes) {
	return createHash("sha256").update(bytes).digest("hex")
}

/** Whether a value is a whole number of at least zero. */
function isCount(value) {
	return typeof value === "number" && Number.isInteger(value) && value >= 0
}

/** The chunk indices one upload holds, in order. */
function receivedIndices(upload) {
	return [...upload.chunks.keys()].sort((left, right) => left - right)
}

/** The chunk indices that must arrive before the upload is complete. */
function missingIndices(upload) {
	const received = new Set(upload.chunks.keys())
	if (isCount(upload.chunkCount)) {
		const wanted = []
		for (let index = 0; index < upload.chunkCount; index += 1) {
			if (!received.has(index)) wanted.push(index)
		}
		return wanted
	}
	const last = receivedIndices(upload).at(-1)
	if (last === undefined) return []
	const wanted = []
	for (let index = 0; index <= last; index += 1) {
		if (!received.has(index)) wanted.push(index)
	}
	return wanted
}

/** What the server holds for one upload, in the shape a state read returns. */
function snapshot(upload) {
	const received = receivedIndices(upload)
	let storedBytes = 0
	for (const chunk of upload.chunks.values()) storedBytes += chunk.bytes.length
	return {
		id: upload.id,
		owner: upload.owner,
		content_type: upload.contentType,
		visibility: upload.visibility,
		chunk_size: upload.chunkSize,
		...(upload.sizeBytes === undefined ? {} : { size_bytes: upload.sizeBytes }),
		...(upload.chunkCount === undefined ? {} : { chunk_count: upload.chunkCount }),
		stored_bytes: storedBytes,
		received,
		missing: missingIndices(upload),
		expires_at: upload.expiresAt
	}
}

/** The bytes one upload assembled, in index order. */
function assemble(upload) {
	const parts = receivedIndices(upload).map((index) => upload.chunks.get(index).bytes)
	return Buffer.concat(parts)
}

/** Open one upload from the body of a begin request. */
function open(request, response, body) {
	let decoded
	try {
		decoded = JSON.parse(body.toString("utf8"))
	} catch {
		refuse(response, 400, "invalid_request", "The body does not hold valid JSON.", {
			field: "body",
			reason: "the body is not a JSON object"
		})
		return
	}
	if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
		refuse(response, 400, "invalid_request", "The body holds no JSON object.", {
			field: "body",
			reason: "the body is not a JSON object"
		})
		return
	}
	const { owner, content_type: contentType, visibility, chunk_size: chunkSize } = decoded
	const field = [
		typeof owner === "string" && owner !== "" ? undefined : "owner",
		typeof contentType === "string" && contentType !== "" ? undefined : "content_type",
		typeof visibility === "string" && visibility !== "" ? undefined : "visibility",
		Number.isInteger(chunkSize) && chunkSize > 0 ? undefined : "chunk_size"
	].find((name) => name !== undefined)
	if (field !== undefined) {
		refuse(response, 400, "invalid_request", `The field ${field} is missing or malformed.`, {
			field,
			reason: "the field is missing or not of the declared type"
		})
		return
	}
	opened += 1
	const upload = {
		id: opened.toString(16).padStart(32, "0"),
		owner,
		contentType,
		visibility,
		chunkSize,
		chunkCount: isCount(decoded.chunk_count) ? decoded.chunk_count : undefined,
		sizeBytes: isCount(decoded.size_bytes) ? decoded.size_bytes : undefined,
		expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
		chunks: new Map()
	}
	uploads.set(upload.id, upload)
	log.opens.push({ id: upload.id, owner, contentType, visibility, chunkSize })
	json(response, snapshot(upload), 201)
}

/** Store one chunk of one upload. */
function store(request, response, upload, index, body) {
	if (!Number.isInteger(index) || index < 0 || index >= maxChunks) {
		refuse(response, 400, "invalid_request", "The chunk index lies outside the allowed range.", {
			field: "index",
			reason: `an index sits between 0 and ${maxChunks - 1}`
		})
		return
	}
	if (heldIndex === index) {
		return json(response, {
			error: { code: "unavailable", message: "The fixture holds this chunk for its spec." }
		}, 503)
	}
	if (body.length === 0) {
		refuse(response, 400, "invalid_request", "The chunk carries no bytes.", {
			field: "body",
			reason: "a chunk carries at least one byte"
		})
		return
	}
	if (body.length > upload.chunkSize) {
		refuse(response, 400, "invalid_request", "The chunk is longer than the chunk size.", {
			field: "body",
			reason: `the declared chunk size is ${upload.chunkSize}`
		})
		return
	}
	const declared = request.headers["x-chunk-sha256"]
	if (typeof declared !== "string" || !/^[0-9a-f]{64}$/.test(declared)) {
		refuse(response, 400, "invalid_request", "The chunk carries no usable digest.", {
			field: "x-chunk-sha256",
			reason: "the header carries 64 lowercase hex characters"
		})
		return
	}
	let total = 0
	for (const chunk of upload.chunks.values()) total += chunk.bytes.length
	if (!upload.chunks.has(index) && total + body.length > maxBytes) {
		refuse(response, 413, "limit_exceeded", "The upload is larger than this collection allows.", {
			limit: "collection",
			max_bytes: maxBytes,
			total_bytes: total + body.length
		})
		return
	}
	const actual = digestOf(body)
	const key = String(index)
	log.writes[key] = (log.writes[key] ?? 0) + 1
	log.digests[key] = declared
	if (actual !== declared) {
		refuse(response, 400, "chunk_mismatch", "The chunk does not match the digest it declared.", {
			index,
			declared,
			actual
		})
		return
	}
	// The bytes are copied, so a repeated write of the same index keeps one copy.
	upload.chunks.set(index, { bytes: Buffer.from(body), sha256: actual })
	json(response, snapshot(upload))
}

/** Assemble one upload and check it against the digest the client declared. */
function complete(request, response, upload, body) {
	let declared
	try {
		declared = JSON.parse(body.toString("utf8")).sha256
	} catch {
		declared = undefined
	}
	if (typeof declared !== "string" || !/^[0-9a-f]{64}$/.test(declared)) {
		refuse(response, 400, "invalid_request", "The completion carries no usable digest.", {
			field: "sha256",
			reason: "the field carries 64 lowercase hex characters"
		})
		return
	}
	const missing = missingIndices(upload)
	if (missing.length > 0) {
		refuse(response, 409, "incomplete", "The server still lacks part of this upload.", { missing })
		return
	}
	const assembled = assemble(upload)
	const actual = digestOf(assembled)
	if (actual !== declared) {
		refuse(response, 409, "hash_mismatch", "The assembled upload does not match its digest.", {
			declared,
			actual
		})
		return
	}
	upload.assembled = { bytes: assembled, sha256: actual }
	log.completes += 1
	json(response, {
		id: upload.id,
		owner: upload.owner,
		content_type: upload.contentType,
		visibility: upload.visibility,
		size_bytes: assembled.length,
		sha256: actual
	})
}

/** Serve the upload routes, and the control routes a spec reads. */
async function handle(request, response) {
	const url = new URL(request.url ?? "/", "http://127.0.0.1")
	const path = url.pathname
	/* The page posts JSON and a digest header from another origin, so the
	 * browser asks permission before it sends either. */
	if (request.method === "OPTIONS") {
		response.writeHead(204, { ...corsHeaders, "content-length": "0" })
		response.end()
		return
	}
	if (path === "/log" && url.searchParams.get("reset") === "1") {
		log.opens = []
		log.reads = 0
		log.completes = 0
		log.writes = {}
		log.digests = {}
		log.refusals = []
		log.errors = []
		uploads.clear()
		opened = 0
		return json(response, { reset: true })
	}
	if (path === "/log") return json(response, log)
	if (path === "/__hold" && request.method === "POST") {
		const body = await readBody(request)
		let index = null
		try {
			const decoded = JSON.parse(body.toString("utf8"))
			if (isCount(decoded.index)) index = decoded.index
		} catch {
			// A malformed hold body holds nothing back.
		}
		heldIndex = index
		return json(response, { held: heldIndex })
	}
	if (path === "/__release" && request.method === "POST") {
		heldIndex = null
		return json(response, { held: null })
	}
	if (path === collectionPath && request.method === "POST") {
		return open(request, response, await readBody(request))
	}
	if (!path.startsWith(`${collectionPath}/`)) {
		return refuse(response, 404, "not_found", "This fixture has no such route.")
	}
	const rest = path.slice(collectionPath.length + 1).split("/")
	const upload = uploads.get(rest[0])
	if (upload === undefined) {
		return refuse(response, 404, "not_found", "No upload carries that id.")
	}
	if (rest.length === 1 && request.method === "GET") {
		log.reads += 1
		return json(response, snapshot(upload))
	}
	if (rest.length === 3 && rest[1] === "chunks" && request.method === "PUT") {
		return store(request, response, upload, Number(rest[2]), await readBody(request))
	}
	if (rest.length === 2 && rest[1] === "complete" && request.method === "POST") {
		return complete(request, response, upload, await readBody(request))
	}
	if (rest.length === 2 && rest[1] === "bytes" && request.method === "GET") {
		const held = upload.assembled ?? { bytes: assemble(upload), sha256: digestOf(assemble(upload)) }
		return json(response, {
			id: upload.id,
			size: held.bytes.length,
			sha256: held.sha256,
			chunk_size: upload.chunkSize,
			received: receivedIndices(upload),
			base64: held.bytes.toString("base64")
		})
	}
	refuse(response, 404, "not_found", "This fixture has no such route.")
}

const server = createServer((request, response) => {
	Promise.resolve()
		.then(() => handle(request, response))
		.catch((error) => {
			/* Report the failure and drop the response, so a spec fails instead of
			 * waiting for an answer that will never come. */
			log.errors.push(String(error))
			response.destroy()
		})
})

server.listen(Number(argument("port", "0")), "127.0.0.1", () => {
	const address = server.address()
	const port = typeof address === "object" && address !== null ? address.port : 0
	process.stdout.write(`${JSON.stringify({ port })}\n`)
})
