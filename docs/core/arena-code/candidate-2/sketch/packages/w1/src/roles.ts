import type { ModelRef } from "@earendil-works/pi-durable";
import {
	CodingTools,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-durable/tools";

const read = createReadTool();
const write = createWriteTool();
const edit = createEditTool();
const bash = createBashTool();

import type { RoleSettings } from "tau-kit";
import { prose } from "tau-kit";
import {
	publishBuild,
	publishDesign,
	publishReview,
	showDiff,
	showFile,
	extension as W1,
} from "./tools.js";

const designerProse = prose(import.meta.dirname, "designer.md", [])({});
const implementerProse = prose(import.meta.dirname, "implementer.md", [])({});
const reviewerProse = prose(import.meta.dirname, "reviewer.md", [])({});

// Settings copied from docs/core/kit.md. No role registry, role IDs or permission claim.
export function designer(model: ModelRef): RoleSettings {
	// TODO {model, extensions:{add:[W1]},
	// tools:{remove:[write,edit,publishBuild,showDiff,showFile,publishReview]}, instructions:designerProse}
	throw new Error("not implemented");
}
export function implementer(model: ModelRef, cwd: string): RoleSettings {
	// TODO {model,extensions:[CodingTools,W1],tools:[read,write,edit,bash,publishBuild],instructions:implementerProse,cwd}
	throw new Error("not implemented");
}
export function reviewer(model: ModelRef): RoleSettings {
	// TODO {model,extensions:[W1],tools:[showDiff,showFile,publishReview],instructions:reviewerProse}
	throw new Error("not implemented");
}
