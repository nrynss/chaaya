<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { SessionGuard, type SessionGuardOptions } from "$lib/guard/session-guard.svelte.js";

	/** The endpoint that collects close notices. A spec passes one in. */
	const target = page.url.searchParams.get("close") ?? "";

	/**
	 * How the guard builds its close body. "none" leaves the option out,
	 * "value" sends the session id typed after attach(), and "throw" hands
	 * the guard a function that throws. "stream" returns a ReadableStream,
	 * the way untyped code might. "sized" returns a string of `size` bytes.
	 * "euro" returns `size` euro signs, three UTF-8 bytes each, so a count of
	 * characters and a count of bytes disagree. "form" returns a small
	 * FormData, the way untyped code might.
	 */
	const mode = page.url.searchParams.get("body") ?? "none"

	/** The byte length of the "sized" body. */
	const size = Number(page.url.searchParams.get("size") ?? "0")

	/** The guard holding this page's session. Built at mount, so it never touches a browser global during render. */
	let guard = $state<SessionGuard | null>(null)
	let hydrated = $state(false)
	let attached = $state(false)

	/** A value the page learns after attach(), which the close must still carry. */
	let sessionId = $state("")

	/** How many times the guard asked for a body. */
	let bodyCalls = $state(0)

	/** The body option for the chosen mode. */
	function bodyOption(): SessionGuardOptions["body"] {
		if (mode === "value") {
			return () => {
				bodyCalls += 1
				return sessionId
			}
		}
		if (mode === "throw") {
			return () => {
				bodyCalls += 1
				throw new Error("The body cannot be built.")
			}
		}
		if (mode === "stream") {
			return () => {
				bodyCalls += 1
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("stream"))
						controller.close()
					},
				})
				/* Untyped code can hand the guard a stream, so the harness does too. */
				return stream as unknown as string
			}
		}
		if (mode === "sized") {
			return () => {
				bodyCalls += 1
				return "x".repeat(size)
			}
		}
		if (mode === "euro") {
			return () => {
				bodyCalls += 1
				return "\u20ac".repeat(size)
			}
		}
		if (mode === "form") {
			return () => {
				bodyCalls += 1
				const form = new FormData()
				form.append("session", "form body")
				/* The option's type leaves a form out, so only untyped code reaches here. */
				return form as unknown as string
			}
		}
		return undefined
	}

	onMount(() => {
		hydrated = true
		const body = bodyOption()
		const next = new SessionGuard(body === undefined ? { url: target } : { url: target, body })
		next.attach()
		guard = next
		attached = true
	})
</script>

<main>
	<h1>Session guard harness</h1>
	<dl>
		<dt>Attached</dt>
		<dd data-testid="attached">{attached ? "yes" : "no"}</dd>
		<dt>Hydrated</dt>
		<dd data-testid="hydrated">{hydrated ? "yes" : "no"}</dd>
		<dt>Body calls</dt>
		<dd data-testid="body-calls">{bodyCalls}</dd>
	</dl>
	<label>
		Session id
		<input type="text" data-testid="session-id" bind:value={sessionId} />
	</label>
	<button
		type="button"
		data-testid="leave"
		disabled={!hydrated || guard === null}
		onclick={() => {
			guard?.destroy()
			guard = null
		}}
	>
		Leave
	</button>
	<button
		type="button"
		data-testid="close-twice"
		disabled={!hydrated || guard === null}
		onclick={() => {
			guard?.close();
			guard?.close();
		}}
	>
		Close twice
	</button>
</main>
