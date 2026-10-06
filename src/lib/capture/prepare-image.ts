/**
 * Upload preparation for any still image. The source may come from a live
 * camera session, a file picker, or a native backend. The prepared blob
 * enters the existing one-shot upload path unchanged.
 *
 * Nothing here touches a browser global at import time. Canvas and bitmap
 * decoding happen inside `prepareImage`, so the helpers below stay usable on
 * a server and in a check.
 */

/** What `prepareImage` accepts. */
export interface PrepareImageOptions {
	/** The longest side of the output, in pixels. Keeps the source size when omitted. */
	readonly maxLongSide?: number
	/** The container type. Keeps an image type the source names, else writes JPEG. */
	readonly mime?: string
	/** The first encoder quality, from zero to one. Defaults to 0.92. */
	readonly quality?: number
	/** The lowest quality the size loop tries before it keeps the smallest blob. Defaults to 0.4. */
	readonly minQuality?: number
	/** The byte ceiling. Steps quality down until the blob fits. Omit for one encode. */
	readonly maxBytes?: number
}

/** A blob ready for the one-shot upload path, with its size in pixels. */
export interface PreparedImage {
	/** The re-encoded bytes. Re-encoding drops EXIF, including GPS. */
	readonly blob: Blob
	/** The output width in pixels. */
	readonly width: number
	/** The output height in pixels. */
	readonly height: number
	/** The container type of the blob. */
	readonly mimeType: string
}

/** The first quality the size loop tries when a caller names none. */
const FIRST_QUALITY = 0.92

/** How far one size step lowers the quality. */
const QUALITY_STEP = 0.08

/** The lowest quality the size loop tries when a caller names none. */
const LAST_QUALITY = 0.4

/** Whether the loop may encode again at a lower quality. */
function smaller(blob: Blob, limit: number | undefined): boolean {
	return limit !== undefined && blob.size > limit
}

/**
 * The output size for a natural size under a long side cap. Keeps the aspect
 * ratio, never grows, and rounds to whole pixels of at least one. A missing
 * cap keeps the natural size. A non-positive cap is refused.
 */
export function fitDimensions(
	naturalWidth: number,
	naturalHeight: number,
	maxLongSide?: number
): { width: number; height: number } {
	if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) {
		throw new RangeError("naturalWidth must be a positive number of pixels")
	}
	if (!Number.isFinite(naturalHeight) || naturalHeight <= 0) {
		throw new RangeError("naturalHeight must be a positive number of pixels")
	}
	if (maxLongSide === undefined) {
		return { width: Math.round(naturalWidth), height: Math.round(naturalHeight) }
	}
	if (!Number.isFinite(maxLongSide) || maxLongSide <= 0) {
		throw new RangeError("maxLongSide must be a positive number of pixels, or omitted")
	}
	const scale = Math.min(1, maxLongSide / Math.max(naturalWidth, naturalHeight))
	return {
		width: Math.max(1, Math.round(naturalWidth * scale)),
		height: Math.max(1, Math.round(naturalHeight * scale))
	}
}

/** Read an unsigned sixteen bit value at an offset in an order. */
function u16(bytes: Uint8Array, offset: number, little: boolean): number {
	return little ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1]
}

/** Read an unsigned thirty two bit value at an offset in an order. */
function u32(bytes: Uint8Array, offset: number, little: boolean): number {
	if (little) {
		return (
			bytes[offset] |
			(bytes[offset + 1] << 8) |
			(bytes[offset + 2] << 16) |
			bytes[offset + 3] * 0x1000000
		)
	}
	return (
		bytes[offset] * 0x1000000 |
		(bytes[offset + 1] << 16) |
		(bytes[offset + 2] << 8) |
		bytes[offset + 3]
	)
}

/**
 * The EXIF orientation of JPEG bytes, from 1 to 8. Answers 1 when the bytes
 * carry no EXIF orientation, including non-JPEG input and truncated tags. A
 * re-encode drops the segment this reads, so the output never carries it.
 */
export function readExifOrientation(bytes: Uint8Array): number {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1
	let offset = 2
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) return 1
		const marker = bytes[offset + 1]
		if (marker === 0xda || marker === 0xd9) return 1
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
		if (length < 2 || offset + 2 + length > bytes.length) return 1
		if (marker === 0xe1 && length >= 8) {
			const body = offset + 4
			if (
				bytes[body] === 0x45 &&
				bytes[body + 1] === 0x78 &&
				bytes[body + 2] === 0x69 &&
				bytes[body + 3] === 0x66 &&
				bytes[body + 4] === 0x00 &&
				bytes[body + 5] === 0x00
			) {
				const found = orientationInTiff(bytes, body + 6, length - 8)
				if (found !== 1) return found
			}
		}
		offset += 2 + length
	}
	return 1
}

