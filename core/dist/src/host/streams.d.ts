import type { ServerResponse } from "node:http";
import type { JsonValue } from "@earendil-works/chord/json";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { EndReason } from "./devices.js";
/** Writes a watch as server-sent events: the value first, then its ops. The watch folds what lands while a write
 * waits to drain. `attach` registers the stream's end with its device. */
export declare function pipe(watch: WatchHandle<JsonValue>, response: ServerResponse, attach: (end: (reason: EndReason) => void) => () => void): void;
