import { expect, test } from "vitest"
import { fitDimensions, hasExifSegment, readExifOrientation, readStoredDimensions } from "./prepare-image.js"

/** Build minimal JPEG bytes with an EXIF orientation entry in an order. */
function jpegWithOrientation(orientation: number, little: boolean): Uint8Array {
	const tiff = new Uint8Array(8 + 2 + 12 + 4)
	tiff[0] = little ? 0x49 : 0x4d
	tiff[1] = little ? 0x49 : 0x4d
	const put16 = (offset: number, value: number) => {
		if (little) {
			tiff[offset] = value & 0xff
			tiff[offset + 1] = (value >> 8) & 0xff
		} else {
			tiff[offset] = (value >> 8) & 0xff
			tiff[offset + 1] = value & 0xff
		}
	}
	const put32 = (offset: number, value: number) => {
		if (little) {
			tiff[offset] = value & 0xff
			tiff[offset + 1] = (value >> 8) & 0xff
			tiff[offset + 2] = (value >> 16) & 0xff
			tiff[offset + 3] = (value >> 24) & 0xff
		} else {
			tiff[offset] = (value >> 24) & 0xff
			tiff[offset + 1] = (value >> 16) & 0xff
			tiff[offset + 2] = (value >> 8) & 0xff
			tiff[offset + 3] = value & 0xff
		}
	}
	put16(2, 42)
	put32(4, 8)
	put16(8, 1)
	put16(10, 0x0112)
	put16(12, 3)
	put32(14, 1)
	put16(18, orientation)
	put16(20, 0)
	put32(22, 0)
	const prefix = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00])
	const body = new Uint8Array(prefix.length + tiff.length)
	body.set(prefix, 0)
	body.set(tiff, prefix.length)
	const length = body.length + 2
	return new Uint8Array([
		0xff, 0xd8, 0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...body, 0xff, 0xd9
	])
}

test("the orientation reader covers every EXIF value in both orders", () => {
	for (const little of [true, false]) {
		for (let orientation = 1; orientation <= 8; orientation += 1) {
			expect(readExifOrientation(jpegWithOrientation(orientation, little))).toBe(orientation)
		}
	}
})

test("the orientation reader answers one without EXIF", () => {
	expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(1)
	expect(readExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1)
	expect(readExifOrientation(new Uint8Array([]))).toBe(1)
	expect(readExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toBe(1)
})

test("the EXIF probe finds the segment only when it is there", () => {
	expect(hasExifSegment(jpegWithOrientation(6, true))).toBe(true)
	expect(hasExifSegment(jpegWithOrientation(1, false))).toBe(true)
	expect(hasExifSegment(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(false)
	expect(hasExifSegment(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
})

test("the stored size reader finds the frame header", () => {
	// SOI, one APP0 skip, then SOF0 naming 8 by 4.
	const bytes = new Uint8Array([
		0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x04,
		0x00, 0x08, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9
	])
	expect(readStoredDimensions(bytes)).toEqual({ width: 8, height: 4 })
	expect(readStoredDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
	expect(readStoredDimensions(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
})

test("fitDimensions scales the long side and never grows", () => {
	expect(fitDimensions(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 })
	expect(fitDimensions(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 })
	expect(fitDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 })
	expect(fitDimensions(1024, 768, 1024)).toEqual({ width: 1024, height: 768 })
	expect(fitDimensions(4000, 3000)).toEqual({ width: 4000, height: 3000 })
	expect(fitDimensions(3, 2, 1)).toEqual({ width: 1, height: 1 })
})

test("fitDimensions refuses a bad size", () => {
	expect(() => fitDimensions(0, 100, 100)).toThrow(RangeError)
	expect(() => fitDimensions(100, -2, 100)).toThrow(RangeError)
	expect(() => fitDimensions(100, 100, 0)).toThrow(RangeError)
	expect(() => fitDimensions(Number.NaN, 100)).toThrow(RangeError)
})