/** The orientation tag inside one TIFF header, or 1 when it is absent. */
function orientationInTiff(bytes: Uint8Array, start: number, length: number): number {
	if (length < 8 || start + 8 > bytes.length) return 1
	const little = bytes[start] === 0x49 && bytes[start + 1] === 0x49
	const big = bytes[start] === 0x4d && bytes[start + 1] === 0x4d
	if (!little && !big) return 1
	if (u16(bytes, start + 2, little) !== 42) return 1
	const first = start + u32(bytes, start + 4, little)
	if (first < start + 8 || first + 2 > start + length || first + 2 > bytes.length) return 1
	const entries = u16(bytes, first, little)
	for (let index = 0; index < entries; index += 1) {
		const entry = first + 2 + index * 12
		if (entry + 12 > start + length || entry + 12 > bytes.length) return 1
		if (u16(bytes, entry, little) !== 0x0112) continue
		if (u16(bytes, entry + 2, little) !== 3) return 1
		if (u32(bytes, entry + 4, little) !== 1) return 1
		const value = u16(bytes, entry + 8, little)
		return value >= 1 && value <= 8 ? value : 1
	}
	return 1
}

/**
 * Whether JPEG bytes carry an EXIF segment. Re-encoded output must read
 * false, because the encoder writes no APP1 segment and GPS goes with it.
 */
export function hasExifSegment(bytes: Uint8Array): boolean {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false
	let offset = 2
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) return false
		const marker = bytes[offset + 1]
		if (marker === 0xda || marker === 0xd9) return false
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
		if (length < 2 || offset + 2 + length > bytes.length) return false
		if (marker === 0xe1 && length >= 8) {
			const body = offset + 4
			if (
				bytes[body] === 0x45 &&
				bytes[body + 1] === 0x78 &&
				bytes[body + 2] === 0x69 &&
				bytes[body + 3] === 0x66 &&
				bytes[body + 4] === 0x00 &&
				bytes[body + 5] === 0x00
			) {
				return true
			}
		}
		offset += 2 + length
	}
	return false
}

/**
 * The stored pixel size of JPEG bytes, read from the frame header. Answers
 * null for non-JPEG input or a missing header. The stored size ignores EXIF
 * orientation, so it names the raw bitmap an engine hands back when it
 * honours a raw decode request.
 */
export function readStoredDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
	let offset = 2
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) return null
		const marker = bytes[offset + 1]
		if (marker === 0xd9 || marker === 0xda) return null
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
		if (length < 2 || offset + 2 + length > bytes.length) return null
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			if (length < 7) return null
			const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
			const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
			if (width <= 0 || height <= 0) return null
			return { width, height }
		}
		offset += 2 + length
	}
	return null
}

/** Whether an orientation swaps width and height. */
function swapped(orientation: number): boolean {
	return orientation >= 5
}

/** Whether the decoded bitmap already carries the rotation, so no transform may run again. */
function alreadyUpright(
	bitmap: ImageBitmap,
	stored: { width: number; height: number } | null,
	orientation: number
): boolean {
	if (!swapped(orientation) || stored === null) return false
	return bitmap.width === stored.height && bitmap.height === stored.width
}

/** Paint the bitmap upright onto a context sized to the target. */
function paintUpright(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	bitmap: ImageBitmap,
	orientation: number,
	width: number,
	height: number
): void {
	context.save()
	switch (orientation) {
		case 2:
			context.setTransform(-1, 0, 0, 1, width, 0)
			break
		case 3:
			context.setTransform(-1, 0, 0, -1, width, height)
			break
		case 4:
			context.setTransform(1, 0, 0, -1, 0, height)
			break
		case 5:
			context.setTransform(0, 1, 1, 0, 0, 0)
			break
		case 6:
			context.setTransform(0, 1, -1, 0, width, 0)
			break
		case 7:
			context.setTransform(0, -1, -1, 0, width, height)
			break
		case 8:
			context.setTransform(0, -1, 1, 0, 0, height)
			break
		default:
			break
	}
	if (swapped(orientation)) context.drawImage(bitmap, 0, 0, height, width)
	else context.drawImage(bitmap, 0, 0, width, height)
	context.restore()
}

interface PaintSurface {
	readonly canvas: HTMLCanvasElement | OffscreenCanvas
	readonly context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
}

