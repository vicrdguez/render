/**
 * The `web_search` tool, on Webfox's root library (extensions.md: "It is built on Webfox"). Which Webfox version,
 * entry point, and providers is settled in unit 3; Render v1 found that Webfox's own pi-durable adapter lost result
 * content, so this tool calls the library and maps the result to `output` itself.
 *
 * The key stays out of results, entries, events, sections, errors, and logs (extensions.md, "Rules for extension
 * authors"). The tool reads it in its own commit and never echoes a provider's error text unfiltered.
 */

import { defineTool } from "@earendil-works/pi-durable";
import { obj, oneOf, str } from "@earendil-works/pi-schema";
import { options } from "tau-kit";

// ---- Copied from docs/core/extensions.md, "Options and secrets". ----------------------------------------------------

export const WebsearchOptions = options(
	"websearch",
	obj({ provider: oneOf(["exa", "tavily"]), apiKey: str({ format: "secret", minLength: 1 }) }),
);

export const webSearch = defineTool({
	name: "web_search",
	description: "Search the web and return the results with their text.",
	parameters: obj({ query: str({ minLength: 1 }) }),
	// `replay` is the extension's choice: a search changes nothing outside, and a repeat costs one provider call.
	execute: async (args, api, context) => {
		// TODO:
		//   set = await api.commit((tx) => WebsearchOptions.get(tx), context)
		//   no provider or no key: { output: text("websearch is not set up for this project ..."), isError: true }
		//   results = await search(args.query, set)   // Webfox root library; the call is unit 3's first probe
		//   return { output: text(render(results)) }  // never the key, never a raw provider error
		void [args, api, context];
		throw new Error("not implemented");
	},
});
