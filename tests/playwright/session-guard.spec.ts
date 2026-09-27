import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

/** One server record per test and engine, so parallel runs never share a count. */
function recordUrl(base: string, info: TestInfo): string {
	const session = `${info.project.name}-${info.titlePath.join("-")}`;
	return `${base}/docs/session-guard/close?session=${encodeURIComponent(session)}`;
}

/** Read the bodies of every close the app server received, in arrival order. */
async function bodies(request: APIRequestContext, record: string): Promise<string[]> {
	const response = await request.get(record);
	return ((await response.json()) as { bodies: string[] }).bodies;
}

/** Read the close count the app server logged. */
async function closes(request: APIRequestContext, record: string): Promise<number> {
	return (await bodies(request, record)).length;
}

/** Reset the record, so this run starts from zero. */
async function reset(request: APIRequestContext, record: string): Promise<void> {
	await request.delete(record);
}

/** Open the harness against one record, with the chosen body mode. */
async function open(
	page: Page,
	record: string,
	body: "none" | "value" | "throw" | "stream" | "sized" | "euro" | "form",
	size = 0,
): Promise<void> {
	await page.goto(`/tests/session-guard?close=${encodeURIComponent(record)}&body=${body}&size=${size}`);
	await expect(page.getByTestId("attached")).toHaveText("yes");
}

/** Take the beacon away, so the keepalive request is the only path. */
async function dropBeacon(page: Page): Promise<void> {
	await page.evaluate(() => Reflect.deleteProperty(Navigator.prototype, "sendBeacon"));
	expect(await page.evaluate(() => typeof navigator.sendBeacon)).toBe("undefined");
}

/** Fire pagehide on the page, the way a browser does when the page goes away. */
async function hide(page: Page): Promise<void> {
	await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
}

test("hiding and unloading a guarded page sends exactly one close", async ({ page, request, baseURL }, info) => {
	const base = baseURL ?? "http://127.0.0.1:4173";
	const record = recordUrl(base, info);
	await reset(request, record);
	await open(page, record, "none");
	expect(await closes(request, record)).toBe(0);

	/* Hiding the page fires pagehide, which sends the close first. */
	await hide(page);
	await expect.poll(() => closes(request, record)).toBe(1);

	/* Leaving through the harness calls destroy, which must not send again. */
	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await closes(request, record)).toBe(1);

	/* Without a body option the close carries no body. */
	expect(await bodies(request, record)).toEqual([""]);

	/* A second run on a fresh page closes its own session exactly once. */
	await reset(request, record);
	await open(page, record, "none");
	await page.getByTestId("close-twice").click();
	await expect.poll(() => closes(request, record)).toBe(1);
	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await closes(request, record)).toBe(1);
});

test("a beacon close carries a body learned after attach", async ({ page, request, baseURL }, info) => {
	const base = baseURL ?? "http://127.0.0.1:4173";
	const record = recordUrl(base, info);
	await reset(request, record);
	await open(page, record, "value");
	expect(await page.evaluate(() => typeof navigator.sendBeacon)).toBe("function");

	/* The value arrives after attach(), so only a body read at send time carries it. */
	const learned = "session 7f3a learned after attach";
	await page.getByTestId("session-id").fill(learned);
	expect(await closes(request, record)).toBe(0);

	await hide(page);
	await expect.poll(() => bodies(request, record)).toEqual([learned]);

	/* Destroy after the close sends nothing and asks for no second body. */
	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await bodies(request, record)).toEqual([learned]);
	await expect(page.getByTestId("body-calls")).toHaveText("1");
});

test("a keepalive close carries the same body when the page offers no beacon", async ({ page, request, baseURL }, info) => {
	const base = baseURL ?? "http://127.0.0.1:4173";
	const record = recordUrl(base, info);
	await reset(request, record);
	await open(page, record, "value");

	/* Removing the beacon leaves the keepalive request as the only path. */
	await page.evaluate(() => Reflect.deleteProperty(Navigator.prototype, "sendBeacon"));
	expect(await page.evaluate(() => typeof navigator.sendBeacon)).toBe("undefined");

	const learned = "session 9c21 learned after attach";
	await page.getByTestId("session-id").fill(learned);
	expect(await closes(request, record)).toBe(0);

	await hide(page);
	await expect.poll(() => bodies(request, record)).toEqual([learned]);

	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await bodies(request, record)).toEqual([learned]);
	await expect(page.getByTestId("body-calls")).toHaveText("1");
});

