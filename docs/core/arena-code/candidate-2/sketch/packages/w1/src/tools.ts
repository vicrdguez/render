import {
	defineEntry,
	defineExtension,
	defineTool,
} from "@earendil-works/pi-durable";
import { arr, int, lit, obj, opt, str, union } from "@earendil-works/pi-schema";
import {
	designAnswer,
	ensureHandoff,
	ensureHandoffHook,
	fixStart,
	handoff,
	prepare,
	retry,
	reviewStart,
	stop,
} from "./tasks.js";
import type { BuildData, DesignData, MergeData, ReviewData } from "./work.js";

export const Design = defineEntry<DesignData>("w1.design");
export const Build = defineEntry<BuildData>("w1.build");
export const Review = defineEntry<ReviewData>("w1.review");
export const Merge = defineEntry<MergeData>("w1.merge");
const replies = opt(arr(obj({ annotation: int({ minimum: 0 }), text: str() })));

export const publishDesign = defineTool({
	name: "publish_design",
	description: "Publish a design and request review",
	parameters: obj({ text: str(), replies }),
	replay: "safe",
	async execute(args, api, context) {
		// TODO read receipt under api.taskId; stage + annotation reply coverage before any write.
		// TODO append design, Work+receipt, request approve/revise/abort -> designAnswer, emit.
		// TODO return saved result on replay; terminate is not assumed to end other round calls.
		throw new Error("not implemented");
	},
});
export const publishBuild = defineTool({
	name: "publish_build",
	description: "Publish a clean worktree HEAD for review",
	parameters: obj({ text: str(), replies }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	async execute(args, api, context) {
		// TODO read clean worktree and HEAD yourself, never accept SHA from model.
		// TODO require replies to every annotation on design approval.
		// TODO append Build; first time role(reviewer) creates R ownerless; Work/receipt;
		// create w1.review_start in D background; emit. No submission after creating R.
		throw new Error("not implemented");
	},
});
export const showDiff = defineTool({
	name: "show_diff",
	description: "Read published candidate diff",
	parameters: obj({}),
	async execute(args, api, context) {
		// TODO stage guard, take candidate SHA and baseSha from Work, read Git objects.
		throw new Error("not implemented");
	},
});
export const showFile = defineTool({
	name: "show_file",
	description: "Read a file in published candidate",
	parameters: obj({ path: str() }),
	async execute(args, api, context) {
		// TODO pinned SHA from Work, not working files; validate outside Git output.
		throw new Error("not implemented");
	},
});
export const publishReview = defineTool({
	name: "publish_review",
	description: "Record review of the current candidate",
	parameters: obj({
		text: str(),
		verdict: union([lit("pass"), lit("fail")]),
		findings: arr(str()),
	}),
	replay: "safe",
	async execute(args, api, context) {
		// TODO require candidate still current; append Review tied to Build+SHA; Work+receipt.
		// TODO fail: create fixStart. Pass: append Merge basis in D, request approve/abort -> handoff.
		// Every basis has text. Events use w1.* names and Harness time.
		throw new Error("not implemented");
	},
});
export const extension = defineExtension({
	name: "w1",
	tools: [publishDesign, publishBuild, showDiff, showFile, publishReview],
	tasks: [
		designAnswer,
		prepare,
		reviewStart,
		fixStart,
		handoff,
		retry,
		stop,
		ensureHandoff,
	],
	hooks: [ensureHandoffHook],
});
