import type { Context } from "@earendil-works/chord/context";
import {
	AgentDoc,
	type ConversationId,
	configure,
	defineTask,
	type EntryId,
	GenerationTask,
	hook,
	type PhaseHandler,
	type RunningTask,
	runEndTask,
	type TaskRuntime,
	type Tx,
} from "@earendil-works/pi-durable";
import { modelRef, role } from "tau-kit";
import {
	type DecisionInput,
	decision,
	emit,
	request,
	withdraw,
} from "tau-store";
import { branchHead, commitOf, ensureWorktree } from "./git.js";
import {
	buildInput,
	fixInput,
	implementer,
	retryInput,
	reviewInput,
	reviseInput,
} from "./roles.js";
import {
	annotationsOf,
	Build,
	Cancel,
	closed,
	Design,
	expects,
	listed,
	Merge,
	Note,
	Owner,
	owesHandoff,
	Review,
	settle,
	subject,
	W1Event,
	W1Options,
	Work,
	type WorkState,
	workOf,
} from "./work.js";

const done = {
	status: "terminal",
	outcome: { status: "completed", result: null },
} as const;

function aborted<I, S>(
	_task: RunningTask<I, S, null>,
	runtime: TaskRuntime<I, S, null, object>,
	context: Context,
) {
	return runtime.commit(
		() => ({ status: "terminal", outcome: { status: "aborted" } }),
		context,
	);
}

type Act<I> = PhaseHandler<I, { phase: "act" }, { phase: "act" }, null, object>;

function single<I>(name: string, act: Act<I>) {
	return defineTask<I, { phase: "act" }, null>({
		name,
		version: 1,
		initial: () => ({ phase: "act" }),
		phases: { act },
		abort: aborted,
	});
}

const inD = (k: ConversationId) =>
	({
		ownership: { kind: "conversation" },
		conversationId: k,
		background: true,
	}) as const;

/** The stuck decision of a piece of work, on `basis`. Its `then` task is `w1.retry`. */
function stuck(
	tx: Tx,
	k: ConversationId,
	basis: Parameters<typeof request>[1]["basis"],
	at: number,
) {
	return request(tx, {
		subject: subject(k, "stuck"),
		title: "W1 is stuck: retry or abort",
		basis,
		choices: ["retry", "abort"],
		conversation: k,
		then: retry,
		requestedAt: at,
	});
}

/**
 * Row X2, for the abort choice of every decision: a durable cancel before any agent stops. It withdraws the work's
 * other subjects, lists each annotation still owed as not pursued, and creates `w1.stop`.
 */
async function cancel<C extends string>(
	task: RunningTask<DecisionInput<C>, { phase: "act" }, null>,
	runtime: TaskRuntime<DecisionInput<C>, { phase: "act" }, null, object>,
	context: Context,
) {
	const k = runtime.conversationId;
	await runtime.commit(async (tx) => {
		const work = await tx.doc(Work, k);
		if (closed(work)) return done;
		const id = task.input.decision;
		const notPursued = [];
		for (const owed of new Set([work.owes, id])) {
			if (owed === undefined) continue;
			for (const [index, annotation] of (
				await annotationsOf(tx, owed)
			).entries())
				notPursued.push({ decision: owed, annotation: index, text: annotation.text });
		}
		work.stage = "cancelled";
		work.waiting = {};
		work.handled[id] = true;
		for (const name of ["design", "merge", "stuck"] as const)
			await withdraw(tx, subject(k, name));
		await tx.appendEntry(Cancel, k, {
			data: {
				text:
					notPursued.length === 0
						? "Cancelled by the owner."
						: `Cancelled by the owner. Not pursued: ${notPursued.map((n) => n.text).join(" | ")}`,
				notPursued,
			},
		});
		await tx.createTask(stop, {}, inD(k));
		await emit(tx, W1Event, {
			text: "The owner cancelled the work.",
			at: runtime.now(),
			conversation: k,
			stage: work.stage,
		});
		return done;
	}, context);
}

/** Rows 4 and 8, and X2. */
export const designAnswer = single<
	DecisionInput<"approve" | "revise" | "abort">