test("a body function that throws still sends exactly one close", async ({ page, request, baseURL }, info) => {
	const base = baseURL ?? "http://127.0.0.1:4173";
	const record = recordUrl(base, info);
	await reset(request, record);
	await open(page, record, "throw");
	expect(await closes(request, record)).toBe(0);

	/* The throw costs the body, never the close. */
	await hide(page);
	await expect.poll(() => bodies(request, record)).toEqual([""]);

	/* The latch still holds, so destroy sends nothing more. */
	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await bodies(request, record)).toEqual([""]);
	await expect(page.getByTestId("body-calls")).toHaveText("1");
});

test("a beacon that refuses the body hands it to the keepalive request, read once", async ({ page, request, baseURL }, info) => {
	const base = baseURL ?? "http://127.0.0.1:4173";
	const record = recordUrl(base, info);
	await reset(request, record);
	await open(page, record, "value");

	/* Every beacon is refused, so both paths run in this one close. */
	await page.evaluate(() => {
		Navigator.prototype.sendBeacon = () => false;
	});
	const learned = "session 51be learned after attach";
	await page.getByTestId("session-id").fill(learned);

	await hide(page);
	await expect.poll(() => bodies(request, record)).toEqual([learned]);
	await expect(page.getByTestId("body-calls")).toHaveText("1");

	await page.getByTestId("leave").click();
	await page.waitForTimeout(500);
	expect(await bodies(request, record)).toEqual([learned]);
	await expect(page.getByTestId("body-calls")).toHaveText("1");
});

/** The keepalive budget a page shares across its requests in flight, and the guard's cap on one body. */
const CAP = 64 * 1024;

/** A euro sign is one UTF-16 code unit and three UTF-8 bytes. */
const EURO_BYTES = 3;

/**
 * Start a keepalive request of `size` bytes to another record, then fire
 * pagehide in the same task. The first request is still in flight when the
 * close goes, so both draw on the page's one keepalive budget.
 */
async function hideBeside(page: Page, other: string, size: number): Promise<void> {
	await page.evaluate(
		({ other, size }) => {
			void fetch(other, { method: "POST", keepalive: true, body: "z".repeat(size) }).catch(() => {});
			window.dispatchEvent(new Event("pagehide"));
		},
		{ other, size },
	);
}

