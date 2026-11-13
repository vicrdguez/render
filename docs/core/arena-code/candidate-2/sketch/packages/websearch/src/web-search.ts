import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { options } from "./index.js";

// Unit 3 resolves Webfox's version, providers and root entry point, then locks that dependency.
// Do not use a Webfox pi-durable adapter without proving it preserves content on 1.5.2.
export const webSearch = defineTool({
	name: "web_search",
	description: "Search the web",
	parameters: obj({ query: str({ minLength: 1 }) }),
	// Unsafe replay is an explicit choice: an interrupted read can be requested again.
	replay: "unsafe",
	async execute(args, api, context) {
		// TODO read current options through api.commit; missing key returns an error result.
		// TODO call Webfox root outside commit. pi-schema validate outside provider data.
		// TODO provider key must never occur in results, entries, errors, sections, events or logs.
		throw new Error("not implemented");
	},
});
export const extension = defineExtension({
	name: "websearch",
	tools: [webSearch],
});
// No tasks, no entry, no particular host knowledge.
