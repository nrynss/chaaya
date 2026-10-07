<script lang="ts">
	import { page } from "$app/state";
	import { CameraSession } from "$lib/capture/camera-session.svelte.js";
	import { prepareImage, type PreparedImage } from "$lib/capture/prepare-image.js";
	import { onMount } from "svelte";

	/** The generated frame size the harness paints. */
	const FRAME = { width: 640, height: 480 };

	/** The EXIF fixture size before preparation. Stored landscape, upright portrait. */
	const EXIF_FIXTURE = { width: 8, height: 4 };
	/** The square EXIF fixture size. Stored square, upright square. */
	const EXIF_SQUARE = { width: 8, height: 8 };

	let session = $state<CameraSession | null>(null);
	let element = $state<HTMLVideoElement | null>(null);
	let failure = $state("");
	let mime = $state("");
	let capturedWidth = $state(0);
	let capturedHeight = $state(0);
	let capturedSize = $state(0);
	let videoWidth = $state(0);
	let videoHeight = $state(0);
	let liveTracks = $state(0);
	let preparedWidth = $state(0);
	let preparedHeight = $state(0);
	let preparedSize = $state(0);
	let preparedMime = $state("");
	let diagOrientation = $state(0);
	let diagStored = $state("");
	let diagBitmap = $state("");
	let frame = 0;
	let painter = 0;
	let generated: HTMLCanvasElement | null = null;

	type StillHook = {
		session: CameraSession | null;
		lastCaptured: Blob | null;
		lastPrepared: Blob | null;
	};

	function paint(): void {
		const canvas = generated;
		if (!canvas) return;
		const context = canvas.getContext("2d");
		if (!context) return;
		const gradient = context.createLinearGradient(0, 0, FRAME.width, FRAME.height);
		gradient.addColorStop(0, `hsl(${(frame * 7) % 360}, 80%, 50%)`);
		gradient.addColorStop(1, "#101820");
		context.fillStyle = gradient;
		context.fillRect(0, 0, FRAME.width, FRAME.height);
		frame += 1;
		painter = requestAnimationFrame(paint);
	}

	/** Wrap the grant with a generated canvas stream, so no check opens a device. */
	function installGenerated(): void {
		generated = document.createElement("canvas");
		generated.width = FRAME.width;
		generated.height = FRAME.height;
		paint();
		const stream = generated.captureStream(30);
		const media = navigator.mediaDevices;
		media.getUserMedia = async () => stream;
	}

	function refresh(): void {
		const current = session;
		if (!current) return;
		videoWidth = element?.videoWidth ?? 0;
		videoHeight = element?.videoHeight ?? 0;
		liveTracks = current.liveTracks;
	}

	function hook(): StillHook {
		const scope = window as unknown as { __still?: StillHook };
		if (!scope.__still) scope.__still = { session: null, lastCaptured: null, lastPrepared: null };
		return scope.__still;
	}

	async function start(facing: "user" | "environment"): Promise<void> {
		failure = "";
		try {
			const next = session ?? new CameraSession();
			session = next;
			hook().session = next;
			if (element) next.bind(element);
			await next.start({ facing });
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
		refresh();
	}

	async function capture(): Promise<void> {
		failure = "";
		try {
			const blob = await session?.capture();
			if (!blob) throw new Error("The session is missing.");
			hook().lastCaptured = blob;
			mime = blob.type;
			capturedSize = blob.size;
			const bitmap = await createImageBitmap(blob);
			capturedWidth = bitmap.width;
			capturedHeight = bitmap.height;
			bitmap.close();
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
		refresh();
	}

	function stop(): void {
		session?.stop();
		refresh();
	}

	function report(prepared: PreparedImage): void {
		preparedWidth = prepared.width;
		preparedHeight = prepared.height;
		preparedSize = prepared.blob.size;
		preparedMime = prepared.mimeType;
		hook().lastPrepared = prepared.blob;
	}

	async function prepare(): Promise<void> {
		failure = "";
		try {
			const source = hook().lastCaptured;
			if (!source) throw new Error("Nothing was captured yet.");
			report(await prepareImage(source, { maxLongSide: 320 }));
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	}

	/** Build an EXIF orientation 6 JPEG with split colours, plus its raw canvas. */
	async function buildExifFixture(
		width: number,
		height: number
	): Promise<{ fixture: Blob; raw: HTMLCanvasElement }> {
		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext("2d");
		if (!context) throw new Error("No canvas context.");
		context.fillStyle = "#ff0000";
		context.fillRect(0, 0, width / 2, height);
		context.fillStyle = "#0000ff";
		context.fillRect(width / 2, 0, width - width / 2, height);
		const raw = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
		});
		if (!raw) throw new Error("No JPEG.");
		const bytes = new Uint8Array(await raw.arrayBuffer());
		const exif = new Uint8Array([
			0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
			0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00
		]);
		const head = new Uint8Array(4 + exif.length);
		head[0] = 0xff;
		head[1] = 0xe1;
		head[2] = 0x00;
		head[3] = 0x22;
		head.set(exif, 4);
		const tagged = new Uint8Array(head.length + bytes.length);
		tagged.set(bytes.slice(0, 2), 0);
		tagged.set(head, 2);
		tagged.set(bytes.slice(2), 2 + head.length);
		return { fixture: new Blob([tagged], { type: "image/jpeg" }), raw: canvas };
	}

	/** Note the fixture orientation, stored size, and raw decode size for the harness. */
	async function diagnose(fixture: Blob): Promise<void> {
		const { readExifOrientation, readStoredDimensions } = await import(
			"$lib/capture/prepare-image.js"
		);
		const fixtureBytes = new Uint8Array(await fixture.arrayBuffer());
		diagOrientation = readExifOrientation(fixtureBytes);
		const storedDims = readStoredDimensions(fixtureBytes);
		diagStored = storedDims ? `${storedDims.width}x${storedDims.height}` : "none";
		const probe = await createImageBitmap(fixture, { imageOrientation: "none" });
		diagBitmap = `${probe.width}x${probe.height}`;
		probe.close();
	}

	/** Build an EXIF orientation 6 JPEG and prepare it. Stored landscape, upright portrait. */
	async function prepareExif(): Promise<void> {
		failure = "";
		try {
			const { fixture } = await buildExifFixture(EXIF_FIXTURE.width, EXIF_FIXTURE.height);
			hook().lastCaptured = fixture;
			await diagnose(fixture);
			report(await prepareImage(fixture, { maxLongSide: 64 }));
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	}

	/** Build a square EXIF orientation 6 JPEG and prepare it on this engine. */
	async function prepareSquareExif(): Promise<void> {
		failure = "";
		try {
			const { fixture } = await buildExifFixture(EXIF_SQUARE.width, EXIF_SQUARE.height);
			hook().lastCaptured = fixture;
			await diagnose(fixture);
			report(await prepareImage(fixture, { maxLongSide: 64 }));
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
	}

	/**
	 * Prepare a square EXIF orientation 6 JPEG as a raw-honouring engine
	 * would decode it. The scoped decode wrapper answers the raw canvas to
	 * a raw request and an upright render otherwise, then steps aside. Every
	 * gate engine pre-rotates instead, so this path pins the engine class
	 * the probes cannot reach.
	 */
	async function prepareSquareExifRaw(): Promise<void> {
		failure = "";
		const real = window.createImageBitmap;
		try {
			const { fixture, raw } = await buildExifFixture(EXIF_SQUARE.width, EXIF_SQUARE.height);
			const upright = document.createElement("canvas");
			upright.width = raw.width;
			upright.height = raw.height;
			const uprightContext = upright.getContext("2d");
			if (!uprightContext) throw new Error("No canvas context.");
			uprightContext.translate(raw.width, 0);
			uprightContext.rotate(Math.PI / 2);
			uprightContext.drawImage(raw, 0, 0);
			const wrapper = (async (
				source: HTMLCanvasElement,
				options?: { imageOrientation?: string }
			): Promise<ImageBitmap> => {
				void source;
				if (options?.imageOrientation === "none") return real(raw);
				return real(upright);
			}) as typeof window.createImageBitmap;
			window.createImageBitmap = wrapper as typeof window.createImageBitmap;
			hook().lastCaptured = fixture;
			await diagnose(fixture);
			report(await prepareImage(fixture, { maxLongSide: 64 }));
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		} finally {
			window.createImageBitmap = real;
		}
	}

	onMount(() => {
		if (page.url.searchParams.get("generated") === "1") installGenerated();
		const timer = setInterval(refresh, 250);
		return () => {
			clearInterval(timer);
			cancelAnimationFrame(painter);
			session?.destroy();
			session = null;
		};
	});
</script>

<main>
	<h1>Still capture harness</h1>
	<video
		data-testid="video"
		bind:this={element}
		playsinline
		muted
		autoplay
	></video>
	<p data-testid="phase">{session?.phase ?? "idle"}</p>
	<p data-testid="facing">{session?.facing ?? "user"}</p>
	<p data-testid="reason">{session?.reason ?? ""}</p>
	<p data-testid="video-width">{videoWidth}</p>
	<p data-testid="video-height">{videoHeight}</p>
	<p data-testid="live-tracks">{liveTracks}</p>
	<p data-testid="capture-mime">{mime}</p>
	<p data-testid="capture-width">{capturedWidth}</p>
	<p data-testid="capture-height">{capturedHeight}</p>
	<p data-testid="capture-size">{capturedSize}</p>
	<p data-testid="prepared-mime">{preparedMime}</p>
	<p data-testid="prepared-width">{preparedWidth}</p>
	<p data-testid="prepared-height">{preparedHeight}</p>
	<p data-testid="prepared-size">{preparedSize}</p>
	<p data-testid="diag-orientation">{diagOrientation}</p>
	<p data-testid="diag-stored">{diagStored}</p>
	<p data-testid="diag-bitmap">{diagBitmap}</p>
	<p data-testid="error">{failure}</p>
	<button data-testid="start" onclick={() => void start("user")}>Start</button>
	<button data-testid="start-rear" onclick={() => void start("environment")}>Start rear</button>
	<button data-testid="switch" onclick={() => void session?.switchFacing()}>Switch</button>
	<button data-testid="capture" onclick={() => void capture()}>Capture</button>
	<button data-testid="stop" onclick={stop}>Stop</button>
	<button data-testid="prepare" onclick={() => void prepare()}>Prepare</button>
	<button data-testid="prepare-exif" onclick={() => void prepareExif()}>Prepare EXIF</button>
	<button data-testid="prepare-square-exif" onclick={() => void prepareSquareExif()}>Prepare square EXIF</button>
	<button data-testid="prepare-square-exif-raw" onclick={() => void prepareSquareExifRaw()}>
		Prepare square EXIF raw
	</button>
</main>
