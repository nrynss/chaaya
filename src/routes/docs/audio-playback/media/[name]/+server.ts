import type { RequestHandler } from "./$types";

/** A short mono 16 bit tone the docs player loads, seeks, and plays. */
const SAMPLE_RATE = 48000;
/** Two minutes keeps a seek near the end far outside the buffered head. */
const TONE_SECONDS = 120;
const TONE_HZ = 440;
/** The largest slice one range response carries. */
const SLICE_BYTES = 1024 * 1024;

function buildTone(): Uint8Array<ArrayBuffer> {
	const frames = SAMPLE_RATE * TONE_SECONDS;
	const dataBytes = frames * 2;
	const bytes = new Uint8Array(new ArrayBuffer(44 + dataBytes));
	const view = new DataView(bytes.buffer);
	const write = (offset: number, text: string): void => {
		for (let index = 0; index < text.length; index += 1) {
			bytes[offset + index] = text.charCodeAt(index);
		}
	};
	write(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	write(8, "WAVE");
	write(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	write(36, "data");
	view.setUint32(40, dataBytes, true);
	const step = (TONE_HZ * 2 * Math.PI) / SAMPLE_RATE;
	for (let frame = 0; frame < frames; frame += 1) {
		view.setInt16(44 + frame * 2, Math.round(Math.sin(frame * step) * 12000), true);
	}
	return bytes;
}

const tone = buildTone();

interface Slice {
	start: number;
	end: number;
}

/** A range ask that starts past the end of the tone. */
interface PastEnd {
	pastEnd: true;
}

/** The byte slice one range header asks for, capped so a response stays small.
 * A suffix ask takes the tail of the tone, or the whole tone when the tail
 * runs past its start. An ask past the end has no slice. */
function sliceFor(rangeHeader: string | null, size: number): Slice | PastEnd | null {
	if (!rangeHeader) return null;
	const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
	if (!match) return null;
	if (match[1] === "") {
		const suffix = Number(match[2]);
		if (suffix <= 0) return null;
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(match[1]);
	if (start >= size) return { pastEnd: true };
	if (match[2] === "") return { start, end: Math.min(size - 1, start + SLICE_BYTES - 1) };
	const wanted = Number(match[2]);
	if (wanted < start) return null;
	return { start, end: Math.min(wanted, start + SLICE_BYTES - 1, size - 1) };
}

/** Serve the tone the docs player drives. A range ask gets its slice, and a
 * plain ask gets the head of the file. */
export const GET: RequestHandler = ({ params, request }) => {
	if (params.name !== "tone.wav") {
		return new Response("gone", { status: 404, headers: { "content-type": "text/plain" } });
	}
	const slice = sliceFor(request.headers.get("range"), tone.length);
	if (slice && "pastEnd" in slice) {
		return new Response("range not satisfiable", {
			status: 416,
			headers: {
				"content-type": "text/plain",
				"content-range": `bytes */${tone.length}`
			}
		});
	}
	if (slice) {
		return new Response(tone.subarray(slice.start, slice.end + 1), {
			status: 206,
			headers: {
				"content-type": "audio/wav",
				"accept-ranges": "bytes",
				"content-range": `bytes ${slice.start}-${slice.end}/${tone.length}`,
				"content-length": String(slice.end - slice.start + 1)
			}
		});
	}
	const head = tone.subarray(0, Math.min(SLICE_BYTES, tone.length));
	return new Response(head, {
		status: 200,
		headers: {
			"content-type": "audio/wav",
			"accept-ranges": "bytes",
			"content-length": String(head.length)
		}
	});
};