/** A drawing surface of the target size, offscreen when the engine offers one. */
function paintSurface(width: number, height: number): PaintSurface {
	const Offscreen = (globalThis as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas
	if (typeof Offscreen !== "undefined") {
		const canvas = new Offscreen(0, 0)
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext("2d")
		if (context) return { canvas, context }
	}
	const documentRef = (globalThis as unknown as { document?: Document }).document
	if (!documentRef) throw new Error("This runtime offers no canvas, so the image cannot be prepared.")
	const canvas = documentRef.createElement("canvas")
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext("2d")
	if (!context) throw new Error("This browser cannot draw the image.")
	return { canvas, context }
}

/** Encode the surface once at a quality. */
async function encodeOnce(
	surface: PaintSurface,
	mime: string,
	quality: number
): Promise<Blob | null> {
	const canvas = surface.canvas
	if (typeof (canvas as OffscreenCanvas).convertToBlob === "function") {
		return (canvas as OffscreenCanvas).convertToBlob({ type: mime, quality })
	}
	const element = canvas as HTMLCanvasElement
	return new Promise<Blob | null>((resolve) => {
		element.toBlob((blob) => resolve(blob), mime, quality)
	})
}

/** Decode raw bytes with no orientation applied, so one transform owns the pixels. */
async function decodeRaw(source: Blob): Promise<ImageBitmap> {
	const options: ImageBitmapOptions = { imageOrientation: "none" }
	const first = (globalThis as unknown as { createImageBitmap?: typeof createImageBitmap }).createImageBitmap
	if (typeof first !== "undefined") return first(source, options)
	const documentRef = (globalThis as unknown as { document?: Document }).document
	if (!documentRef) throw new Error("This runtime cannot decode the image.")
	const url = URL.createObjectURL(source)
	try {
		const image = documentRef.createElement("img")
		await new Promise<void>((resolve, reject) => {
			image.onload = () => resolve()
			image.onerror = () => reject(new Error("This browser cannot decode the image."))
			image.src = url
		})
		const second = (globalThis as unknown as { createImageBitmap?: typeof createImageBitmap })
			.createImageBitmap
		if (typeof second !== "undefined") return second(image, options)
		throw new Error("This runtime cannot decode the image.")
	} finally {
		URL.revokeObjectURL(url)
	}
}

/**
 * Turn any image blob into an upload-ready blob. Applies EXIF orientation so
 * the pixels stand upright, scales the long side to the cap, and re-encodes,
 * which drops EXIF including GPS. Steps quality down until the blob fits the
 * byte ceiling, and keeps the smallest blob when even the floor misses it.
 */
export async function prepareImage(source: Blob, options: PrepareImageOptions = {}): Promise<PreparedImage> {
	const bytes = new Uint8Array(await source.arrayBuffer())
	const orientation = readExifOrientation(bytes)
	const bitmap = await decodeRaw(source)
	try {
		if (bitmap.width <= 0 || bitmap.height <= 0) {
			throw new Error("The image carries no pixels, so it cannot be prepared.")
		}
		// An engine that ignores the raw request hands back rotated pixels.
		// The frame header names the stored size, so the sizes tell the two
		// apart and the rotation runs exactly once either way.
		const stored = readStoredDimensions(bytes)
		const rotated = alreadyUpright(bitmap, stored, orientation)
		const effective = rotated ? 1 : orientation
		const baseWidth = rotated || !swapped(orientation) ? bitmap.width : bitmap.height
		const baseHeight = rotated || !swapped(orientation) ? bitmap.height : bitmap.width
		const target = fitDimensions(baseWidth, baseHeight, options.maxLongSide)
		const mime =
			options.mime ?? (source.type.startsWith("image/") && source.type !== "" ? source.type : "image/jpeg")
		const first = options.quality ?? FIRST_QUALITY
		const floor = options.minQuality ?? LAST_QUALITY
		const surface = paintSurface(target.width, target.height)
		paintUpright(surface.context, bitmap, effective, target.width, target.height)
		let quality = Math.min(1, Math.max(0, first))
		const bottom = Math.min(1, Math.max(0, floor))
		let blob = await encodeOnce(surface, mime, quality)
		if (!blob) throw new Error("This browser cannot encode the image.")
		while (smaller(blob, options.maxBytes) && quality > bottom) {
			quality = Math.max(bottom, quality - QUALITY_STEP)
			const next = await encodeOnce(surface, mime, quality)
			if (!next) break
			blob = next
			if (quality <= bottom) break
		}
		return { blob, width: target.width, height: target.height, mimeType: blob.type || mime }
	} finally {
		bitmap.close()
	}
}
