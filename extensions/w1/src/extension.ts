import { defineExtension } from "tau/durable";
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
} from "./tasks.ts";
import {
	publishBuild,
	publishDesign,
	publishReview,
	showDiff,
	showFile,
} from "./tools.ts";

export const W1 = defineExtension({
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
