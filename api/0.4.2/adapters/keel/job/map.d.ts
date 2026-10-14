import type { JobFrameAction } from "../../../core/job/types.js";
import type { NamedEvent } from "../../../core/sse/frame.js";
import { type JobEvent } from "../wire/index.js";
import { type JobFollower } from "./follow.js";
/** Map Keel's event names onto core actions. Any other name is left out, so the core loop ignores it. */
export declare function keelFrameMap(): Record<string, (frame: NamedEvent) => JobFrameAction>;
/** Whether the follower would keep this frame. This does not record it.
 * The stream pushes the report from `keelOnAccept` only after the action is progress or terminal. */
export declare function keelShouldAccept(follower: JobFollower, frame: NamedEvent): boolean;
/** Record one frame the core stream kept, and return it for the Keel event list. */
export declare function keelOnAccept(follower: JobFollower, frame: NamedEvent): JobEvent | undefined;
