<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { JobStream, type JobSnapshot } from "$lib/adapters/keel/job/index.js";

	let hydrated = $state(false);
	let caughtUp = $state("");

	onMount(() => {
		hydrated = true;
	});

	async function readState(): Promise<JobSnapshot> {
		const response = await fetch("/docs/job/fixture?read=state");
		if (!response.ok) throw new Error(`the state read answered ${response.status}`);
		return (await response.json()) as JobSnapshot;
	}

	const job = new JobStream({ url: "/docs/job/fixture", fetchState: readState });

	/* The page starts the stream on mount in the browser alone. A server
	 * render constructs the stream and never opens it, so prerender stays
	 * safe while the browser still follows the fixture to done. */
	onMount(() => {
		job.attach();
		const timer = setInterval(() => {
			if (job.current !== undefined && job.current >= 4 && caughtUp === "") {
				caughtUp = "caught-up";
			}
			if (job.status === "done") clearInterval(timer);
		}, 100);
		return () => clearInterval(timer);
	});

	const names = $derived(job.events.map((event) => event.name).join(","));
</script>

<svelte:head>
	<title>job</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-job">
	<h1>job</h1>
	<p>
		This page uses the Keel <code>JobStream</code>: the core stream with
		<code>keelFrameMap</code> pre-bound. Import the generic loop from
		<code>@nrynss/chaaya/core</code> when the backend is not Keel.
	</p>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<dl>
		<dt>Status</dt>
		<dd data-testid="status">{job.status}</dd>
		<dt>Stage</dt>
		<dd data-testid="stage">{job.stage ?? ""}</dd>
		<dt>Current</dt>
		<dd data-testid="current">{job.current ?? ""}</dd>
		<dt>Total</dt>
		<dd data-testid="total">{job.total ?? ""}</dd>
		<dt>Connection</dt>
		<dd data-testid="connection">{job.connection}</dd>
		<dt>Events</dt>
		<dd data-testid="events">{names}</dd>
		<dt>Catch up</dt>
		<dd data-testid="catch-up">{caughtUp}</dd>
	</dl>
	<p>The transport contract for this stream is <a href={resolve("/docs/scope")}>scope</a>.</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
