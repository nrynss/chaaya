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
    readonly maxLongSide?: number;
    /** The container type. Keeps an image type the source names, else writes JPEG. */
    readonly mime?: string;
    /** The first encoder quality, from zero to one. Defaults to 0.92. */
    readonly quality?: number;
    /** The lowest quality the size loop tries before it keeps the smallest blob. Defaults to 0.4. */
    readonly minQuality?: number;
    /** The byte ceiling. Steps quality down until the blob fits. Omit for one encode. */
    readonly maxBytes?: number;
}
/** A blob ready for the one-shot upload path, with its size in pixels. */
export interface PreparedImage {
    /** The re-encoded bytes. Re-encoding drops EXIF, including GPS. */
    readonly blob: Blob;
    /** The output width in pixels. */
    readonly width: number;
    /** The output height in pixels. */
    readonly height: number;
    /** The container type of the blob. */
    readonly mimeType: string;
}
/**
 * The output size for a natural size under a long side cap. Keeps the aspect
 * ratio, never grows, and rounds to whole pixels of at least one. A missing
 * cap keeps the natural size. A non-positive cap is refused.
 */
export declare function fitDimensions(naturalWidth: number, naturalHeight: number, maxLongSide?: number): {
    width: number;
    height: number;
};
/**
 * The EXIF orientation of JPEG bytes, from 1 to 8. Answers 1 when the bytes
 * carry no EXIF orientation, including non-JPEG input and truncated tags. A
 * re-encode drops the segment this reads, so the output never carries it.
 */
export declare function readExifOrientation(bytes: Uint8Array): number;
/**
 * Whether JPEG bytes carry an EXIF segment. Re-encoded output must read
 * false, because the encoder writes no APP1 segment and GPS goes with it.
 */
export declare function hasExifSegment(bytes: Uint8Array): boolean;
/**
 * The stored pixel size of JPEG bytes, read from the frame header. Answers
 * null for non-JPEG input or a missing header. The stored size ignores EXIF
 * orientation, so it names the raw bitmap an engine hands back when it
 * honours a raw decode request.
 */
export declare function readStoredDimensions(bytes: Uint8Array): {
    width: number;
    height: number;
} | null;
/**
 * What the size evidence says about a decoded bitmap for a swapping EXIF
 * orientation. A bitmap matching the stored frame is raw, so the transform
 * must run. A bitmap matching the stored frame swapped is pre-rotated, so
 * the transform must not run again. A square stored frame matches both, so
 * sizes alone cannot tell the two apart and the caller compares pixels. Any
 * other case carries no size evidence, so the transform runs as before.
 */
export type DecodeEvidence = "raw" | "prerotated" | "ambiguous" | "none";
/** Read the size evidence for a decoded bitmap against the stored frame. */
export declare function decodeEvidence(stored: {
    width: number;
    height: number;
} | null, bitmap: {
    width: number;
    height: number;
}, orientation: number): DecodeEvidence;
/**
 * Turn any image blob into an upload-ready blob. Applies EXIF orientation so
 * the pixels stand upright, scales the long side to the cap, and re-encodes,
 * which drops EXIF including GPS. Steps quality down until the blob fits the
 * byte ceiling, and keeps the smallest blob when even the floor misses it.
 */
export declare function prepareImage(source: Blob, options?: PrepareImageOptions): Promise<PreparedImage>;
