import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { compileModule } from "svelte/compiler"
import { repoRoot } from "./lib.mjs"

// A consumer compiles every packaged .svelte.js module with the Svelte 5
// module compiler before its app imports one. A build that lowers a rune
// class below ES2022 turns a rune field into a constructor assignment, and
// that compile throws state_invalid_placement on first import. This guard
// runs the same compiler over every module in dist and fails naming the
// first file that throws, so a build below the rune floor cannot pass.

const distDir = join(repoRoot, "dist")

/** Every .svelte.js file under a directory, in directory walk order. */
function listModules(dir) {
	const found = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) found.push(...listModules(path))
		else if (entry.name.endsWith(".svelte.js")) found.push(path)
	}
	return found
}

let modules
try {
	modules = listModules(distDir)
} catch {
	console.error("Blocked. dist carries no build, so nothing proves the packaged Svelte modules compile.")
	process.exit(1)
}

if (modules.length === 0) {
	console.error("Blocked. dist carries no .svelte.js module, so nothing proves the packaged Svelte modules compile.")
	process.exit(1)
}

for (const file of modules) {
	try {
		compileModule(readFileSync(file, "utf8"), { filename: file, generate: "client" })
	} catch (error) {
		console.error(`Blocked. ${file} fails the Svelte 5 module compiler.`)
		console.error(String(error?.stack ?? error))
		process.exit(1)
	}
}

console.log(`compiled ${modules.length} .svelte.js modules through the Svelte 5 module compiler`)
