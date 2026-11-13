/**
 * W1's three roles (docs/core/kit.md, "W1's roles on paper"; docs/core/extensions.md, "How an agent gets an
 * extension's tools"). The designer is an open role and removes W1's other tools by name. The implementer and the
 * reviewer are closed roles and name their extensions and tools exactly.
 */

import type { ModelRef } from "@earendil-works/pi-durable";
import {
	CodingTools,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-durable/tools";
import { prose, type RoleSettings } from "tau-kit";
import { extension as W1 } from "./extension.ts";
import { publishBuild, publishReview, showDiff, showFile } from "./tools.ts";

// Loaded when the module loads (docs/core/prose.md, "Prose loads when the module loads").
const designerProse = prose(import.meta.dirname, "../prose/designer.md", []);
const implementerProse = prose(import.meta.dirname, "../prose/implementer.md", []);
const reviewerProse = prose(import.meta.dirname, "../prose/reviewer.md", []);

// The coding tools, for tool filters. A filter is stored by name. TODO (unit 5): confirm that a filter with these
// objects selects the tools `CodingTools` registers, or take them from `CodingTools.tools` by name.
const read = createReadTool();
const write = createWriteTool();
const edit = createEditTool();
const bash = createBashTool();

export const designer = (model: ModelRef) =>
	({
		model,
		extensions: { add: [W1] }, // an open role: the project default, and W1
		tools: { remove: [write, edit, publishBuild, showDiff, showFile, publishReview] },
		instructions: designerProse({}),
	}) satisfies RoleSettings;

export const implementer = (model: ModelRef, cwd: string) =>
	({
		model,
		extensions: [CodingTools, W1],
		tools: [read, write, edit, bash, publishBuild],
		instructions: implementerProse({}),
		cwd,
	}) satisfies RoleSettings;

export const reviewer = (model: ModelRef) =>
	({
		model,
		extensions: [W1],
		tools: [showDiff, showFile, publishReview],
		instructions: reviewerProse({}),
	}) satisfies RoleSettings;