for (const path of ["beacon", "keepalive"] as const) {
	test(`a stream body still sends one close on the ${path} path, with no body`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);
		await reset(request, record);
		await open(page, record, "stream");
		if (path === "keepalive") await dropBeacon(page);

		/* Neither path can carry a stream during unload, so only the body is lost. */
		await hide(page);
		await expect.poll(() => bodies(request, record)).toEqual([""]);
		await page.getByTestId("leave").click();
		await page.waitForTimeout(500);
		expect(await bodies(request, record)).toEqual([""]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");
	});

	test(`a body over the cap still sends one close on the ${path} path, with no body`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);
		await reset(request, record);
		await open(page, record, "sized", CAP + 1);
		if (path === "keepalive") await dropBeacon(page);

		/* A browser that enforces the budget would refuse the whole request, so the guard sends it bare. */
		await hide(page);
		await expect.poll(() => bodies(request, record)).toEqual([""]);
		await page.getByTestId("leave").click();
		await page.waitForTimeout(500);
		expect(await bodies(request, record)).toEqual([""]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");
	});

	test(`a body at the cap arrives whole on the ${path} path`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);
		await reset(request, record);
		await open(page, record, "sized", CAP);
		if (path === "keepalive") await dropBeacon(page);

		await hide(page);
		await expect.poll(async () => (await bodies(request, record)).map((body) => body.length)).toEqual([CAP]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");
	});

	test(`a FormData body still sends one close on the ${path} path, with no body`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);
		await reset(request, record);
		await open(page, record, "form");
		if (path === "keepalive") await dropBeacon(page);

		/* The browser frames a form in bytes the guard cannot measure, so only the body is lost. */
		await hide(page);
		await expect.poll(() => bodies(request, record)).toEqual([""]);
		await page.getByTestId("leave").click();
		await page.waitForTimeout(500);
		expect(await bodies(request, record)).toEqual([""]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");
	});

	test(`a multibyte body is measured in bytes on the ${path} path`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);

		/* Under the cap by characters, over it by bytes, so it goes bare. */
		const over = Math.floor(CAP / EURO_BYTES) + 1;
		expect(over * EURO_BYTES).toBeGreaterThan(CAP);
		await reset(request, record);
		await open(page, record, "euro", over);
		if (path === "keepalive") await dropBeacon(page);
		await hide(page);
		await expect.poll(() => bodies(request, record)).toEqual([""]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");

		/* The largest count of euro signs that fits the cap arrives whole. */
		const fits = Math.floor(CAP / EURO_BYTES);
		await reset(request, record);
		await open(page, record, "euro", fits);
		if (path === "keepalive") await dropBeacon(page);
		await hide(page);
		await expect.poll(() => bodies(request, record)).toEqual(["\u20ac".repeat(fits)]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");
	});

	test(`a close with no body goes beside a keepalive request holding most of the budget on the ${path} path`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);
		const other = `${record}-other`;
		await reset(request, record);
		await reset(request, other);
		await open(page, record, "none");
		if (path === "keepalive") await dropBeacon(page);

		/* A bare close adds nothing to the budget, so it goes however much is spent. */
		const held = CAP - 1024;
		await hideBeside(page, other, held);
		await expect.poll(() => bodies(request, record)).toEqual([""]);
		await expect.poll(async () => (await bodies(request, other)).map((body) => body.length)).toEqual([held]);
		await page.getByTestId("leave").click();
		await page.waitForTimeout(500);
		expect(await bodies(request, record)).toEqual([""]);
	});

	test(`a small body goes beside a moderate keepalive request on the ${path} path`, async ({ page, request, baseURL }, info) => {
		const base = baseURL ?? "http://127.0.0.1:4173";
		const record = recordUrl(base, info);
		const other = `${record}-other`;
		await reset(request, record);
		await reset(request, other);
		await open(page, record, "value");
		if (path === "keepalive") await dropBeacon(page);

		/* The two bodies together stay well inside the shared budget, so both arrive. */
		const held = 40 * 1024;
		const learned = "session 3d0e learned after attach";
		await page.getByTestId("session-id").fill(learned);
		await hideBeside(page, other, held);
		await expect.poll(() => bodies(request, record)).toEqual([learned]);
		await expect.poll(async () => (await bodies(request, other)).map((body) => body.length)).toEqual([held]);
		await page.getByTestId("leave").click();
		await page.waitForTimeout(500);
		expect(await bodies(request, record)).toEqual([learned]);
		await expect(page.getByTestId("body-calls")).toHaveText("1");
	});
}

/**
 * The app's own endpoint reads a body with no Content-Type as empty, so the
 * bodies below go to a raw recorder instead. It keeps every byte of each
 * POST, whatever its headers say. Each worker runs its own on a free port.
 */
const raw = new Map<string, Buffer[]>();
let recorder: Server | null = null;
let recorderBase = "";

/** Headers that let an isolated page post to the recorder and read nothing back. */
const openHeaders = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "*",
	"cross-origin-resource-policy": "cross-origin",
};

