import type { ExtensionModule } from "tau-host";
import * as w1 from "tau-w1";
import * as w2 from "tau-w2";
import * as websearch from "tau-websearch";

// Only composition knows particular extensions. Unit 2 starts with {}.
// Units 3,4,5 append one import+map member. Host/store source never changes.
export const modules = { websearch, w2, w1 } satisfies Record<
	string,
	ExtensionModule
>;
