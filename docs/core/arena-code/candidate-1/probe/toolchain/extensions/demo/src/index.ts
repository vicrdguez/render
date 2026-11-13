import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { obj, str } from "@earendil-works/pi-schema";
import { request } from "tau-core";
import { modelRef } from "tau-kit";

export const ask = defineTool({
	name: "ask",
	description: "Open a decision.",
	parameters: obj({ subject: str() }),
	execute: async (args, api, c) => {
		const opened = await api.commit((tx) => request(tx, `demo:${args.subject}`), c);
		return { output: [{ type: "text", text: `${opened.id} on ${modelRef("faux/m").modelId}` }] };
	},
});

export const extension = defineExtension({ name: "demo", tools: [ask] });
