<script lang="ts">
	import { CreditWallet, consumeTopUpReturn, type InsufficientFunds, type PriceQuote } from "$lib/priced/index.js";

	/* The backend lives in session storage, so it survives the reload a hosted
	 * checkout return is. A top-up credits once its time passes, which is the
	 * provider confirming after the redirect landed. */
	interface Backend {
		balance: number;
		quotes: number;
		kept: PriceQuote | null;
		credits: { reference: string; amount: number; at: number }[];
		applied: string[];
		runKeys: string[];
	}

	interface Answer {
		amount: number;
		applied: string[];
	}

	const KEY = "chaaya-credit-wallet-harness";
	let reads = $state(0);
	let runKeys = $state<string[]>([]);
	let changes = $state<number[]>([]);

	function load(): Backend {
		const raw = sessionStorage.getItem(KEY);
		if (raw !== null) return JSON.parse(raw) as Backend;
		return { balance: 10, quotes: 0, kept: null, credits: [], applied: [], runKeys: [] };
	}

	function save(backend: Backend): void {
		sessionStorage.setItem(KEY, JSON.stringify(backend));
	}

	function settle(backend: Backend): Backend {
		const now = Date.now();
		for (const credit of backend.credits) {
			if (credit.at <= now && !backend.applied.includes(credit.reference)) {
				backend.balance += credit.amount;
				backend.applied.push(credit.reference);
			}
		}
		save(backend);
		return backend;
	}

	class Short extends Error {
		readonly balance: number;
		constructor(balance: number) {
			super("Not enough balance.");
			this.balance = balance;
		}
	}

	const wallet = new CreditWallet<Answer>({
		readBalance: async () => {
			reads += 1;
			await new Promise((resolve) => setTimeout(resolve, 20));
			const backend = settle(load());
			return { amount: backend.balance, applied: [...backend.applied] };
		},
		toBalance: (answer) => ({ amount: answer.amount, currency: "credit.label" }),
		parseInsufficientFunds: (error): InsufficientFunds | undefined =>
			error instanceof Short
				? { balance: { amount: error.balance, currency: "credit.label" }, required: { amount: 40, currency: "credit.label" } }
				: undefined,
		onChange: (next) => {
			changes = [...changes, next.amount];
		}
	});

	/* The app keeps the quote across the checkout and hands it back on return. */
	const kept = load().kept;
	const action = wallet.action<string>({
		initialQuote: kept ?? undefined,
		quote: async () => {
			const backend = load();
			backend.quotes += 1;
			save(backend);
			return { id: `q${backend.quotes}`, price: { amount: 40, currency: "credit.label" } };
		},
		run: async (quoteId) => {
			await new Promise((resolve) => setTimeout(resolve, 40));
			const backend = settle(load());
			backend.runKeys.push(quoteId);
			runKeys = [...backend.runKeys];
			if (backend.balance < 40) {
				save(backend);
				throw new Short(backend.balance);
			}
			backend.balance -= 40;
			save(backend);
			return `ok ${quoteId}`;
		}
	});

	/* Leave for the checkout. The provider confirms the credit a little after
	 * the return lands, and the return URL names the reference. */
	function topUp(): void {
		const backend = load();
		backend.kept = action.quote ? { id: action.quote.id, price: { ...action.quote.price } } : null;
		const reference = `ref-${backend.credits.length + 1}`;
		backend.credits.push({ reference, amount: 500, at: Date.now() + 1500 });
		save(backend);
		window.location.assign(`/tests/credit-wallet?topup=${reference}&tab=credits`);
	}

	function wipe(): void {
		sessionStorage.removeItem(KEY);
		window.location.assign("/tests/credit-wallet");
	}

	const reference = consumeTopUpReturn(undefined, { param: "topup", path: "/tests/credit-wallet" });
	if (reference === undefined) void wallet.refresh();
	else
		wallet.followTopUp(reference, {
			isCredited: (answer, ref) => answer.applied.includes(ref),
			intervalMs: 250,
			maxIntervalMs: 500,
			timeoutMs: 10_000
		});
</script>

<main>
	<h1>Credit wallet harness</h1>
	<p data-testid="balance">{wallet.balance?.amount ?? ""}</p>
	<p data-testid="wallet-phase">{wallet.phase}</p>
	<p data-testid="top-up">{wallet.topUp}</p>
	<p data-testid="top-up-reference">{wallet.topUpReference ?? ""}</p>
	<p data-testid="phase">{action.phase}</p>
	<p data-testid="insufficient-balance">{action.insufficient?.balance?.amount ?? ""}</p>
	<p data-testid="quote-id">{action.quote?.id ?? ""}</p>
	<p data-testid="run-keys">{runKeys.join(",")}</p>
	<p data-testid="changes">{changes.join(",")}</p>
	<p data-testid="reads">{reads}</p>
	<button data-testid="confirm" onclick={() => void action.confirm()}>Confirm</button>
	<button data-testid="top-up-button" onclick={topUp}>Top up</button>
	<button data-testid="wipe" onclick={wipe}>Wipe</button>
</main>
