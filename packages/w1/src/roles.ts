import type { ModelRef } from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { prose, type RoleSettings } from "tau-kit";
import { W1 } from "./extension.js";
import { publishBuild, publishReview, showDiff, showFile } from "./tools.js";

const dir = import.meta.dirname;
const designerProse = prose(dir, "designer.md", [])({});
const implementerProse = prose(dir, "implementer.md", [])({});
const reviewerProse = prose(dir, "reviewer.md", [])({});
export const reviseInput = prose(dir, "revise.md", [
	"decision",
	"design",
	"annotations",
]);
export const buildInput = prose(dir, "build.md", [
	"decision",
	"path",
	"branch",
	"design",
	"annotations",
]);
export const reviewInput = prose(dir, "review.md", [
	"sha",
	"build",
	"design",
	"summary",
]);
export const fixInput = prose(dir, "fix.md", ["sha", "review", "findings"]);
export const retryInput = prose(dir, "retry.md", ["decision", "notes"]);

/** The registered coding tool of that name, so a filter names exactly what `coding-tools` installs. */
function coding(name: string) {
	const tool = CodingTools.tools?.find((candidate) => candidate.name === name);
	if (tool === undefined) throw new Error(`coding-tools has no ${name}`);
	return tool;
}
const read = coding("read");
const write = coding("write");
const edit = coding("edit");
const bash = coding("bash");

/** An open role: the project default and W1, without W1's other roles' tools. */
export const designer = (model: ModelRef) =>
	({
		model,
		extensions: { add: [W1] },
		tools: {
			remove: [write, edit, publishBuild, showDiff, showFile, publishReview],
		},
		instructions: designerProse,
	}) satisfies RoleSettings;

export const implementer = (model: ModelRef, cwd: string) =>
	({
		model,
		extensions: [CodingTools, W1],
		tools: [read, write, edit, bash, publishBuild],
		instructions: implementerProse,
		cwd,
	}) satisfies RoleSettings;

export const reviewer = (model: ModelRef) =>
	({
		model,
		extensions: [W1],
		tools: [showDiff, showFile, publishReview],
		instructions: reviewerProse,
	}) satisfies RoleSettings;
