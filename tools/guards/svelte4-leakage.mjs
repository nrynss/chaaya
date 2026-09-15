import { activeLines, listLibFiles } from "./lib.mjs"

// A Svelte 4 idiom inside a Svelte 5 file compiles clean and then never
// reacts. No compiler and no linter reports it, so the scan hunts the idioms
// in the source itself. A store never drives reactivity here, which is why
// an import from svelte/store counts as leakage too.
const leaks = [
	["an export let prop", /\bexport\s+let\b/],
	["a $: reactive label", /\$:/],
	["an import from svelte/store", /\b(?:from\s*|import\s*\(?\s*)["']svelte\/store["']/]
]

const hits = []
for (const file of listLibFiles()) {
	for (const line of activeLines(file)) {
		for (const [what, pattern] of leaks) {
			if (pattern.test(line.text)) hits.push(`${file}:${line.n}: ${what}`)
		}
	}
}

if (hits.length > 0) {
	console.error("Blocked. Svelte 4 idioms in src/lib:")
	for (const hit of hits) console.error(`  ${hit}`)
	process.exit(1)
}
