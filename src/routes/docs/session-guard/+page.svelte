<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { SessionGuard } from "$lib/guard/session-guard.svelte.js";

	let guard: SessionGuard | null = $state(null);
	let hydrated = $state(false);

	/** The session id the server hands back after the page attaches. The
	 * guard reads it when the close goes, so the close names the session. */
	let sessionId: string | null = $state(null);

	/** The body of the last close the server read, once the reader asks. */
	let received: string | null = $state(null);

	/** How many sessions this page has held, so each gets its own id. */
	let held = 0;

	/** The example as a consumer writes it. */
	const example = [
		"const guard = new SessionGuard({",
		"\turl: \"/docs/session-guard/close\",",
		"\tbody: () => sessionId,",
		"});",
		"guard.attach();",
		"sessionId = await startSession();",
	].join("\n");

	onMount(() => {
		hydrated = true;
	});

	/** Hold one live session, so the page tells the server when it leaves. */
	function hold(): void {
		if (guard !== null) return;
		const next = new SessionGuard({
			url: "/docs/session-guard/close",
			body: () => sessionId,
		});
		next.attach();
		guard = next;
		/* The id arrives after attach(), the way a provider session id does. */
		held += 1;
		sessionId = `docs-session-${held}`;
	}

	/** Release the session in the open. The guard still closes it on
	 * destroy, so the server sees exactly one close either way. */
	function release(): void {
		guard?.destroy();
		guard = null;
		sessionId = null;
	}

	/** Ask the close endpoint what it read, so the page shows the body arrived. */
	async function readServer(): Promise<void> {
		const response = await fetch("/docs/session-guard/close");
		const record = (await response.json()) as { bodies: string[] };
		received = record.bodies.at(-1) ?? "no close yet";
	}
</script>

<svelte:head>
	<title>session guard</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-session-guard">
	<h1>session guard</h1>
	<p>A page that holds a live session tells the server it is leaving. The guard sends one close on pagehide and on destroy, and the first send wins.</p>
	<p>The close can carry a body. Pass a body function, and the guard calls it once when the close goes, on the beacon and the keepalive path alike. So the close carries a value learned after attach(). A body function that throws costs the body, never the close attempt.</p>
	<p>The body is a string, a Blob, a buffer or a URLSearchParams, and it may come from another frame. The guard sends a body of 64 KiB or less. It drops a larger body and sends the close bare, so the browser has no oversized body to refuse. It sends a FormData or a stream bare too, because it cannot know their size on the wire before the send. A buffer that can resize or is shared goes as a fixed copy of its bytes, because a browser may refuse one as it is.</p>
	<p>A buffer, or a Blob with no type, goes with no Content-Type header. Some servers read such a body as empty, and SvelteKit's Node reader is one of them. So when the endpoint is a SvelteKit route, or any server that needs the header, send a string or a Blob with a type. The example below sends a string.</p>
	<p>The guard makes exactly one close attempt, by beacon or by keepalive request. It cannot promise delivery, because the browser may refuse that attempt when its keepalive limits are spent. The page shares one byte budget across every keepalive request in flight, and a body adds to it. Some browsers also cap how many keepalive requests are in flight. Beacon limits differ between browsers. The guard cannot see the page's other requests, so keep the body small.</p>
	<pre data-testid="example"><code>{example}</code></pre>
	<button type="button" data-testid="hold" disabled={!hydrated || guard !== null} onclick={hold}>Hold a session</button>
	<button type="button" data-testid="release" disabled={!hydrated || guard === null} onclick={release}>Release</button>
	<p data-testid="held">{guard === null ? "released" : "held"}</p>
	<p data-testid="session-id">{sessionId ?? "no session"}</p>
	<p data-testid="closed">{guard?.closed === true ? "closed" : "open"}</p>
	<button type="button" data-testid="read-server" disabled={!hydrated} onclick={readServer}>Read what the server received</button>
	<p data-testid="received">{received ?? "not read"}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
