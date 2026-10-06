<script lang="ts">
	import { onMount } from "svelte"
	import { JobPoller, type JobProgress } from "$lib/core/index.js"

	/* The polls the watch has started. The fetch runs even when a response
	 * fails, so this counts attempts rather than readings. */
	let polls = $state(0)
	let hydrated = $state(false)

	interface PollAnswer {
		status: string
		current: number
	}

	async function fetchState(signal: AbortSignal): Promise<PollAnswer> {
		polls += 1
		const response = await fetch("/tests/job-poll/state", { signal })
		if (!response.ok) throw new Error(`the poll answered ${response.status}`)
		return (await response.json()) as PollAnswer
	}

	function toProgress(answer: PollAnswer): JobProgress {
		return { status: answer.status, current: answer.current, total: 4 }
	}

	const poller = new JobPoller({
		fetchState,
		toProgress,
		isTerminal: (reading) => reading.status === "done",
		intervalMs: 500
	})
	poller.attach()

	/* A click on a server rendered button does nothing until hydration
	 * attaches the handler. The markup below needs no button, but the flag
	 * still tells a test the page is live. */
	onMount(() => {
		hydrated = true
	})
</script>

<main>
	<h1>Job poll</h1>
	<dl>
		<dt>Status</dt>
		<dd data-testid="status">{poller.progress.status ?? ""}</dd>
		<dt>Current</dt>
		<dd data-testid="current">{poller.progress.current ?? ""}</dd>
		<dt>Connection</dt>
		<dd data-testid="connection">{poller.connection}</dd>
		<dt>Polls</dt>
		<dd data-testid="polls">{polls}</dd>
		<dt>Error</dt>
		<dd data-testid="error">{poller.error ? poller.error.code : ""}</dd>
		<dt>Hydrated</dt>
		<dd data-testid="hydrated">{hydrated ? "ready" : ""}</dd>
	</dl>
</main>
