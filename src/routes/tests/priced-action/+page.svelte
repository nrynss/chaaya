<script lang="ts">
	import { page } from "$app/state";
	import { PricedAction } from "$lib/priced/index.js";
	import { onMount } from "svelte";

	let quotes = 0;
	let failTimes = 0;
	let runCalls = $state(0);
	let runKeys = $state<string[]>([]);

	const action = new PricedAction<string>({
		quote: async () => {
			quotes += 1;
			await new Promise((resolve) => setTimeout(resolve, 20));
			return { id: `q${quotes}`, price: { amount: 40, currency: "credit.label" } };
		},
		run: async (quoteId: string) => {
			runCalls += 1;
			runKeys = [...runKeys, quoteId];
			await new Promise((resolve) => setTimeout(resolve, 60));
			if (failTimes > 0) {
				failTimes -= 1;
				throw new Error("The request timed out.");
			}
			return `ok ${quoteId}`;
		}
	});

	type PricedHook = {
		setFailTimes: (count: number) => void;
	};

	onMount(() => {
		const scope = window as unknown as { __priced?: PricedHook };
		const initial = Number(page.url.searchParams.get("fail") ?? "0");
		if (Number.isFinite(initial) && initial > 0) failTimes = initial;
		scope.__priced = {
			setFailTimes: (count: number) => {
				failTimes = count;
			}
		};
	});
</script>

<main>
	<h1>Priced action harness</h1>
	<p data-testid="phase">{action.phase}</p>
	<p data-testid="quote-id">{action.quote?.id ?? ""}</p>
	<p data-testid="price-amount">{action.quote?.price.amount ?? 0}</p>
	<p data-testid="price-currency">{action.quote?.price.currency ?? ""}</p>
	<p data-testid="run-calls">{runCalls}</p>
	<p data-testid="run-keys">{runKeys.join(",")}</p>
	<p data-testid="result">{action.result ?? ""}</p>
	<p data-testid="error">{action.error instanceof Error ? action.error.message : ""}</p>
	<button data-testid="quote" onclick={() => void action.requestQuote()}>Quote</button>
	<button data-testid="confirm" onclick={() => void action.confirm()}>Confirm</button>
	<button data-testid="reset" onclick={() => action.reset()}>Reset</button>
</main>
