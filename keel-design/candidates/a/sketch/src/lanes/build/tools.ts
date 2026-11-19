/**
 * Build lane tools. The kernel wraps each spec. `publish_build` reads the commit from git in `observe`; the model
 * never names it.
 */
import type { ToolSpec } from "../../kernel/kernel.ts";
import { readPublishable } from "../../repo/index.ts";
import type { BuildEvent, PlanEdit } from "./lane.ts";
import type { Brief, Citation, ItemId } from "./state.ts";

type Replies = readonly { readonly n: number; readonly text: string }[];

export const publishPlan: ToolSpec<{ readonly edits: readonly PlanEdit[]; readonly replies: Replies }, null, BuildEvent> = {
	name: "publish_plan",
	description: "Add, edit, reorder or drop unstarted work items, answering what your input asked of the plan.",
	parameters: undefined,
	roles: ["coordinator"],
	lane: "build",
	gate: "expectation",
	terminate: false,
	event: (args, _facts, self) => ({ kind: "plan_published", edits: args.edits, replies: args.replies, self }),
};

export const briefItem: ToolSpec<{ readonly item: ItemId } & Omit<Brief, "revision">, null, BuildEvent> = {
	name: "brief_item",
	description: "Write the brief for an item that is about to start: evidence that proves it done, and its fences.",
	parameters: undefined,
	roles: ["coordinator"],
	lane: "build",
	gate: "expectation",
	terminate: false,
	event: ({ item, ...brief }, _facts, self) => ({ kind: "briefed", item, brief, self }),
};

export const handoffBuild: ToolSpec<Record<string, never>, null, BuildEvent> = {
	name: "handoff_build",
	description: "Hand the whole build to verification. Every item is merged or dropped.",
	parameters: undefined,
	roles: ["coordinator"],
	lane: "build",
	gate: "expectation",
	terminate: true,
	event: (_args, _facts, self) => ({ kind: "handoff", self }),
};

export const recordRuling: ToolSpec<
	{
		readonly what: string;
		readonly why: string;
		readonly cost: { readonly level: "low" | "medium" | "high"; readonly text: string };
		readonly cites: readonly Citation[];
	},
	null,
	BuildEvent
> = {
	name: "record_ruling",
	description: "Record a decision below the Mandate's line: what, why, what it costs if wrong, and what it follows.",
	parameters: undefined,
	roles: ["worker"],
	lane: "build",
	gate: "binding",
	terminate: false,
	event: (args, _facts, self) => ({ kind: "ruling", ...args, self }),
};

/**
 * `observe` reads the worktree's HEAD, cleanliness, ancestry from the attempt's base, and protected paths touched.
 * The base comes from `world.view("build").attemptOf(self.agent)` and the globs from the bound Mandate, not args.
 */
export const publishBuild: ToolSpec<
	{ readonly summary: string; readonly replies: Replies },
	BuildEvent extends { kind: "build_published"; facts: infer F } ? F : never,
	BuildEvent
> = {
	name: "publish_build",
	description: "Publish the commit at the head of your branch for verification. Commit first; leave the worktree clean.",
	parameters: undefined,
	roles: ["worker"],
	lane: "build",
	gate: "expectation",
	terminate: true,
	observe: async (io, self, _args, world) => {
		// const attempt = world.view("build")?.attemptOf(self.agent)   -> { worktree, base }
		// const protects = world.view("design")?.bound()?.protects
		// return readPublishable(io.exec, attempt.worktree, attempt.base, protects)
		void readPublishable;
		throw new Error("not implemented");
	},
	event: (args, facts, self) => ({ kind: "build_published", summary: args.summary, replies: args.replies, facts, self }),
};

export const buildTools = [publishPlan, briefItem, handoffBuild, recordRuling, publishBuild] as const;
