import { readFileSync } from "node:fs"
import { join } from "node:path"
import { repoRoot } from "./lib.mjs"

// Consumers render on the server and prerender, so nothing may touch the DOM
// at import time. The guard removes every DOM global before importing, which
// makes a bare touch throw and fail the import. A guarded check that reads
// typeof first still sees undefined for a removed global, so the safe
// pattern passes untouched.
const domGlobals = ["window", "document", "navigator", "localStorage", "sessionStorage"]
for (const name of domGlobals) {
	try {
		delete globalThis[name]
	} catch {
		console.error(`Blocked. node refused to drop the ${name} global, so this check cannot run honestly.`)
		process.exit(1)
	}
	if (typeof globalThis[name] !== "undefined") {
		console.error(`Blocked. node kept the ${name} global, so this check cannot run honestly.`)
		process.exit(1)
	}
}

// The exports map is the promise a consumer imports. Walk every entry in it
// rather than a hardcoded list, so a new entry joins this check the moment
// it lands in package.json. A self-reference import resolves through the
// real map, so a broken entry fails here too.
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
const map = typeof pkg.exports === "string" ? { ".": pkg.exports } : pkg.exports
if (!map || Object.keys(map).length === 0) {
	console.error("Blocked. The exports map is empty, so nothing proves server safety.")
	process.exit(1)
}

let failed = false
for (const key of Object.keys(map)) {
	const sub = key === "." ? "" : `/${key.slice(2)}`
	const specifier = `${pkg.name}${sub}`
	try {
		await import(specifier)
		console.log(`imported ${specifier}`)
	} catch (error) {
		failed = true
		console.error(`failed   ${specifier}`)
		console.error(String(error?.stack ?? error))
	}
}

if (failed) {
	console.error("Blocked. An exports map entry failed to import without a DOM.")
	process.exit(1)
}
