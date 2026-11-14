import type { ExtensionModule } from "tau-host";
import * as w1 from "tau-w1";
import * as w2 from "tau-w2";
import * as websearch from "tau-websearch";

export const modules: Readonly<Record<string, ExtensionModule>> = {
	[websearch.extension.name]: websearch,
	[w2.extension.name]: w2,
	[w1.extension.name]: w1,
};
