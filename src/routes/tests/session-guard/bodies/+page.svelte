<script lang="ts">
	import { page } from "$app/state"
	import { onMount } from "svelte"
	import { SessionGuard } from "$lib/guard/session-guard.svelte.js"

	/** The endpoint that collects close notices. A spec passes one in. */
	const target = page.url.searchParams.get("close") ?? ""

	/**
	 * Which body the close carries. Some kinds are ones a browser will not
	 * send as they are, and some are built in another frame's realm. Others
	 * are a real buffer or view with an own property over a built-in getter,
	 * or a forgery. The byte at index
	 * i of every buffer holds (7 * i + 1) mod 256, so a spec can name the bytes.
	 */
	const kind = page.url.searchParams.get("kind") ?? ""

	let attached = $state(false)
	let isolated = $state(false)
	let tag = $state("")
	let shadowed = $state("")
	let guard: SessionGuard | null = null

	/** Fill a buffer with the pattern a spec expects. */
	function fill(buffer: ArrayBufferLike): void {
		const bytes = new Uint8Array(buffer)
		for (let i = 0; i < bytes.length; i += 1) bytes[i] = (7 * i + 1) % 256
	}

	/** A frame of this origin, whose constructors belong to another realm. */
	function frameRealm(): typeof globalThis {
		const frame = document.createElement("iframe")
		frame.hidden = true
		document.body.append(frame)
		const realm = frame.contentWindow
		if (realm === null) throw new Error("The frame has no window.")
		return realm as unknown as typeof globalThis
	}

	/** Build the body for this kind. Untyped code reaches the shared kinds, so they are cast. */
	function build(): unknown {
		if (kind === "fixed") {
			const buffer = new ArrayBuffer(12)
			fill(buffer)
			return buffer
		}
		if (kind === "resizable") {
			const buffer = new ArrayBuffer(10, { maxByteLength: 100 })
			buffer.resize(16)
			fill(buffer)
			return buffer
		}
		if (kind === "resizable-view") {
			const buffer = new ArrayBuffer(10, { maxByteLength: 100 })
			fill(buffer)
			return new Uint8Array(buffer, 3, 5)
		}
		if (kind === "shared-view") {
			const buffer = new SharedArrayBuffer(12)
			fill(buffer)
			return new Uint8Array(buffer, 2, 6)
		}
		if (kind === "growable-view") {
			const buffer = new SharedArrayBuffer(8, { maxByteLength: 64 })
			fill(buffer)
			return new DataView(buffer, 1, 4)
		}
		if (kind === "shared") {
			const buffer = new SharedArrayBuffer(9)
			fill(buffer)
			return buffer
		}
		if (kind === "frame-blob") {
			const realm = frameRealm()
			return new realm.Blob(["frame blob"])
		}
		if (kind === "frame-buffer") {
			const realm = frameRealm()
			const buffer = new realm.ArrayBuffer(12)
			fill(buffer)
			return buffer
		}
		if (kind === "frame-params") {
			const realm = frameRealm()
			return new realm.URLSearchParams({ session: "frame params" })
		}
		if (kind === "tag-spoof") {
			/* A plain object that forges a shared buffer's tag and length, and reads as an array-like. */
			return { [Symbol.toStringTag]: "SharedArrayBuffer", byteLength: 3, length: 3, 0: 65, 1: 66, 2: 67 }
		}
		if (kind === "fixed-resizable-shadow") {
			const buffer = new ArrayBuffer(3)
			fill(buffer)
			return shadow(buffer, "resizable", true)
		}
		if (kind === "rab-resizable-shadow") {
			const buffer = new ArrayBuffer(3, { maxByteLength: 8 })
			fill(buffer)
			return shadow(buffer, "resizable", false)
		}
		if (kind === "fixed-over-cap-shadow") return shadow(new ArrayBuffer(70000), "byteLength", 2)
		if (kind === "view-over-cap-shadow") return shadow(new Uint8Array(70000), "byteLength", 2)
		if (kind === "sab-length-shadow") {
			const buffer = new SharedArrayBuffer(6)
			fill(buffer)
			return shadow(buffer, "byteLength", 2)
		}
		if (kind === "sab-over-cap-shadow") return shadow(new SharedArrayBuffer(70000), "byteLength", 2)
		if (kind === "sab-tag-shadow") {
			const buffer = new SharedArrayBuffer(3)
			fill(buffer)
			return shadow(buffer, Symbol.toStringTag, "Other")
		}
		if (kind === "view-offset-shadow") {
			const buffer = new ArrayBuffer(8, { maxByteLength: 16 })
			fill(buffer)
			return shadow(new Uint8Array(buffer, 2, 3), "byteOffset", 0)
		}
		if (kind === "view-buffer-shadow") {
			const buffer = new ArrayBuffer(3, { maxByteLength: 16 })
			fill(buffer)
			return shadow(new Uint8Array(buffer), "buffer", new ArrayBuffer(3))
		}
		return null
	}

	/** Define an own property on a value, over the getter its prototype defines. */
	function shadow<T extends object>(value: T, key: PropertyKey, claim: unknown): T {
		Object.defineProperty(value, key, { value: claim })
		return value
	}

	/** The names of the built-in getters a body shadows with an own property. */
	function ownClaims(body: unknown): string {
		if (typeof body !== "object" || body === null) return "none"
		const keys: PropertyKey[] = ["resizable", "byteLength", "byteOffset", "buffer", Symbol.toStringTag]
		const names = keys.filter((key) => Object.getOwnPropertyDescriptor(body, key) !== undefined).map(String)
		return names.length === 0 ? "none" : names.join(" ")
	}

	onMount(() => {
		isolated = crossOriginIsolated
		const body = build()
		const source = ArrayBuffer.isView(body) ? body.buffer : body
		tag = Object.prototype.toString.call(source)
		shadowed = ownClaims(body)
		const next = new SessionGuard({
			url: target,
			/* A shared buffer is outside the option's type, so the harness hands every kind over the way untyped code does. */
			body: () => body as string,
		})
		next.attach()
		guard = next
		attached = true
	})
</script>

<main>
	<h1>Session guard bodies harness</h1>
	<dl>
		<dt>Attached</dt>
		<dd data-testid="attached">{attached ? "yes" : "no"}</dd>
		<dt>Isolated</dt>
		<dd data-testid="isolated">{isolated ? "yes" : "no"}</dd>
		<dt>Body source</dt>
		<dd data-testid="tag">{tag}</dd>
		<dt>Shadowed getters</dt>
		<dd data-testid="shadowed">{shadowed}</dd>
	</dl>
	<button type="button" data-testid="close" disabled={!attached} onclick={() => guard?.close()}>Close</button>
</main>
