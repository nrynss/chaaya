<script lang="ts">
	import { resolve } from "$app/paths";
	import referenceCss from "$lib/tokens/reference.css?raw";
	import { onMount } from "svelte";
	import { Notifier } from "$lib/core/index.js";
	import { reactive } from "$lib/svelte/index.js";
	import BareCount from "./BareCount.svelte";

	/** The smallest observable: one private count behind a getter, and one
	 * notification per change. */
	class Counter extends Notifier {
		#count = 0;

		get count(): number {
			return this.#count;
		}

		increment(): void {
			this.#count += 1;
			this.notify();
		}
	}

	/** One instance, read twice: once through the binding, once bare. */
	const plain = new Counter();
	const counter = reactive(plain);

	let hydrated = $state(false);

	onMount(() => {
		hydrated = true;
	});

	const svelteExample = [
		'import { attach, reactive } from "@nrynss/chaaya/svelte";',
		'import { JobStream } from "@nrynss/chaaya/core";',
		"",
		"const job = reactive(new JobStream({ url, frameMap }));",
		"attach(job);",
	].join("\n");

	const reactExample = [
		'import { useAttached, useObservable } from "@nrynss/chaaya/react";',
		"",
		"const [job] = useState(() => new JobStream({ url, frameMap }));",
		"useObservable(job);",
		"useAttached(job);",
	].join("\n");
</script>

<svelte:head>
	<title>bindings</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<style>${referenceCss}</style>`}
</svelte:head>

<main data-testid="docs-bindings">
	<h1>bindings</h1>
	<p data-testid="hydrated">{hydrated ? "ready" : ""}</p>
	<p>
		Every stateful class is an observable on <code>@nrynss/chaaya/core</code>.
		It keeps its state behind getters and calls <code>subscribe</code>
		listeners once per logical change. <code>version</code> increments
		before the listeners run. Published lists are replaced, never mutated.
		A class with a lifetime starts it in <code>attach()</code>, which
		returns the teardown.
	</p>
	<p>
		A binding turns that signal into a framework's reactivity. Svelte 5
		reads a class through <code>reactive</code> and ties its lifetime to a
		component with <code>attach</code>.
	</p>
	<pre><code>{svelteExample}</code></pre>
	<p>
		React reads a class through <code>useObservable</code>, which is
		<code>useSyncExternalStore</code> over <code>version</code>, and ties its
		lifetime to a component with <code>useAttached</code>.
	</p>
	<pre><code>{reactExample}</code></pre>
	<h2>Read it through the binding</h2>
	<p>
		The counter below is one instance read twice. The first reading goes
		through <code>reactive</code> and follows every change. The second reads
		the bare instance, so it renders once and never updates. That is the
		silent failure a 0.6 migration must avoid.
	</p>
	<button type="button" data-testid="increment" onclick={() => counter.increment()}>increment</button>
	<p>Through <code>reactive</code>: <output data-testid="wrapped">{counter.count}</output></p>
	<p>Bare: <BareCount target={plain} /></p>
	<p>
		The written contract and a binding for another framework are in
		<code>docs/bindings.md</code>. The 0.6 migration guide is
		<code>docs/migrating-0.6.md</code>.
	</p>
	<nav aria-label="Pieces"><a href={resolve("/docs")}>back</a></nav>
</main>
