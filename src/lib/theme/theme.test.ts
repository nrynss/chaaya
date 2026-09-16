import { describe, expect, it } from "vitest"

import { resolveTheme } from "./theme"

describe("resolveTheme", () => {
	it("an explicit attribute wins over the system preference", () => {
		expect(resolveTheme("dark", false)).toBe("dark")
		expect(resolveTheme("light", true)).toBe("light")
	})

	it("falls back to the system preference when no explicit theme", () => {
		expect(resolveTheme(null, true)).toBe("dark")
		expect(resolveTheme(null, false)).toBe("light")
		expect(resolveTheme(undefined, true)).toBe("dark")
	})

	it("ignores junk attribute values", () => {
		expect(resolveTheme("sepia", true)).toBe("dark")
		expect(resolveTheme("", false)).toBe("light")
	})
})
