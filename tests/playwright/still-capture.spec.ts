import { expect, test, type Page } from "@playwright/test"

/** The generated frame the harness paints, so the grab has known pixels. */
const FRAME = { width: 640, height: 480 }

/** Whether the last prepared blob carries no EXIF segment. */
async function preparedHasNoExif(page: Page): Promise<boolean> {
	const base64 = await page.evaluate(async () => {
		const hook = (window as unknown as { __still?: { lastPrepared?: Blob } }).__still
		const blob = hook?.lastPrepared
		if (!blob) return ""
		const bytes = new Uint8Array(await blob.arrayBuffer())
		let binary = ""
		const step = 0x8000
		for (let index = 0; index < bytes.length; index += step) {
			binary += String.fromCharCode(...bytes.subarray(index, index + step))
		}
		return btoa(binary)
	})
	if (base64.length === 0) return false
	const bytes = Buffer.from(base64, "base64")
	return !bytes.includes(Buffer.from("Exif\0\0", "latin1"))
}

interface PreparedPixels {
	width: number
	height: number
	top: number[]
	bottom: number[]
}

/** Read the last prepared pixels back, with a top and a bottom sample. */
async function readPreparedPixels(page: Page): Promise<PreparedPixels | null> {
	return page.evaluate(async () => {
		const hook = (window as unknown as { __still?: { lastPrepared?: Blob } }).__still
		const blob = hook?.lastPrepared
		if (!blob) return null
		const bitmap = await createImageBitmap(blob)
		const canvas = document.createElement("canvas")
		canvas.width = bitmap.width
		canvas.height = bitmap.height
		const context = canvas.getContext("2d")
		if (!context) return null
		context.drawImage(bitmap, 0, 0)
		bitmap.close()
		const read = (x: number, y: number): number[] => {
			const found = context.getImageData(x, y, 1, 1).data
			return [found[0], found[1], found[2]]
		}
		const middle = Math.floor(canvas.width / 2)
		return {
			width: canvas.width,
			height: canvas.height,
			top: read(middle, 1),
			bottom: read(middle, canvas.height - 2)
		}
	})
}

