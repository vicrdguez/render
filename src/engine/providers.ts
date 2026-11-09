// The providers Render can register, from pinned Pi AI 1.4.0. Pi stores the ChatGPT login under `openai`.
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

export const PROVIDERS = { anthropic: anthropicProvider, openai: openaiProvider, deepseek: deepseekProvider } as const;
export type ProviderId = keyof typeof PROVIDERS;
export type Family = { readonly name: string; readonly provider: ProviderId; readonly auth: "pi-login" | "api-key" };
