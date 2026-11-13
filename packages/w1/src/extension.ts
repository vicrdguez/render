import { defineExtension } from "@earendil-works/pi-durable";
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
import {
	publishBuild,
	publishDesign,
	publishReview,
	showDiff,
	showFile,
} from "./tools.js";

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
