import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import {
	arr,
	compile,
	lit,
	obj,
	oneOf,
	opt,
	str,
} from "@earendil-works/pi-schema";
import { createWebfox } from "webfox";
import { options } from "./options.js";

const response = compile(
	obj({
		schemaVersion: lit(1),
		capability: lit("search"),
		provider: oneOf(["exa", "tavily"]),
		status: lit("ok"),
		results: arr(
			obj({
				input: str(),
				ok: lit(true),
				value: obj({
					results: arr(
						obj(
							{ title: opt(str()), url: str({ minLength: 1 }), snippet: str() },
							{ open: true },
						),
					),
				}),
			}),
			{ minItems: 1, maxItems: 1 },
		),
	}),
);

export function createSearchExtension(
	baseUrls: Partial<Record<"exa" | "tavily", string>> = {},
) {
	return defineExtension({
		name: "websearch",
		tools: [
			defineTool({
				name: "web_search",
				description:
					"Search the web. Returns source URLs, titles and snippets.",
				parameters: obj({ query: str({ minLength: 1 }) }),
				replay: "unsafe",
				async execute(args, api, context) {
					let settings: Awaited<ReturnType<typeof options.read>>;
					try {
						settings = await api.commit((tx) => options.read(tx), context);
					} catch {
						return {
							output: [
								{
									type: "text",
									text: "websearch is not set up for this project. Set provider and apiKey.",
								},
							],
							isError: true,
						};
					}
					try {
						const { provider, apiKey } = settings;
						const baseUrl = baseUrls[provider];
						const web = createWebfox({
							cwd: "/",
							env: {},
							config: {
								execution: { retries: 0 },
								providers: {
									[provider]: {
										credentials: { api: { value: apiKey } },
										...(baseUrl === undefined ? {} : { baseUrl }),
									},
								},
							},
						});
						const document = await web.search({
							provider,
							queries: [args.query],
							maxResults: 5,
							...(context.abortSignal ? { signal: context.abortSignal } : {}),
						});
						if (!response.check(document))
							throw new Error("Invalid search response");
						const results = document.results.flatMap((result) =>
							result.value.results.map((hit) => ({
								...(hit.title === undefined ? {} : { title: hit.title }),
								url: hit.url,
								snippet: hit.snippet,
							})),
						);
						return {
							output: [
								{ type: "text", text: JSON.stringify({ provider, results }) },
							],
						};
					} catch {
						return {
							output: [
								{
									type: "text",
									text: "Web search failed. Check the provider and project options, then try again.",
								},
							],
							isError: true,
						};
					}
				},
			}),
		],
	});
}