test.beforeAll(async () => {
	if (recorder !== null) return;
	const server = createServer((req, res) => {
		const key = new URL(req.url ?? "/", "http://recorder").searchParams.get("session") ?? "";
		if (req.method !== "POST") {
			req.resume();
			res.writeHead(204, openHeaders);
			res.end();
			return;
		}
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => {
			raw.set(key, [...(raw.get(key) ?? []), Buffer.concat(chunks)]);
			res.writeHead(200, openHeaders);
			res.end();
		});
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	recorder = server;
	recorderBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}/close`;
});

test.afterAll(async () => {
	const server = recorder;
	recorder = null;
	if (server !== null) await new Promise((done) => server.close(done));
});

/** The bytes a harness buffer holds from `start`, `length` of them. */
function pattern(start: number, length: number): string {
	return Buffer.from(Array.from({ length }, (_, i) => (7 * (start + i) + 1) % 256)).toString("hex");
}

/**
 * Each kind with the exact bytes the recorder must read, the source it must
 * be built on, and the built-in getters it shadows with an own property.
 */
const rawBodies: { kind: string; hex: string; tag: string; shadowed?: string }[] = [
	{ kind: "fixed", hex: pattern(0, 12), tag: "[object ArrayBuffer]" },
	{ kind: "resizable", hex: pattern(0, 16), tag: "[object ArrayBuffer]" },
	{ kind: "resizable-view", hex: pattern(3, 5), tag: "[object ArrayBuffer]" },
	{ kind: "shared-view", hex: pattern(2, 6), tag: "[object SharedArrayBuffer]" },
	{ kind: "growable-view", hex: pattern(1, 4), tag: "[object SharedArrayBuffer]" },
	{ kind: "shared", hex: pattern(0, 9), tag: "[object SharedArrayBuffer]" },
	{ kind: "frame-blob", hex: Buffer.from("frame blob").toString("hex"), tag: "[object Blob]" },
	{ kind: "frame-buffer", hex: pattern(0, 12), tag: "[object ArrayBuffer]" },
	{ kind: "frame-params", hex: Buffer.from("session=frame+params").toString("hex"), tag: "[object URLSearchParams]" },
	/* A plain object with a forged shared buffer tag is no buffer, so it goes bare. */
	{ kind: "tag-spoof", hex: "", tag: "[object SharedArrayBuffer]", shadowed: "byteLength Symbol(Symbol.toStringTag)" },
	/* A fixed buffer that claims it can resize still goes as it is. */
	{ kind: "fixed-resizable-shadow", hex: pattern(0, 3), tag: "[object ArrayBuffer]", shadowed: "resizable" },
	/* A resizable buffer that claims it cannot still goes as a fixed copy. */
	{ kind: "rab-resizable-shadow", hex: pattern(0, 3), tag: "[object ArrayBuffer]", shadowed: "resizable" },
	/* A buffer or view over the cap that claims a small length still goes bare. */
	{ kind: "fixed-over-cap-shadow", hex: "", tag: "[object ArrayBuffer]", shadowed: "byteLength" },
	{ kind: "view-over-cap-shadow", hex: "", tag: "[object ArrayBuffer]", shadowed: "byteLength" },
	/* A shared buffer is measured and known by its slots, never by its length or tag properties. */
	{ kind: "sab-length-shadow", hex: pattern(0, 6), tag: "[object SharedArrayBuffer]", shadowed: "byteLength" },
	{ kind: "sab-over-cap-shadow", hex: "", tag: "[object SharedArrayBuffer]", shadowed: "byteLength" },
	/* A view over a resizable buffer is copied from its slots, never from its offset or buffer properties. */
	{ kind: "view-offset-shadow", hex: pattern(2, 3), tag: "[object ArrayBuffer]", shadowed: "byteOffset" },
	{ kind: "view-buffer-shadow", hex: pattern(0, 3), tag: "[object ArrayBuffer]", shadowed: "buffer" },
	{ kind: "sab-tag-shadow", hex: pattern(0, 3), tag: "[object Other]", shadowed: "Symbol(Symbol.toStringTag)" },
];

for (const path of ["beacon", "keepalive"] as const) {
	for (const { kind, hex, tag, shadowed } of rawBodies) {
		test(`a ${kind} body arrives as its exact bytes on the ${path} path`, async ({ page }, info) => {
			const session = `${info.project.name}-${path}-${kind}`;
			raw.delete(session);
			const close = `${recorderBase}?session=${encodeURIComponent(session)}`;
			await page.goto(`/tests/session-guard/bodies?close=${encodeURIComponent(close)}&kind=${kind}`);
			await expect(page.getByTestId("attached")).toHaveText("yes");

			/* A shared buffer exists only on an isolated page, so check the case is not vacuous. */
			await expect(page.getByTestId("isolated")).toHaveText("yes");
			await expect(page.getByTestId("tag")).toHaveText(tag);
			await expect(page.getByTestId("shadowed")).toHaveText(shadowed ?? "none");
			if (path === "keepalive") await dropBeacon(page);

			await page.getByTestId("close").click();
			await expect.poll(() => (raw.get(session) ?? []).map((body) => body.toString("hex"))).toEqual([hex]);
			await page.waitForTimeout(500);
			expect((raw.get(session) ?? []).length).toBe(1);
		});
	}
}
