import type { SessionRecord, StoredChunk, UploadStore } from "./types.js";
/**
 * Keeps pending uploads in IndexedDB, so a reloaded page resumes them.
 *
 * Construction opens nothing, because a server import must stay safe. The
 * first call opens the database and builds its stores.
 */
export declare class IndexedDbStore implements UploadStore {
    #private;
    putSession(record: SessionRecord): Promise<void>;
    latestSession(): Promise<SessionRecord | undefined>;
    deleteSession(id: string): Promise<void>;
    putChunk(chunk: StoredChunk): Promise<void>;
    listChunks(id: string): Promise<StoredChunk[]>;
    deleteChunks(id: string): Promise<void>;
}
