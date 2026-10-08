/** Run one cleanup task in the calling component's effect context. */
export declare function runInEffect(task: () => () => void): void;
