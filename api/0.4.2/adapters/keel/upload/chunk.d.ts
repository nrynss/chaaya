/** The longest chunk an upload sends when a caller names none. */
export declare const defaultChunkSize = 65536;
/** The lowercase hex SHA-256 of one block of bytes, from Web Crypto. */
export declare function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
/**
 * Splits a capture into chunks of one fixed size.
 *
 * A capture hands over uneven blocks, and the protocol wants no chunk longer
 * than the size the upload declared. This buffer keeps whatever a block left
 * over, so a chunk boundary never follows a capture block boundary. flush()
 * releases the short tail, because the last chunk of a capture is short.
 */
export declare class ChunkBuffer {
    #private;
    constructor(size: number);
    /** How many bytes wait for the next chunk boundary. */
    get buffered(): number;
    /** Add one block and return every whole chunk it completed. */
    append(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[];
    /** Release the bytes below one chunk size, or null when none wait. */
    flush(): Uint8Array<ArrayBuffer> | null;
}
