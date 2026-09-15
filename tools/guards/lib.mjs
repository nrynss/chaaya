import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** The repository root, resolved from this file, so a guard runs from any
 * working directory. */
export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/** Every source file the library ships, tracked or waiting to be added. The
 * listing matches the gate's other scans: tracked files, plus the untracked
 * files git would add, so the gate judges uncommitted work the same way. */
export function listLibFiles() {
	const listing = execFileSync(
		"git",
		["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
		{ cwd: repoRoot, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
	)
	return listing.split("\0").filter((file) => file.startsWith("src/lib/"))
}

/** The code lines of a source file with comments cut out, so prose about a
 * rule never trips the scan that enforces it. Svelte markup closes comments
 * with arrows, everything else closes them with stars. A comment opener counts
 * only outside a string or a regex, so code holding a comment marker inside a
 * literal keeps the lines after it. A `//` preceded by a colon is a URL scheme
 * and stays. */
export function activeLines(file) {
	const svelte = file.endsWith(".svelte")
	const text = readFileSync(join(repoRoot, file), "utf8")
	const lines = []
	let kept = ""
	let number = 1
	let i = 0
	let inBlock = false
	let inHtml = false
	let quote = ""
	let inRegex = false
	let inClass = false
	let last = ""
	const flush = () => {
		if (kept.trim() !== "") lines.push({ n: number, text: kept })
		kept = ""
	}
	const opensRegex = (char) => char === "" || "([{,;:=!&|?+-*%<>~^".includes(char)
	/** True when the code before a slash ends in a postfix `++` or `--`.
	 * That slash is a division, because the operand is already complete,
	 * so it never opens a regex. */
	const postfixBefore = (at) => {
		let j = at - 1
		while (j >= 0 && /\s/.test(text[j])) j--
		return (text[j] === "+" || text[j] === "-") && text[j - 1] === text[j]
	}
	while (i < text.length) {
		const char = text[i]
		const next = text[i + 1]
		if (char === "\n") {
			flush()
			number++
			if (quote === '"' || quote === "'") quote = ""
			if (inRegex) inRegex = false
			i++
			continue
		}
		if (inBlock) {
			if (char === "*" && next === "/") {
				inBlock = false
				i += 2
			} else {
				i++
			}
			continue
		}
		if (inHtml) {
			if (char === "-" && next === "-" && text[i + 2] === ">") {
				inHtml = false
				i += 3
			} else {
				i++
			}
			continue
		}
		if (quote !== "") {
			kept += char
			if (char === "\\" && i + 1 < text.length) {
				kept += text[i + 1]
				i += 2
				continue
			}
			if (char === quote) {
				quote = ""
				last = char
			}
			i++
			continue
		}
		if (inRegex) {
			kept += char
			if (char === "\\" && i + 1 < text.length) {
				kept += text[i + 1]
				i += 2
				continue
			}
			if (char === "[") inClass = true
			else if (char === "]") inClass = false
			else if (char === "/" && !inClass) {
				inRegex = false
				last = char
			}
			i++
			continue
		}
		if (char === "/" && next === "/" && text[i - 1] !== ":") {
			const end = text.indexOf("\n", i)
			i = end === -1 ? text.length : end
			continue
		}
		if (char === "/" && next === "*") {
			inBlock = true
			i += 2
			continue
		}
		if (svelte && char === "<" && next === "!" && text[i + 2] === "-" && text[i + 3] === "-") {
			inHtml = true
			i += 4
			continue
		}
		if (char === '"' || char === "'" || char === "`") {
			quote = char
			kept += char
			last = char
			i++
			continue
		}
		if (char === "/" && !postfixBefore(i) && opensRegex(last)) {
			inRegex = true
			inClass = false
			kept += char
			i++
			continue
		}
		kept += char
		if (char.trim() !== "") last = char
		i++
	}
	flush()
	return lines
}
