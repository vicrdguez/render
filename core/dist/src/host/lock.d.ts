/** An exclusive transaction on an empty SQLite file. The kernel drops it when the process dies, so a killed server
 * leaves nothing to clean up. Take it before the store opens, and release it after the store closes. */
export declare function acquireLock(file: string): {
    release(): void;
};
