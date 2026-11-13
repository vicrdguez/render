/**
 * The `w1` extension object. Roles name it in `extensions`, and they reach it through this module's live binding:
 * src/roles.ts uses it only inside functions, which run after every module of W1 has loaded.
 */

import { defineExtension, GenerationTask, hook } from "@earendil-works/pi-durable";
import { DesignAnswer, EnsureHandoff, FixStart, Handoff, Prepare, ReviewStart, Stop, StuckAnswer } from "./tasks.ts";
import { publishBuild, publishDesign, publishReview, showDiff, showFile } from "./tools.ts";

export const extension = defineExtension({
	name: "w1",
	tools: [publishDesign, publishBuild, showDiff, showFile, publishReview],
	tasks: [DesignAnswer, Prepare, ReviewStart, FixStart, Handoff, EnsureHandoff, StuckAnswer, Stop],
	hooks: [
		// Rows E1 to E3: a run that ends with a final answer and no handoff gets one `w1.ensure_handoff`, a child of the
		// run. `afterRun` never fires after a failed or stopped run; that is the owner's to continue (walk.md).
		hook(GenerationTask, {
			afterRun: async (run, api) => {
				void [run, api, EnsureHandoff];
				throw new Error("not implemented");
			},
		}),
	],
});