test.describe("still capture", () => {
	test("a generated stream goes live, grabs a frame, and stops clean", async ({ page }) => {
		await page.goto("/tests/still-capture?generated=1")
		await page.getByTestId("start").click()
		await expect(page.getByTestId("phase")).toHaveText("live", { timeout: 15_000 })
		await expect(page.getByTestId("video-width")).toHaveText(String(FRAME.width), { timeout: 15_000 })
		await expect(page.getByTestId("error")).toHaveText("")
		await page.getByTestId("capture").click()
		await expect(page.getByTestId("capture-mime")).toHaveText("image/jpeg")
		await expect(page.getByTestId("capture-width")).toHaveText(String(FRAME.width))
		await expect(page.getByTestId("capture-height")).toHaveText(String(FRAME.height))
		expect(Number(await page.getByTestId("capture-size").textContent())).toBeGreaterThan(0)
		await page.getByTestId("stop").click()
		await expect(page.getByTestId("phase")).toHaveText("idle")
		await expect(page.getByTestId("live-tracks")).toHaveText("0")
		await expect(page.getByTestId("error")).toHaveText("")
	})

	test("an EXIF orientation 6 fixture prepares upright with no EXIF", async ({ page }) => {
		await page.goto("/tests/still-capture")
		await page.getByTestId("prepare-exif").click()
		// Stored 8 by 4 landscape, upright 4 by 8 portrait, under the 64 cap.
		await expect(page.getByTestId("prepared-width")).toHaveText("4")
		await expect(page.getByTestId("prepared-height")).toHaveText("8")
		await expect(page.getByTestId("prepared-mime")).toHaveText("image/jpeg")
		expect(Number(await page.getByTestId("prepared-size").textContent())).toBeGreaterThan(0)
		await expect(page.getByTestId("error")).toHaveText("")
		const base64 = await page.evaluate(async () => {
			const hook = (window as unknown as { __still?: { lastPrepared?: Blob } }).__still
			const blob = hook?.lastPrepared
			if (!blob) return ""
			const bytes = new Uint8Array(await blob.arrayBuffer())
			let binary = ""
			const step = 0x8000
			for (let index = 0; index < bytes.length; index += step) {
				binary += String.fromCharCode(...bytes.subarray(index, index + step))
			}
			return btoa(binary)
		})
		expect(base64.length).toBeGreaterThan(0)
		const bytes = Buffer.from(base64, "base64")
		expect(bytes.includes(Buffer.from("Exif\0\0", "latin1"))).toBe(false)
		const pixels = await page.evaluate(async () => {
			const hook = (window as unknown as { __still?: { lastPrepared?: Blob } }).__still
			const blob = hook?.lastPrepared
			if (!blob) return null
			const bitmap = await createImageBitmap(blob)
			const canvas = document.createElement("canvas")
			canvas.width = bitmap.width
			canvas.height = bitmap.height
			const context = canvas.getContext("2d")
			if (!context) return null
			context.drawImage(bitmap, 0, 0)
			bitmap.close()
			const read = (x: number, y: number): number[] => {
				const found = context.getImageData(x, y, 1, 1).data
				return [found[0], found[1], found[2]]
			}
			return { width: canvas.width, height: canvas.height, top: read(2, 0), bottom: read(2, 7) }
		})
		expect(pixels?.width).toBe(4)
		expect(pixels?.height).toBe(8)
		const [topR, , topB] = pixels?.top ?? [0, 0, 0]
		const [bottomR, , bottomB] = pixels?.bottom ?? [0, 0, 0]
		expect(topR - topB).toBeGreaterThan(64)
		expect(bottomB - bottomR).toBeGreaterThan(64)
	})

	test("a square EXIF orientation 6 fixture prepares upright with no EXIF", async ({ page }) => {
		await page.goto("/tests/still-capture")
		await page.getByTestId("prepare-square-exif").click()
		// Stored 8 by 8 square, upright 8 by 8, under the 64 cap.
		await expect(page.getByTestId("prepared-width")).toHaveText("8")
		await expect(page.getByTestId("prepared-height")).toHaveText("8")
		await expect(page.getByTestId("prepared-mime")).toHaveText("image/jpeg")
		expect(Number(await page.getByTestId("prepared-size").textContent())).toBeGreaterThan(0)
		await expect(page.getByTestId("error")).toHaveText("")
		expect(await preparedHasNoExif(page)).toBe(true)
		const pixels = await readPreparedPixels(page)
		expect(pixels?.width).toBe(8)
		expect(pixels?.height).toBe(8)
		const [topR, , topB] = pixels?.top ?? [0, 0, 0]
		const [bottomR, , bottomB] = pixels?.bottom ?? [0, 0, 0]
		expect(topR - topB).toBeGreaterThan(64)
		expect(bottomB - bottomR).toBeGreaterThan(64)
	})

	test("a square EXIF orientation 6 fixture prepares upright on a raw engine", async ({
		page
	}) => {
		await page.goto("/tests/still-capture")
		await page.getByTestId("prepare-square-exif-raw").click()
		// The harness answers raw pixels to a raw decode request, which no
		// gate engine does. The sizes match either way, so the pixel
		// comparison owns the decision here instead of the request.
		await expect(page.getByTestId("prepared-width")).toHaveText("8")
		await expect(page.getByTestId("prepared-height")).toHaveText("8")
		await expect(page.getByTestId("prepared-mime")).toHaveText("image/jpeg")
		expect(Number(await page.getByTestId("prepared-size").textContent())).toBeGreaterThan(0)
		await expect(page.getByTestId("error")).toHaveText("")
		expect(await preparedHasNoExif(page)).toBe(true)
		const pixels = await readPreparedPixels(page)
		expect(pixels?.width).toBe(8)
		expect(pixels?.height).toBe(8)
		const [topR, , topB] = pixels?.top ?? [0, 0, 0]
		const [bottomR, , bottomB] = pixels?.bottom ?? [0, 0, 0]
		expect(topR - topB).toBeGreaterThan(64)
		expect(bottomB - bottomR).toBeGreaterThan(64)
	})

	test("the still capture docs pass the gates", async ({ page }) => {
		await page.goto("/docs/still-capture")
		await expect(page.getByTestId("hydrated")).toHaveText("ready")
		await page.getByTestId("run-checks").click()
		await expect(page.getByTestId("checks")).toHaveText("pass", { timeout: 30_000 })
		await expect(page.getByTestId("check-failure")).toHaveText("")
	})
})
