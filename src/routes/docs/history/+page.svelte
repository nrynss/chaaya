<script lang="ts">
	import { resolve } from "$app/paths"
	import referenceCss from "$lib/tokens/reference.css?raw"
	import { onMount } from "svelte"
	import { EditHistory } from "$lib/history/index.js"

	const history = new EditHistory<string>("a")

	let hydrated = $state(false)

	/** Append one letter as one undoable step. */
	function append(letter: string): void {
		history.execute({
			label: `type ${letter}`,
			apply: (doc) => doc + letter,
			invert: (doc) => doc.slice(0, -1)
		})
	}

	/** Suggest one letter without applying it. */
	function propose(letter: string): void {
		history.propose({
			label: `suggest ${letter}`,
			apply: (doc) => doc + letter,
			invert: (doc) => doc.slice(0, -1)
		})
	}

	/** Accept the earliest proposal as one undoable entry. */
	function acceptEarliest(): void {
		const earliest = history.proposals.at(0)
		if (earliest !== undefined) history.acceptProposal(earliest.id)
	}

	onMount(() => {
		hydrated = true
	})
</script>

<svelte:head>
	<title>history</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-history">
	<h1>history</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		An <code>EditHistory</code> on <code>@nrynss/chaaya/history</code> holds undoable entries
		as apply and invert pairs over plain data. A coalescing key merges consecutive entries,
		such as a drag or repeated nudges. A transaction groups several commands into one entry.
		Proposals wait in a separate list, and accepting one becomes one undoable entry.
	</p>
	<p>
		The sync layer sends pending edits in order with the parent revision through a caller
		supplied commit function. A conflict refusal pauses the queue and exposes the server
		head. The caller rebases or discards, and the history never silently overwrites. Buttons,
		menus, and history views belong to the consumer, so this page wires plain controls to
		show the transitions.
	</p>
	<dl>
		<dt>Document</dt>
		<dd data-testid="demo-doc">{history.doc}</dd>
		<dt>Can undo</dt>
		<dd data-testid="demo-can-undo">{history.canUndo ? "yes" : "no"}</dd>
		<dt>Can redo</dt>
		<dd data-testid="demo-can-redo">{history.canRedo ? "yes" : "no"}</dd>
		<dt>Past steps</dt>
		<dd data-testid="demo-past">{history.pastLabels.join(", ") || "none"}</dd>
		<dt>Future steps</dt>
		<dd data-testid="demo-future">{history.futureLabels.join(", ") || "none"}</dd>
		<dt>Proposals</dt>
		<dd data-testid="demo-proposals">{history.proposals.map((proposal) => proposal.label).join(", ") || "none"}</dd>
	</dl>
	<button type="button" data-testid="demo-append" disabled={!hydrated} onclick={() => append("b")}>
		Append b
	</button>
	<button type="button" data-testid="demo-undo" disabled={!hydrated} onclick={() => history.undo()}>
		Undo
	</button>
	<button type="button" data-testid="demo-redo" disabled={!hydrated} onclick={() => history.redo()}>
		Redo
	</button>
	<button type="button" data-testid="demo-propose" disabled={!hydrated} onclick={() => propose("c")}>
		Propose c
	</button>
	<button type="button" data-testid="demo-accept" disabled={!hydrated} onclick={acceptEarliest}>
		Accept earliest
	</button>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
