import type { ExtensionSource } from "./extensions.js";
/**
 * Imports `<directory>/<name>/index.ts` for each extension folder, in name order, on every call.
 * Rejects only when the directory itself is unsafe or unreadable.
 */
export declare function fromDirectory(directory: string): ExtensionSource;
