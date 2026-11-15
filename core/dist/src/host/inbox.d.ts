import type { JsonValue } from "@earendil-works/chord/json";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { Projects } from "./projects.js";
/** The open lists of every project, each under its project's name, as one watch. A project that a later `bind`
 * opens arrives as an `s` op. One store's failed watch ends the whole watch as failed. */
export declare function watchInbox(projects: Projects): Promise<WatchHandle<JsonValue>>;
