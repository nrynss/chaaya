<script lang="ts">
	import { EditHistory, type CommitRequest, type CommitResponse } from "$lib/history/index.js";

	/** A random session per load, so parallel runs never share a record. */
	const session = Math.random().toString(36).slice(2);

	let mode = $state<"ok" | "fail">("ok");
	let letters = $state(0);

	/** Send one step to the test route, which refuses stale bases. */
	async function commit(request: CommitRequest<string>): Promise<CommitResponse<string>> {
		const response = await fetch("/tests/history/commit", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				session,
				mode,
				base: request.base,
				doc: request.doc,
				label: request.label
			})
		});
		if (response.status === 409) {
			const head = (await response.json()) as { headRevision: number; head: string };
			return { conflict: true, headRevision: head.headRevision, head: head.head };
		}
		if (!response.ok) throw new Error(`The commit failed with status ${response.status}.`);
		const done = (await response.json()) as { revision: number };
		return { revision: done.revision };
	}

	const history = new EditHistory<string>("", { commit });

	/** The next letter to append, cycling through the alphabet. */
	function nextLetter(): string {
		const letter = String.fromCharCode(65 + (letters % 26));
		letters += 1;
		return letter;
	}

	/** Append one letter as one undoable step. */
	function append(): void {
		const letter = nextLetter();
		history.execute({
			label: `type ${letter}`,
			apply: (doc) => doc + letter,
			invert: (doc) => doc.slice(0, -1)
		});
	}

	/** Write straight through as a second client would. */
	async function remoteEdit(): Promise<void> {
		await fetch("/tests/history/commit", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ session, remote: true, doc: "REMOTE" })
		});
	}

	/** Flush and swallow the rejection, since the status carries the failure. */
	function flush(): void {
		void history.flush().catch(() => undefined);
	}

	const failureText = $derived(
		history.lastError instanceof Error ? history.lastError.message : ""
	);
	const headText = $derived(history.conflict === null ? "" : history.conflict.head);
</script>

<main>
	<h1>History harness</h1>
	<p data-testid="doc">{history.doc}</p>
	<p data-testid="revision">{history.serverRevision}</p>
	<p data-testid="status">{history.status}</p>
	<p data-testid="pending">{history.pendingCount}</p>
	<p data-testid="synced">{history.synced ? "yes" : "no"}</p>
	<p data-testid="head">{headText}</p>
	<p data-testid="failure">{failureText}</p>
	<p data-testid="past">{history.pastLabels.join(",")}</p>
	<button type="button" data-testid="append" onclick={append}>Append</button>
	<button type="button" data-testid="undo" onclick={() => history.undo()}>Undo</button>
	<button type="button" data-testid="redo" onclick={() => history.redo()}>Redo</button>
	<button type="button" data-testid="flush" onclick={flush}>Flush</button>
	<button type="button" data-testid="rebase" onclick={() => history.rebase()}>Rebase</button>
	<button type="button" data-testid="discard" onclick={() => history.discardPending()}>Discard</button>
	<button type="button" data-testid="remote" onclick={() => void remoteEdit()}>Remote edit</button>
	<button type="button" data-testid="mode-ok" onclick={() => (mode = "ok")}>Mode ok</button>
	<button type="button" data-testid="mode-fail" onclick={() => (mode = "fail")}>Mode fail</button>
</main>
