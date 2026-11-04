import { activeLines, listLibFiles } from "./lib.mjs"

// The library is framework-neutral outside the binding directories. ESLint
// fails a Svelte import there, but a rune is not an import: `$state` in a
// plain .ts file reads as an ordinary identifier, so no linter sees it. This
// scan hunts the runes in the code lines of every neutral source file, with
// comments cut out, so prose about a rune never trips it. It also fails a
// .svelte.ts, .svelte.js or .svelte file there, because each one needs the
// Svelte compiler.

/** The directories that may reach Svelte. */
const bindingDirs = ["src/lib/svelte/", "src/lib/sveltekit/"]

/** A rune call or a rune member such as `$state.raw` or `$effect.pre`. The
 * look-behind keeps a longer identifier such as `my$state` or a member such
 * as `obj.$state` out. */
const rune = /(?<![\w$.])\$(state|derived|effect|props|bindable|inspect|host)\b/

/** File names that need the Svelte compiler. */
const svelteFile = /\.svelte(\.(ts|js))?$/

const hits = []
for (const file of listLibFiles()) {
	if (bindingDirs.some((dir) => file.startsWith(dir))) continue
	if (svelteFile.test(file)) {
		hits.push(`${file}: a Svelte module, which needs the Svelte compiler`)
		continue
	}
	if (!/\.(ts|js|mjs|cjs)$/.test(file)) continue
	for (const line of activeLines(file)) {
		const match = rune.exec(line.text)
		if (match) hits.push(`${file}:${line.n}: the ${match[0]} rune`)
	}
}

if (hits.length > 0) {
	console.error("Blocked. Svelte reaches a framework-neutral module. Only src/lib/svelte and src/lib/sveltekit may use it:")
	for (const hit of hits) console.error(`  ${hit}`)
	process.exit(1)
}

console.log("No rune and no Svelte module outside src/lib/svelte and src/lib/sveltekit.")
