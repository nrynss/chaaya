import type { JobProgress } from "../../../core/progress.js";
import type { JobSnapshot } from "./types.js";
/** Read a Keel job snapshot as the generic progress shape. The snapshot error stays off this reading. */
export declare function toJobProgress(snapshot: JobSnapshot): JobProgress;
