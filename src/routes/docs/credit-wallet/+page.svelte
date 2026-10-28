<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onDestroy, onMount } from "svelte";
	import { a11yGate, contrastGate } from "$lib/testing/index.js";
	import { CreditWallet, consumeTopUpReturn } from "$lib/priced/index.js";

	/* An in-memory backend. A top-up credits a moment after the return lands,
	 * the way a payment provider confirms after the redirect. */
	let stored = 30;
	const credited: string[] = [];
	let topUps = 0;

	class Short extends Error {}

	const wallet = new CreditWallet<{ amount: number; credited: string[] }>({
		readBalance: async () => ({ amount: stored, credited: [...credited] }),
		toBalance: (answer) => ({ amount: answer.amount, currency: "credit.label" }),
		parseInsufficientFunds: (error) => (error instanceof Short ? {} : undefined)
	});

	let quotes = 0;
	const action = wallet.action<string>({
		quote: async () => {
			quotes += 1;
			return { id: `quote-${quotes}`, price: { amount: 40, currency: "credit.label" } };
		},
		run: async (quoteId) => {
			if (stored < 40) throw new Short("Not enough balance.");
			stored -= 40;
			return `spent once against ${quoteId}`;
		}
	});

	let hydrated = $state(false);
	let checks = $state("");
	let checkFailure = $state("");
	let cleanup: (() => void) | undefined;

	onMount(() => {
		hydrated = true;
		void wallet.refresh();
	});

	onDestroy(() => {
		cleanup?.();
		wallet.close();
	});

	/* The demo stays on the page, so it plays the return by writing the
	 * reference into the address bar and consuming it at once. */
	function topUp(): void {
		topUps += 1;
		const reference = `demo-top-up-${topUps}`;
		setTimeout(() => {
			stored += 500;
			credited.push(reference);
		}, 1200);
		const url = new URL(window.location.href);
		url.searchParams.set("topup", reference);
		window.history.replaceState(window.history.state, "", url);
		const returned = consumeTopUpReturn(undefined, { param: "topup", path: "/docs/credit-wallet" });
		if (returned === undefined) return;
		cleanup?.();
		wallet.followTopUp(
			returned,
			{ isCredited: (answer, ref) => answer.credited.includes(ref), intervalMs: 300, maxIntervalMs: 600, timeoutMs: 10_000 },
			(task) => {
				cleanup = task();
			}
		);
	}

	/** Run the gate pair on this page. The pairs name every colour pair the markup draws. */
	async function runChecks(): Promise<void> {
		checks = "";
		checkFailure = "";
		try {
			const container = document.querySelector<HTMLElement>("[data-testid='docs-credit-wallet']");
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
	<title>credit wallet</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-credit-wallet">
	<h1>credit wallet</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		<code>CreditWallet</code> on <code>@nrynss/chaaya/priced</code> holds a prepaid balance as
		integer minor units with an opaque label, the shape of <code>PriceAmount</code>. It formats
		nothing. The adapter supplies <code>readBalance</code> and <code>toBalance</code>, so Chaaya
		names no header and no route. An action made through <code>wallet.action</code> refreshes the
		balance after every run attempt. Reads land in the order they began. A refund the backend
		makes after the fact reaches <code>onChange</code> as a balance change on the next read, which
		the app starts with <code>refresh</code>. The app decides what to say.
	</p>
	<p>
		A run refused for lack of balance ends in <code>insufficient</code>, read through the adapter
		parser, not <code>failed</code>. The quote stays, so a confirm after a top-up sends the same
		quote id unless the quote lapsed. A hosted checkout leaves the page and the provider confirms
		later, so <code>consumeTopUpReturn</code> reads the reference once from a caller-named param
		and replaces history. <code>followTopUp</code> then polls the balance through
		<code>JobPoller</code> until the adapter sees the credit or the timeout passes. An app that
		keeps the quote across the checkout passes it back as <code>initialQuote</code>.
	</p>
	<p data-testid="demo-balance">
		{wallet.balance ? `${wallet.balance.amount} ${wallet.balance.currency}` : "no balance yet"}
	</p>
	<p data-testid="demo-phase">{action.phase}</p>
	<p data-testid="demo-quote">{action.quote?.id ?? "none"}</p>
	<p data-testid="demo-top-up-phase">{wallet.topUp}</p>
	<p data-testid="demo-result">{action.result ?? ""}</p>
	<button type="button" data-testid="demo-confirm" disabled={!hydrated} onclick={() => void action.confirm()}>
		Confirm 40
	</button>
	<button type="button" data-testid="demo-top-up" disabled={!hydrated} onclick={topUp}>Top up 500</button>
	<button type="button" data-testid="demo-reset" disabled={!hydrated} onclick={() => action.reset()}>
		Reset
	</button>
	<button type="button" data-testid="run-checks" disabled={!hydrated} onclick={runChecks}>Run checks</button>
	<p data-testid="checks">{checks}</p>
	<p data-testid="check-failure">{checkFailure}</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
