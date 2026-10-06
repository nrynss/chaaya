<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";
	import { PricedAction } from "$lib/priced/index.js";

	let quotes = 0;

	const action = new PricedAction<string>({
		quote: async () => {
			quotes += 1;
			return { id: `quote-${quotes}`, price: { amount: 40, currency: "credit.label" } };
		},
		run: async (quoteId) => `spent once against ${quoteId}`
	});

	let hydrated = $state(false);
	let checks = $state("");
	let checkFailure = $state("");

	onMount(() => {
		hydrated = true;
	});

	/** Run the gate pair on this page. The pairs name every colour pair the markup draws. */
	async function runChecks(): Promise<void> {
		checks = "";
		checkFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-priced-action']");
			if (!container) throw new Error("the markup is missing");
			await a11yGate(container);
			contrastGate(referenceCss, [
				["text", "surface"],
				["dim", "surface"]
			]);
			checks = "pass";
		} catch (error) {
			checkFailure = error instanceof Error ? error.message.split("\n")[0] : String(error);
		}
	}
</script>

<svelte:head>
	<title>priced action</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-priced-action">
	<h1>priced action</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>PricedAction</code> on <code>@nrynss/chaaya/priced</code> quotes a price, then runs once
		on confirm. Phases run <code>idle</code>, <code>quoting</code>, <code>quoted</code>,
		<code>running</code>, <code>done</code>, and <code>failed</code>. While a run is in flight, a
		second confirm does nothing. Every attempt sends the quote id, so the backend dedupes on it.
	</p>
	<p>
		Money passes as integer minor units with an opaque denomination label. Chaaya validates
		nothing, computes nothing, and formats nothing. The app renders the price and the confirm
		dialog, including with Bits UI. A refusal that carries a new quote returns to
		<code>quoted</code> at the new price, recognised through the adapter error parser, so core
		names no codes.
	</p>
	<p data-testid="demo-phase">{action.phase}</p>
	<p data-testid="demo-quote">{action.quote?.id ?? "none"}</p>
	<p data-testid="demo-price">
		{action.quote ? `${action.quote.price.amount} ${action.quote.price.currency}` : "no quote yet"}
	</p>
	<p data-testid="demo-result">{action.result ?? ""}</p>
	<p data-testid="demo-error">{action.error instanceof Error ? action.error.message : ""}</p>
	<button type="button" data-testid="demo-quote-button" disabled={!hydrated} onclick={() => void action.requestQuote()}>
		Quote
	</button>
	<button type="button" data-testid="demo-confirm" disabled={!hydrated} onclick={() => void action.confirm()}>
		Confirm
	</button>
	<button type="button" data-testid="demo-reset" disabled={!hydrated} onclick={() => action.reset()}>
		Reset
	</button>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>Run checks</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