>("w1.design_answer", async (task, runtime, context) => {
	if (task.input.choice === "abort") return cancel(task, runtime, context);
	const k = runtime.conversationId;
	const id = task.input.decision;
	const designer = await runtime.conversation(k, context);
	await runtime.commit(async (tx) => {
		const work = await tx.doc(Work, k);
		const answered = await decision(tx, id);
		if (!expects(work, "design", id) || answered?.status !== "answered")
			return done;
		const design = await tx.entry(Design, answered.basis);
		if (design === undefined) throw new Error(`No design entry ${answered.basis}`);
		const o = await W1Options.read(tx);
		if (task.input.choice === "revise") {
			await configure(tx, k, { model: modelRef(o.designer) });
			await designer?.submit(tx, {
				type: "input",
				content: reviseInput({
					decision: id,
					design: design.data.text,
					annotations: listed(answered.annotations, design.data.text),
				}),
				requestId: id,
			});
			work.stage = "designing";
			work.owes = id;
			settle(work, "design", id);
			await emit(tx, W1Event, {
				text: "The designer is revising the design.",
				at: runtime.now(),
				conversation: k,
				stage: work.stage,
			});
			return done;
		}
		const repo = (await tx.doc(AgentDoc, k)).cwd;
		if (repo === undefined) throw new Error("The designer has no working directory.");
		work.plan = {
			repo,
			path: `${repo}.w1-${k}`,
			branch: `w1/${k}`,
			base: o.base,
			baseSha: await commitOf(repo, o.base),
		};
		work.accepted = { design: design.id, decision: id };
		work.owes = id;
		work.stage = "preparing";
		settle(work, "design", id);
		await tx.createTask(prepare, {}, inD(k));
		await emit(tx, W1Event, {
			text: `The design is approved. W1 prepares branch ${work.plan.branch} from ${o.base}.`,
			at: runtime.now(),
			conversation: k,
			stage: work.stage,
		});
		return done;
	}, context);
});

type PreparePhase =
	| { phase: "worktree" }
	| { phase: "submit"; implementer: ConversationId };

/** Rows 9 and 10: two commits, since a new conversation takes its first input in the next commit. */
export const prepare = defineTask<
	Record<string, never>,
	PreparePhase,
	null
>({
	name: "w1.prepare",
	version: 1,
	initial: () => ({ phase: "worktree" }),
	phases: {
		worktree: async (_task, runtime, context) => {
			const k = runtime.conversationId;
			const planned = await runtime.snapshot(Work, k, context);
			const mismatch =
				planned?.plan === undefined || closed(planned)
					? undefined
					: await ensureWorktree(planned.plan);
			await runtime.commit(async (tx) => {
				const work = await tx.doc(Work, k);
				const { plan } = work;
				if (closed(work) || plan === undefined) return done;
				if (mismatch !== undefined) {
					const note = await tx.appendEntry(Note, k, {
						data: { text: mismatch },
					});
					work.waiting.stuck = (await stuck(tx, k, note, runtime.now())).id;
					work.retry = "prepare";
					await emit(tx, W1Event, {
						text: `W1 is stuck: ${mismatch}`,
						at: runtime.now(),
						conversation: k,
						stage: work.stage,
						path: plan.path,
					});
					return done;
				}
				const o = await W1Options.read(tx);
				const id = await role(
					tx,
					implementer(modelRef(o.implementer), plan.path),
					{ kind: "ownerless" },
				);
				(await tx.doc(Owner, id)).work = k;
				work.implementer = id;
				return {
					status: "running",
					checkpoint: { phase: "submit", implementer: id },
				};
			}, context);
		},
		submit: async (task, runtime, context) => {
			const k = runtime.conversationId;
			const I = task.state.checkpoint.implementer;
			const handle = await runtime.conversation(I, context);
			await runtime.commit(async (tx) => {
				const work = await tx.doc(Work, k);
				const { accepted, plan } = work;
				if (closed(work) || accepted === undefined || plan === undefined)
					return done;
				const design = await tx.entry(Design, accepted.design);
				if (design === undefined)
					throw new Error(`No design entry ${accepted.design}`);
				await handle?.submit(tx, {
					type: "input",
					content: buildInput({
						decision: accepted.decision,
						path: plan.path,
						branch: plan.branch,
						design: design.data.text,
						annotations: listed(
							await annotationsOf(tx, accepted.decision),
							design.data.text,
						),
					}),
					requestId: accepted.decision,
				});
				work.stage = "building";
				await emit(tx, W1Event, {
					text: "The implementer is building the approved design.",
					at: runtime.now(),
					conversation: I,
					stage: work.stage,
					path: plan.path,
				});
				return done;
			}, context);
		},
	},
	abort: aborted,
});

