// Engine: fixed composition-root runtime configuration. This version installs no Render task definitions and
// performs no role dispatch; later Engine work extends this registry rather than adding a second runtime.
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, type HarnessOptions, type ReportInfo } from "@earendil-works/pi-durable";

export function runtimeOptions(onReport: (error: unknown, info: ReportInfo) => void): HarnessOptions {
	return { models: createModels(), registry: createRegistry(), onReport };
}
