import { activeLines, listLibFiles } from "./lib.mjs"

// Components ship behaviour, not looks. Every colour and font a consumer
// sees comes from that consumer's tokens, so the library carries no literal
// visual value. The parenthesised colour forms also cover their alpha
// variants, and the font rule covers the camelCase form a style object uses.
const values = [
	["a hex colour", /#[0-9a-fA-F]{3,8}\b/],
	["an rgb( colour", /rgba?\(/],
	["an hsl( colour", /hsla?\(/],
	["a font-family value", /font-family|fontFamily/]
]

// The token contract's reference file is the one file allowed to carry
// literal values, because it documents every token role with the value it
// stands for. The token contract ships src/lib/tokens/reference.css, and this
// scan exempts that path and nothing else.
const referenceFile = "src/lib/tokens/reference.css"

const hits = []
for (const file of listLibFiles()) {
	if (file === referenceFile) continue
	for (const line of activeLines(file)) {
		for (const [what, pattern] of values) {
			if (pattern.test(line.text)) hits.push(`${file}:${line.n}: ${what}`)
		}
	}
}

if (hits.length > 0) {
	console.error("Blocked. Visual values in src/lib:")
	for (const hit of hits) console.error(`  ${hit}`)
	process.exit(1)
}