/** Rows 12 and 16. */
export const reviewStart = single<{ build: EntryId; reviewer: ConversationId }>(
	"w1.review_start",
	async (task, runtime, context) => {
		const k = runtime.conversationId;
		const R = task.input.reviewer;
		const handle = await runtime.conversation(R, context);
		await runtime.commit(async (tx) => {
			const work = await tx.doc(Work, k);
			const { candidate, accepted } = work;
			if (
				closed(work) ||
				(work.stage !== "building" && work.stage !== "fixing") ||
				candidate?.build !== task.input.build ||
				candidate.review !== undefined ||
				accepted === undefined
			)
				return done;
			const build = await tx.entry(Build, candidate.build);
			const design = await tx.entry(Design, accepted.design);
			if (build === undefined || design === undefined)
				throw new Error("The build or its design entry is missing.");
			const o = await W1Options.read(tx);
			await configure(tx, R, { model: modelRef(o.reviewer) });
			await handle?.submit(tx, {
				type: "input",
				content: reviewInput({
					sha: candidate.sha,
					build: String(candidate.build),
					design: design.data.text,
					summary: build.data.text,
				}),
				requestId: String(candidate.build),
			});
			work.stage = "reviewing";
			work.reviewModel = o.reviewer;
			await emit(tx, W1Event, {
				text: `The reviewer is reviewing ${candidate.sha} on ${o.reviewer}.`,
				at: runtime.now(),
				conversation: R,
				stage: work.stage,
				sha: candidate.sha,
			});
			return done;
		}, context);
	},
);

/** Row 14. */
export const fixStart = single<{
	review: EntryId;
	implementer: ConversationId;
}>("w1.fix_start", async (task, runtime, context) => {
	const k = runtime.conversationId;
	const I = task.input.implementer;
	const handle = await runtime.conversation(I, context);
	await runtime.commit(async (tx) => {
		const work = await tx.doc(Work, k);
		if (
			closed(work) ||
			work.stage !== "reviewing" ||
			work.candidate?.review !== task.input.review
		)
			return done;
		const review = await tx.entry(Review, task.input.review);
		if (review === undefined)
			throw new Error(`No review entry ${task.input.review}`);
		const o = await W1Options.read(tx);
		await configure(tx, I, { model: modelRef(o.implementer) });
		await handle?.submit(tx, {
			type: "input",
			content: fixInput({
				sha: review.data.sha,
				review: review.data.text,
				findings: review.data.findings.map((f) => `- ${f}`).join("\n"),
			}),
			requestId: String(review.id),
		});
		work.stage = "fixing";
		work.fixes = review.id;
		await emit(tx, W1Event, {
			text: "The implementer is fixing the review's findings.",
			at: runtime.now(),
			conversation: I,
			stage: work.stage,
		});
		return done;
	}, context);
});

/** Row 19, and X2. Hands over a SHA and never merges. */
export const handoff = single<DecisionInput<"approve" | "abort">>(
	"w1.handoff",
	async (task, runtime, context) => {
		if (task.input.choice === "abort") return cancel(task, runtime, context);
		const k = runtime.conversationId;
		const id = task.input.decision;
		await runtime.commit(async (tx) => {
			const work = await tx.doc(Work, k);
			const answered = await decision(tx, id);
			const { plan, candidate, accepted, implementer: I } = work;
			if (
				!expects(work, "merge", id) ||
				answered?.status !== "answered" ||
				plan === undefined ||
				I === undefined
			)
				return done;
			const merge = await tx.entry(Merge, answered.basis);
			if (merge === undefined) throw new Error(`No merge entry ${answered.basis}`);
			const head = await branchHead(plan);
			const sha = merge.data.sha;
			settle(work, "merge", id);
			if (
				merge.data.design === accepted?.design &&
				sha === candidate?.sha &&
				head === sha
			) {
				work.stage = "handed_over";
				const notActedOn = answered.annotations.map((a) => ({ ...a }));
				await emit(tx, W1Event, {
					text: `Approved. Merge with \`git merge --ff-only ${sha}\`.${notActedOn.length === 0 ? "" : ` Not acted on: ${notActedOn.map((a) => a.text).join(" | ")}`}`,
					at: runtime.now(),
					conversation: k,
					stage: work.stage,
					sha,
					notActedOn,
				});
				return done;
			}
			const note = await tx.appendEntry(Note, I, {
				data: {
					text: `Branch ${plan.branch} moved from ${sha} to ${head} after the review. Nothing was handed over. Publish the new head for review.`,
				},
			});
			work.stage = "fixing";
			work.waiting.stuck = (await stuck(tx, k, note, runtime.now())).id;
			work.retry = I;
			await emit(tx, W1Event, {
				text: `Branch ${plan.branch} moved from ${sha} to ${head}. Nothing was handed over.`,
				at: runtime.now(),
				conversation: I,
				stage: work.stage,
				sha: head,
			});
			return done;
		}, context);
	},
);

