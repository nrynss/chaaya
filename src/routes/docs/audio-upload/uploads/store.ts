import { createHash } from "node:crypto";

/** How many chunks one upload may carry. */
const maxChunks = 64;

/** How long an upload stays open, in seconds. */
const ttlSeconds = 3600;

/** The largest collection this route accepts. */
const maxBytes = 8 * 1024 * 1024;

interface Chunk {
	bytes: Buffer;
	sha256: string;
}

export interface Upload {
	id: string;
	owner: string;
	contentType: string;
	visibility: string;
	chunkSize: number;
	expiresAt: string;
	chunks: Map<number, Chunk>;
}

/** Every upload this route knows, by id. A module holds it, so the open,
 * the chunk writes, and the completion share one map. */
const uploads = new Map<string, Upload>();

export function readUpload(id: string): Upload | undefined {
	return uploads.get(id);
}

export function writeUpload(upload: Upload): void {
	uploads.set(upload.id, upload);
}

export function openCount(): number {
	return uploads.size;
}

export function nextId(): string {
	return (uploads.size + 1).toString(16).padStart(32, "0");
}

export function expiry(): string {
	return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

export function chunkLimit(): number {
	return maxChunks;
}

export function byteLimit(): number {
	return maxBytes;
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" }
	});
}

export function answer(body: unknown, status = 200): Response {
	return json(body, status);
}

export function refuse(status: number, code: string, message: string, detail?: unknown): Response {
	const body = detail === undefined ? { code, message } : { code, message, detail };
	return json({ error: body }, status);
}

export function digestOf(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
}

export function isCount(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function receivedIndices(upload: Upload): number[] {
	return [...upload.chunks.keys()].sort((left, right) => left - right);
}

export function missingIndices(upload: Upload): number[] {
	const received = new Set(upload.chunks.keys());
	const last = receivedIndices(upload).at(-1);
	if (last === undefined) return [];
	const wanted: number[] = [];
	for (let index = 0; index <= last; index += 1) {
		if (!received.has(index)) wanted.push(index);
	}
	return wanted;
}

export function snapshot(upload: Upload): unknown {
	const received = receivedIndices(upload);
	let storedBytes = 0;
	for (const chunk of upload.chunks.values()) storedBytes += chunk.bytes.length;
	return {
		id: upload.id,
		owner: upload.owner,
		content_type: upload.contentType,
		visibility: upload.visibility,
		chunk_size: upload.chunkSize,
		stored_bytes: storedBytes,
		received,
		missing: missingIndices(upload),
		expires_at: upload.expiresAt
	};
}

export function assemble(upload: Upload): Buffer {
	const parts = receivedIndices(upload).map(
		(index) => upload.chunks.get(index)?.bytes ?? Buffer.alloc(0)
	);
	return Buffer.concat(parts);
}
