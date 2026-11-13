/**
 * `websearch`: the first extension that is not a workflow (docs/core/extensions.md, "Web search"). Unit 3.
 *
 * One tool, `web_search`, its options, no task, and no `entry`. It reaches every conversation that follows the project
 * default, and no closed role. The module's members are the host's contract (`ExtensionModule` in tau-core).
 */

import { defineExtension } from "@earendil-works/pi-durable";
import { WebsearchOptions, webSearch } from "./search.ts";

export const extension = defineExtension({ name: "websearch", tools: [webSearch] });

export const options = WebsearchOptions;
