import type { RequestHandler } from "./$types";

const jobId = "3f9a1c7e5b2d8046a1c3e5f7092b4d68";

/** One progress frame the stream replays after the catch-up read lands. */
const progressFrame =
	`event: progress\nid: 3\ndata: {"job_id":"${jobId}","stage":"transcoding","current":4,"total":12,"detail":{"pass":"loudness"}}\n\n`;

/** The terminal frame that ends the stream. */
const doneFrame = `event: done\nid: 4\ndata: {"job_id":"${jobId}","status":"done"}\n\n`;

/** The frames the stream replays after the catch-up read lands. */
const frameNames = [progressFrame, progressFrame, doneFrame];
function json(body: unknown, status = 200): Response {
	const text = JSON.stringify(body);
	return new Response(text, {
		status,
		headers: { "content-type": "application/json" }
	});
}

/** The stream the docs page follows. Its state read answers first and the
 * frames follow, so the catch-up read lands before the stream carries the
 * job past it. */
export const GET: RequestHandler = async ({ url }) => {
	if (url.searchParams.get("read") === "state") {
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 150);
		await promise;
		return json({ jobId, status: "running", stage: "transcoding", current: 1, total: 12 });
	}
	const frames = frameNames;
	let timer: ReturnType<typeof setInterval> | undefined;
	const stream = new ReadableStream({
		start(controller) {
			let at = 0;
			timer = setInterval(() => {
				// The page leaves this stream when it navigates on, which
				// settles the controller under the timer. Every settle runs
				// inside the guard, so a late tick stops quietly instead of
				// closing twice and crashing the server process.
				try {
					if (at >= frames.length) {
						clearInterval(timer);
						timer = undefined;
						controller.close();
						return;
					}
					controller.enqueue(frames[at]);
					at += 1;
				} catch {
					clearInterval(timer);
					timer = undefined;
				}
			}, 120);
		},
		cancel() {
			if (timer !== undefined) {
				clearInterval(timer);
				timer = undefined;
			}
		}
	});
	return new Response(stream, {
		status: 200,
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive"
		}
	});
};