/** Row E3, and X2. */
export const retry = single<DecisionInput<"retry" | "abort">>(
		"w1.retry",
		async (task, runtime, context) => {
			if (task.input.choice === "abort") return cancel(task, runtime, context);
			const k = runtime.conversationId;
			const id = task.input.decision;
			const target = (await runtime.snapshot(Work, k, context))?.retry;
			const handle =
				target === undefined || target === "prepare"
					? undefined
					: await runtime.conversation(target, context);
			await runtime.commit(async (tx) => {
				const work = await tx.doc(Work, k);
				if (!expects(work, "stuck", id) || work.retry !== target) return done;
				settle(work, "stuck", id);
				if (target === "prepare") {
					await tx.createTask(prepare, {}, inD(k));
					await emit(tx, W1Event, {
						text: "W1 looks at the worktree again.",
						at: runtime.now(),
						conversation: k,
						stage: work.stage,
					});
					return done;
				}
				if (target === undefined) return done;
				const o = await W1Options.read(tx);
				const model =
					target === k
						? o.designer
						: target === work.implementer
							? o.implementer
							: o.reviewer;
				await configure(tx, target, { model: modelRef(model) });
				const notes = (await annotationsOf(tx, id))
					.map((a) => `- ${a.text}`)
					.join("\n");
				await handle?.submit(tx, {
					type: "input",
					content: retryInput({ decision: id, notes: notes || "(none)" }),
					requestId: id,
				});
				await emit(tx, W1Event, {
					text: "The owner asked the agent to go on.",
					at: runtime.now(),
					conversation: target,
					stage: work.stage,
				});
				return done;
			}, context);
		},
	);

type StopPhase = { phase: "designer" | "implementer" | "reviewer" | "done" };

/** Rows X3 to X6. `background`, so its own abort of D does not reach it. */
export const stop = defineTask<Record<string, never>, StopPhase, null>({
	name: "w1.stop",
	version: 1,
	initial: () => ({ phase: "designer" }),
	phases: {
		designer: (_task, runtime, context) =>
			stopOne(runtime, context, (k) => k, "implementer"),
		implementer: (_task, runtime, context) =>
			stopOne(runtime, context, (_k, work) => work?.implementer, "reviewer"),
		reviewer: (_task, runtime, context) =>
			stopOne(runtime, context, (_k, work) => work?.reviewer, "done"),
		done: (_task, runtime, context) =>
			runtime.commit(async (tx) => {
				const k = runtime.conversationId;
				const work = await tx.doc(Work, k);
				work.stage = "stopped";
				const path = work.plan?.path;
				await emit(tx, W1Event, {
					text:
						path === undefined
							? "The work is stopped."
							: `The work is stopped. The worktree stays at ${path}.`,
					at: runtime.now(),
					conversation: k,
					stage: work.stage,
					...(path !== undefined && { path }),
				});
				return done;
			}, context),
	},
	abort: aborted,
});

async function stopOne(
	runtime: TaskRuntime<Record<string, never>, StopPhase, null, object>,
	context: Context,
	which: (
		k: ConversationId,
		work: Readonly<WorkState> | undefined,
	) => ConversationId | undefined,
	next: StopPhase["phase"],
) {
	const k = runtime.conversationId;
	const id = which(k, await runtime.snapshot(Work, k, context));
	if (id !== undefined) await (await runtime.conversation(id, context))?.abort(context);
	await runtime.commit(
		() => ({ status: "running", checkpoint: { phase: next } }),
		context,
	);
}

/** Row E2: a run that ended in a conversation that still owed its handoff opens the stuck decision on its last words. */
export const ensureHandoff = single<{ answer: EntryId }>(
	"w1.ensure_handoff",
	async (task, runtime, context) => {
		const here = runtime.conversationId;
		await runtime.commit(async (tx) => {
			const { k, work } = await workOf(tx, here);
			if (closed(work) || !owesHandoff(work, k, here)) return done;
			const answer = await tx.entry(task.input.answer);
			const said = (answer?.model ?? [])
				.flatMap((message) =>
					message.role === "assistant"
						? message.content.flatMap((part) =>
								part.type === "text" ? [part.text] : [],
							)
						: [],
				)
				.join("\n")
				.trim();
			const note = await tx.appendEntry(Note, here, {
				data: {
					text: said || "The agent ended its run without a message.",
				},
			});
			work.waiting.stuck = (await stuck(tx, k, note, runtime.now())).id;
			work.retry = here;
			await emit(tx, W1Event, {
				text: "An agent ended its run without handing off.",
				at: runtime.now(),
				conversation: here,
				stage: work.stage,
			});
			return done;
		}, context);
	},
);

export const ensureHandoffHook = hook(GenerationTask, {
	afterRun: (run) => ({
		tasks: [runEndTask(ensureHandoff, { answer: run.answer })],
	}),
});

