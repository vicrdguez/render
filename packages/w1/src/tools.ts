import type { Context } from "@earendil-works/chord/context";
import {
	defineTool,
	type ToolExecutionApi,
	type ToolExecutionResult,
} from "@earendil-works/pi-durable";
import { arr, int, obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import { modelRef, role } from "tau-kit";
import { emit, request } from "tau-store";
import { diffAt, fileAt, publishedHead } from "./git.js";
import { reviewer } from "./roles.js";
import { designAnswer, fixStart, handoff, reviewStart } from "./tasks.js";
import {
	Build,
	closed,
	Design,
	Merge,
	Owner,
	type Plan,
	Review,
	subject,
	unreplied,
	W1Event,
	W1Options,
	workOf,
} from "./work.js";

type Outcome = { text: string } | { refused: string };

const text = (value: string) => [{ type: "text" as const, text: value }];

/**
 * Runs a publish in one commit under the tool's receipt: a rerun with the same `api.taskId` returns the saved result
 * and writes nothing. Each publish checks the stage, so a cancelled work refuses.
 */
async function publish(
	api: ToolExecutionApi,
	context: Context,
	body: (
		tx: Parameters<Parameters<ToolExecutionApi["commit"]>[0]>[0],
		found: Awaited<ReturnType<typeof workOf>>,
	) => Promise<Outcome>,
): Promise<ToolExecutionResult> {
	const outcome = await api.commit(async (tx): Promise<Outcome> => {
		const found = await workOf(tx, api.conversationId);
		const saved = found.work.receipts[api.taskId];
		if (saved !== undefined) return { text: saved };
		const result = await body(tx, found);
		if ("text" in result) found.work.receipts[api.taskId] = result.text;
		return result;
	}, context);
	return "refused" in outcome
		? { output: text(outcome.refused), isError: true }
		: { output: text(outcome.text), control: { terminate: true } };
}

const replies = opt(arr(obj({ annotation: int({ minimum: 0 }), text: str() })));

/** Rows 2 and 5. */
export const publishDesign = defineTool({
	name: "publish_design",
	description:
		"Publish your design for the owner's review. When you revise, reply to every annotation by its number.",
	parameters: obj({ text: str({ minLength: 1 }), replies }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: (args, api, context) =>
		publish(api, context, async (tx, { k, work }) => {
			if (work.stage !== "designing" && work.stage !== "design_review")
				return { refused: `The design is settled. The work is ${work.stage}.` };
			const missing = await unreplied(tx, work, args.replies);
			if (missing !== undefined) return { refused: missing };
			const design = await tx.appendEntry(Design, k, {
				data: {
					text: args.text,
					...(args.replies && { replies: args.replies }),
				},
			});
			work.stage = "design_review";
			delete work.owes;
			const asked = await request(tx, {
				subject: subject(k, "design"),
				title: "Review the design",
				basis: design,
				choices: ["approve", "revise", "abort"],
				conversation: k,
				then: designAnswer,
				requestedAt: api.now(),
			});
			work.waiting.design = asked.id;
			await emit(tx, W1Event, {
				text: "The design is ready for review.",
				at: api.now(),
				conversation: k,
				stage: work.stage,
			});
			return {
				text: `Published the design for review in decision ${asked.id}. End your turn.`,
			};
		}),
});

/** Rows 11 and 15. The SHA is read from Git here, never taken from the model. */
export const publishBuild = defineTool({
	name: "publish_build",
	description:
		"Publish the commit at the head of your branch for review. The worktree must be clean.",
	parameters: obj({ text: str({ minLength: 1 }), replies }),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: (args, api, context) =>
		publish(api, context, async (tx, { k, work }) => {
			const { plan, accepted } = work;
			if (
				(work.stage !== "building" && work.stage !== "fixing") ||
				plan === undefined ||
				accepted === undefined
			)
				return {
					refused: `Nothing is to be built now. The work is ${work.stage}.`,
				};
			const missing = await unreplied(tx, work, args.replies);
			if (missing !== undefined) return { refused: missing };
			const head = await publishedHead(plan);
			if ("refused" in head) return head;
			const build = await tx.appendEntry(Build, api.conversationId, {
				data: {
					text: args.text,
					design: accepted.design,
					sha: head.sha,
					...(args.replies && { replies: args.replies }),
					...(work.fixes !== undefined && { fixes: work.fixes }),
				},
			});
			if (work.reviewer === undefined) {
				const o = await W1Options.read(tx);
				work.reviewer = await role(tx, reviewer(modelRef(o.reviewer)), {
					kind: "ownerless",
				});
				(await tx.doc(Owner, work.reviewer)).work = k;
			}
			work.candidate = { build: build.id, sha: head.sha };
			delete work.owes;
			delete work.fixes;
			await tx.createTask(
				reviewStart,
				{ build: build.id, reviewer: work.reviewer },
				{
					ownership: { kind: "conversation" },
					conversationId: k,
					background: true,
				},
			);
			await emit(tx, W1Event, {
				text: `Build ${head.sha} is published for review.`,
				at: api.now(),
				conversation: api.conversationId,
				stage: work.stage,
				sha: head.sha,
			});
			return {
				text: `Published ${head.sha} for review as build ${build.id}. End your turn.`,
			};
		}),
});

/** The candidate's SHA and the plan, from Work. The reviewer's tools never take a SHA from the model. */
async function candidateOf(
	api: ToolExecutionApi,
	context: Context,
): Promise<{ plan: Plan; sha: string } | { refused: string }> {
	return api.commit(async (tx) => {
		const { work } = await workOf(tx, api.conversationId);
		if (closed(work)) return { refused: `This work was ${work.stage}.` };
		if (work.plan === undefined || work.candidate === undefined)
			return { refused: "No build is published for review." };
		return { plan: { ...work.plan }, sha: work.candidate.sha };
	}, context);
}

async function readGit(
	api: ToolExecutionApi,
	context: Context,
	read: (plan: Plan, sha: string) => Promise<string>,
): Promise<ToolExecutionResult> {
	const found = await candidateOf(api, context);
	if ("refused" in found) return { output: text(found.refused), isError: true };
	try {
		return { output: text(await read(found.plan, found.sha)) };
	} catch (error) {
		return { output: text((error as Error).message), isError: true };
	}
}

export const showDiff = defineTool({
	name: "show_diff",
	description: "Show the published commit's diff against its base.",
	parameters: obj({}),
	execute: (_args, api, context) => readGit(api, context, diffAt),
});

export const showFile = defineTool({
	name: "show_file",
	description: "Show a file as it is in the published commit.",
	parameters: obj({ path: str({ minLength: 1 }) }),
	execute: (args, api, context) =>
		readGit(api, context, (plan, sha) => fileAt(plan, sha, args.path)),
});

/** Rows 13 and 17. */
export const publishReview = defineTool({
	name: "publish_review",
	description:
		"Publish your review of the published commit: pass or fail, with one finding per problem.",
	parameters: obj({
		text: str({ minLength: 1 }),
		verdict: oneOf(["pass", "fail"]),
		findings: arr(str()),
	}),
	replay: "safe",
	executionMode: "sequential",
	callers: ["model"],
	execute: (args, api, context) =>
		publish(api, context, async (tx, { k, work }) => {
			const { candidate, plan, accepted, implementer } = work;
			if (
				work.stage !== "reviewing" ||
				candidate === undefined ||
				candidate.review !== undefined ||
				plan === undefined ||
				accepted === undefined ||
				implementer === undefined
			)
				return {
					refused: `No build waits for review. The work is ${work.stage}.`,
				};
			const review = await tx.appendEntry(Review, api.conversationId, {
				data: {
					text: args.text,
					build: candidate.build,
					sha: candidate.sha,
					verdict: args.verdict,
					findings: args.findings,
				},
			});
			candidate.review = review.id;
			if (args.verdict === "fail") {
				await tx.createTask(
					fixStart,
					{ review: review.id, implementer },
					{
						ownership: { kind: "conversation" },
						conversationId: k,
						background: true,
					},
				);
				await emit(tx, W1Event, {
					text: `The review of ${candidate.sha} failed.`,
					at: api.now(),
					conversation: api.conversationId,
					stage: work.stage,
					sha: candidate.sha,
				});
				return { text: `Published the review as ${review.id}. End your turn.` };
			}
			const merge = await tx.appendEntry(Merge, k, {
				data: {
					text: `Commit ${candidate.sha} on branch ${plan.branch} builds the approved design and passed review.\n\n${args.text}`,
					design: accepted.design,
					sha: candidate.sha,
					build: candidate.build,
					review: review.id,
					branch: plan.branch,
				},
			});
			work.stage = "merge_review";
			const asked = await request(tx, {
				subject: subject(k, "merge"),
				title: `Hand over ${candidate.sha}`,
				basis: merge,
				choices: ["approve", "abort"],
				conversation: k,
				then: handoff,
				requestedAt: api.now(),
			});
			work.waiting.merge = asked.id;
			await emit(tx, W1Event, {
				text: `The review passed. The hand-over of ${candidate.sha} waits for you.`,
				at: api.now(),
				conversation: k,
				stage: work.stage,
				sha: candidate.sha,
			});
			return { text: `Published the review as ${review.id}. End your turn.` };
		}),
});
