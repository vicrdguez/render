/**
 * W1's tools. Each one that writes declares `replay: "safe"` and keeps a receipt under `api.taskId` (K1). A tool that
 * publishes outside state reads that state itself and declares `executionMode: "sequential"` and `callers: ["model"]`
 * (extensions.md, "Rules for extension authors"; E6). Every tool checks `Work.stage` first.
 */

import { defineTool } from "@earendil-works/pi-durable";
import { arr, int, obj, str } from "@earendil-works/pi-schema";

const notYet = async (): Promise<never> => {
	throw new Error("not implemented");
};

/**
 * Rows 2 and 5: entry V in D → `Work` and the receipt → `request` on `w1:<k>:design` with approve, revise, and abort,
 * `then: w1.design_answer` → `emit`. Refuses a new version until each annotation of the last answer has a reply.
 * The result sets `terminate`.
 */
export const publishDesign = defineTool({
	name: "publish_design",
	description: "Publish the design for the owner's review.",
	parameters: obj({ text: str({ minLength: 1 }), replies: arr(obj({ annotation: int({ minimum: 0 }), text: str() })) }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: notYet,
});

/**
 * Rows 11 and 15: checks the worktree is clean and reads the head SHA itself → entry B in I → `role()` creates R with
 * the reviewer's model (first build only) → `Work`, the candidate, the receipt → `createTask` `w1.review_start` → `emit`.
 */
export const publishBuild = defineTool({
	name: "publish_build",
	description: "Publish the commit at the head of your branch for review.",
	parameters: obj({ text: str({ minLength: 1 }), replies: arr(obj({ annotation: int({ minimum: 0 }), text: str() })) }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: notYet,
});

/** The reviewer's view of the candidate SHA, taken from `Work`, never from the model (row 13). */
export const showDiff = defineTool({
	name: "show_diff",
	description: "Show the diff of the build under review against its base.",
	parameters: obj({}),
	execute: notYet,
});

export const showFile = defineTool({
	name: "show_file",
	description: "Show a file as it is in the build under review.",
	parameters: obj({ path: str({ minLength: 1 }) }),
	execute: notYet,
});

/**
 * Rows 13 and 17. A fail: entry R in R → `Work` and the receipt → `createTask` `w1.fix_start` → `emit`.
 * A pass, and B is still the candidate: entry R → entry M in D → `Work` → `request` on `w1:<k>:merge` with approve and
 * abort, `then: w1.handoff` → `emit`.
 */
export const publishReview = defineTool({
	name: "publish_review",
	description: "Publish your review of the build.",
	parameters: obj({ text: str({ minLength: 1 }), verdict: str({ pattern: "^(pass|fail)$" }), findings: arr(str()) }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: notYet,
});
