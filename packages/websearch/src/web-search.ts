import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";

export function createSearchExtension(
	_baseUrls: Partial<Record<"exa" | "tavily", string>> = {},
) {
	return defineExtension({
		name: "websearch",
		tools: [
			defineTool({
				name: "web_search",
				description: "Search the web.",
				parameters: obj({ query: str({ minLength: 1 }) }),
				replay: "unsafe",
				async execute() {
					return {
						output: [{ type: "text", text: "Not implemented" }],
						isError: true,
					};
				},
			}),
		],
	});
}
