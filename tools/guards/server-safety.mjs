import { existsSync, readFileSync } from "node:fs"
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path"
import { activeLines, repoRoot } from "./lib.mjs"

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

const jsExtensions = [".js", ".mjs", ".cjs", ".ts", ".mts"]

/** The file an exports entry points at under plain node. A string value is
 * the path itself, and an object value resolves through its default condition,
 * which is the one plain node picks. */
function targetFile(value) {
	if (typeof value === "string") return value
	if (value && typeof value === "object") {
		if (typeof value.default === "string") return value.default
		return Object.values(value).find((entry) => typeof entry === "string")
	}
	return undefined
}

/** Fails a stylesheet that is missing, empty, or imports a path the package
 * cannot ship. Block comments come out first, so a documented import never
 * counts as a real one, while a pair of slashes stays live. A relative import
 * must resolve to a file the package ships. An absolute or scheme import
 * always leaves the package. A block comment that never closes fails too. */
function checkStylesheet(file) {
	const text = readFileSync(file, "utf8")
	if (text.trim() === "") throw new Error(`${file} is empty, so it ships no styles`)
	const source = activeLines(file, { mode: "css" })
		.map((line) => line.text)
		.join("\n")
	for (const [, imported] of source.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?/g)) {
		const resolved = resolve(dirname(file), imported)
		const outside =
			/^[a-z][a-z0-9+.-]*:/i.test(imported) ||
			imported.startsWith("//") ||
			isAbsolute(imported) ||
			relative(repoRoot, resolved).startsWith("..")
		if (outside) throw new Error(`${file} imports ${imported}, which lives outside the package`)
		if (!existsSync(resolved)) {
			throw new Error(`${file} imports ${imported}, but ${resolved} does not exist`)
		}
	}
}

let failed = false
for (const key of Object.keys(map)) {
	const sub = key === "." ? "" : `/${key.slice(2)}`
	const specifier = `${pkg.name}${sub}`
	const target = targetFile(map[key])
	const extension = target ? extname(target) : ""
	try {
		if (jsExtensions.includes(extension)) {
			await import(specifier)
			console.log(`imported ${specifier}`)
			continue
		}
		if (extension === ".css") {
			checkStylesheet(join(repoRoot, target))
			console.log(`checked  ${specifier}`)
			continue
		}
		throw new Error(`the guard has no rule for the ${extension || "empty"} extension`)
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
