import { expect, test } from "vitest"
import { consumeShareLaunch } from "./intake.js"
import { createShareSource, extractFirstUrl, readSharedPayload } from "./payload.js"

test("a URL in text becomes the link", () => {
	const payload = readSharedPayload("https://app.test/share?text=Try%20this%20https%3A%2F%2Fshop.test%2Fitem%2F9")
	expect(payload).toEqual({ url: "https://shop.test/item/9", text: "Try this https://shop.test/item/9" })
})

test("a URL in url wins over one in text", () => {
	const payload = readSharedPayload(
		"https://app.test/share?url=https%3A%2F%2Fshop.test%2Fitem%2F9&text=See%20https%3A%2F%2Fother.test%2F"
	)
	expect(payload?.url).toBe("https://shop.test/item/9")
	expect(payload?.text).toBe("See https://other.test/")
})

test("text without a link carries no url", () => {
	const payload = readSharedPayload("https://app.test/share?text=Just%20words&title=A%20title")
	expect(payload).toEqual({ text: "Just words", title: "A title" })
})

test("two URLs in text keep the first", () => {
	const payload = readSharedPayload(
		"https://app.test/share?text=https%3A%2F%2Ffirst.test%2Fa%20then%20https%3A%2F%2Fsecond.test%2Fb"
	)
	expect(payload?.url).toBe("https://first.test/a")
})

test("encoded characters survive the read", () => {
	const payload = readSharedPayload(
		"https://app.test/share?title=Caf%C3%A9%20range&text=See%20https%3A%2F%2Fshop.test%2Fcaf%25C3%25A9"
	)
	expect(payload?.title).toBe("Café range")
	expect(payload?.url).toBe("https://shop.test/caf%C3%A9")
})

test("an empty launch carries no payload", () => {
	expect(readSharedPayload("https://app.test/share")).toBeUndefined()
	expect(readSharedPayload("https://app.test/share?text=%20")).toBeUndefined()
})

test("the caller filter trims tracking params", () => {
	const payload = readSharedPayload("https://app.test/share?url=https%3A%2F%2Fshop.test%2Fitem%3Fid%3D9%26ref%3Dsocial", {
		dropParam: (name) => name === "ref"
	})
	expect(payload?.url).toBe("https://shop.test/item?id=9")
})

test("the first link skips trailing stops", () => {
	expect(extractFirstUrl("See https://shop.test/item/9.")).toBe("https://shop.test/item/9")
	expect(extractFirstUrl("Nothing here")).toBeUndefined()
})

test("consume reads once and cleans only share params", () => {
	const replaced: string[] = []
	const scope = globalThis as unknown as { history?: History }
	const real = scope.history
	scope.history = { replaceState: (_data: unknown, _title: string, url: string) => replaced.push(url) } as unknown as History
	try {
		const payload = consumeShareLaunch("https://app.test/share?mode=try&text=Hi%20https%3A%2F%2Fshop.test%2Fitem%2F9", {
			path: "/share"
		})
		expect(payload?.url).toBe("https://shop.test/item/9")
		expect(replaced).toEqual(["/share?mode=try"])
		expect(consumeShareLaunch("https://app.test/other?text=Hi", { path: "/share" })).toBeUndefined()
	} finally {
		if (real === undefined) delete scope.history
		else scope.history = real
	}
})

test("the native seam emits the same shape to one handler", () => {
	const { source, emit } = createShareSource()
	const seen: unknown[] = []
	const leave = source.subscribe((payload) => seen.push(payload))
	emit({ url: "https://shop.test/item/9", title: "An item" })
	leave()
	emit({ url: "https://shop.test/item/10" })
	expect(seen).toEqual([{ url: "https://shop.test/item/9", title: "An item" }])
})
