<script lang="ts">
	import { goto } from "$app/navigation"
	import { resolve } from "$app/paths"
	import { page } from "$app/state"
	import { onMount } from "svelte"
	import { JobStream, type JobSnapshot } from "$lib/job"

	/* The fixture server this page follows. A spec starts one and passes its
	 * address in, so each test owns its own stream. */
	const base = page.url.searchParams.get("stream") ?? ""

	/** The status the state read carried, and the status the class held once
	 * that answer landed. A test reads both to prove which one won. */
	let settled = $state("")

	async function readState(): Promise<JobSnapshot> {
		const response = await fetch(`${base}/state`)
		if (!response.ok) throw new Error(`the state read answered ${response.status}`)
		const snapshot = (await response.json()) as JobSnapshot
		/* The class applies the answer in a microtask, so a task later the
		 * class holds whatever it decided to keep. */
		setTimeout(() => {
			settled = `${snapshot.status}:${job.status}`
		}, 0)
		return snapshot
	}

	const job = new JobStream({ url: `${base}/events`, fetchState: readState })
	job.attach()

	const names = $derived(job.events.map((event) => event.name).join(","))

	let hydrated = $state(false)

	/* A click on a server rendered button does nothing until hydration
	 * attaches the handler. The button stays disabled until then, so a test
	 * that clicks it waits for hydration instead of racing it. */
	onMount(() => {
		hydrated = true
	})
</script>

<main>
	<h1>Job stream</h1>
	<dl>
		<dt>Status</dt>
		<dd data-testid="status">{job.status}</dd>
		<dt>Stage</dt>
		<dd data-testid="stage">{job.stage ?? ""}</dd>
		<dt>Current</dt>
		<dd data-testid="current">{job.current ?? ""}</dd>
		<dt>Total</dt>
		<dd data-testid="total">{job.total ?? ""}</dd>
		<dt>Error</dt>
		<dd data-testid="error">{job.error ? job.error.code : ""}</dd>
		<dt>Connection</dt>
		<dd data-testid="connection">{job.connection}</dd>
		<dt>Reconnects</dt>
		<dd data-testid="reconnects">{job.reconnects}</dd>
		<dt>Frames</dt>
		<dd data-testid="frames">{job.events.length}</dd>
		<dt>Events</dt>
		<dd data-testid="events">{names}</dd>
		<dt>Read settled</dt>
		<dd data-testid="read-settled">{settled}</dd>
	</dl>
	<button type="button" data-testid="leave" disabled={!hydrated} onclick={() => goto(resolve("/"))}>
		Leave
	</button>
</main>
