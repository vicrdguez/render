import { options as defineOptions } from "tau";
import type { Tx } from "tau/durable";
import { int, obj, oneOf, opt, str } from "tau/schema";
import type { Settings, Transport } from "./domain.ts";

export const bool = (annotations: {
	description?: string;
	default?: boolean;
}) => oneOf([false, true], annotations);

const transport = "(exa-mcp|exa|tavily)";

export const options = defineOptions(
	"webkit",
	obj({
		provider: oneOf(["auto", "exa-mcp", "exa", "tavily"], {
			default: "auto",
			description:
				"auto picks keyed Exa, then keyed Tavily, then keyless Exa MCP. Another value pins that transport.",
		}),
		fallbackProviders: str({
			default: "",
			pattern: `^(${transport}(,${transport})*)?$`,
			description:
				"Ordered comma list of transports tried after quota, timeout, network or invalid-response failures.",
		}),
		exaApiKey: opt(str({ format: "secret", minLength: 1 })),
		tavilyApiKey: opt(str({ format: "secret", minLength: 1 })),
		proxy: opt(
			str({
				format: "secret",
				pattern: "^(https?|socks4a?|socks5h?)://[^\\s/?#]+",
				description: "http(s) or socks proxy URL for every request.",
			}),
		),
		curlCommand: opt(
			str({
				minLength: 1,
				description: "Executable for HTTP requests instead of Node fetch.",
			}),
		),
		hostedExtraction: bool({
			default: false,
			description:
				"Retry failed page extraction through Exa contents. Requires exaApiKey.",
		}),
		timeoutMs: int({ minimum: 1_000, maximum: 600_000, default: 60_000 }),
		maxResponseBytes: int({
			minimum: 1_024,
			maximum: 104_857_600,
			default: 5_242_880,
		}),
	}),
);

export async function readSettings(tx: Tx): Promise<Settings> {
	const settings = await options.read(tx).catch(() => {
		throw new Error("invalid webkit options");
	});
	const fallbacks = settings.fallbackProviders
		? (settings.fallbackProviders.split(",") as Transport[])
		: [];
	const routes: string[] = [settings.provider, ...fallbacks];
	if (new Set(fallbacks).size !== fallbacks.length)
		throw new Error("fallbackProviders repeats a transport");
	if (routes.includes("exa") && !settings.exaApiKey)
		throw new Error("exa requires exaApiKey");
	if (routes.includes("tavily") && !settings.tavilyApiKey)
		throw new Error("tavily requires tavilyApiKey");
	if (settings.hostedExtraction && !settings.exaApiKey)
		throw new Error("hostedExtraction requires exaApiKey");
	if (settings.proxy) new URL(settings.proxy);
	return settings;
}
