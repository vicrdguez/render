// Engine's fixed role-work definitions. Ledger alone stages these through the composition-root capability;
// no task names or transaction callbacks are part of the command protocol.
import { createHash } from "node:crypto";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { lazyStream, type Provider, Type } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import {
	type ConversationId,
	configure,
	createRegistry,
	defineDoc,
	defineExtension,
	defineTask,
	defineTool,
	GenerationTask,
	type Harness,
	type HarnessOptions,
	hook,
	type JsonObject,
	ProviderDoc,
	type ReportInfo,
	section,
	type TaskId,
	type ToolExecutionApi,
	type Tx,
} from "@earendil-works/pi-durable";
import { Effects, type Source, type SourceReceipt } from "../effects/source.ts";
import { currentChildren, packetRefs, type RoleAssignment, type RoleIntent, sameAgent } from "../kernel/roles.ts";
import { type CatalogResult, requiredCatalogRows, type SelectedCatalog } from "../kernel/verification.ts";
import type { CommandReply, Ledger } from "../ledger/ledger.ts";
import { mintContext } from "../ledger/principals.ts";
import { Meta, RoleBinding, RoleWork, Workflow } from "../ledger/records.ts";
import { type ExecutionResult, type ExecutionScope, type LinuxProfile, Sandboxes, SandboxInputRefusal } from "../sandboxes/sandboxes.ts";
import { selectCatalog } from "./catalog.ts";
import { previewWeb, research, type WebConfig } from "./web.ts";

const ctx = BACKGROUND_CONTEXT;
const scheduling = mintContext({ kind: "host", scope: "scheduling" });
const Budget = defineDoc<{ requests: number[] }>({
	kind: "render.role-budget",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ requests: [] }),
	checkpointWhen: () => true,
});

export type RoleTaskStaging = {
	stage(tx: Tx, intent: RoleIntent, assignment: RoleAssignment): Promise<number>;
	committed(): void;
};
export type RenderRuntimeOptions = HarnessOptions & {
	roleTasks?: RoleTaskStaging;
	bindLedger?(ledger: Ledger, harness: Harness): void;
	beforeResume?(): Promise<void>;
	afterResume?(): void;
};

export type OwnedChecks = {
	root: string;
	repositories: Readonly<Record<string, string>>;
	checks: Readonly<
		Record<
			string,
			{ repository: string; commit: string; profile: LinuxProfile; timeoutMs: number } & (
				| { catalog: true }
				| { argv: string[]; verifierRevision: string }
			)
		>
	>;
};
type EngineConfig = {
	apiKey?: string;
	families?: Readonly<Record<string, string>>;
	provider?: Provider;
	ownedChecks?: OwnedChecks;
	investigations?: { root: string; repositories: Readonly<Record<string, string>> };
	web?: WebConfig;
};

export class Engine {
	#ledger: Ledger | undefined;
	#harness: Harness | undefined;
	#reconciling = false;
	#reconcileAgain = false;
	#ready = false;
	#sessions = new Map<string, { assignment: string; task: number }>();
	readonly #config: EngineConfig;
	readonly #effects: Effects | undefined;
	readonly #investigationEffects: Effects | undefined;
	readonly #sandboxes: Sandboxes | undefined;
	readonly #ownedActive = new Set<string>();
	readonly #roles;
	readonly #run;
	readonly #notify;
	readonly #models;

	constructor(config: EngineConfig = {}) {
		this.#config = config;
		if (config.investigations) this.#investigationEffects = new Effects(config.investigations);
		if (config.ownedChecks) {
			this.#effects = new Effects({ root: `${config.ownedChecks.root}/effects`, repositories: config.ownedChecks.repositories });
			this.#sandboxes = new Sandboxes({
				root: `${config.ownedChecks.root}/sandboxes`,
				authorize: (scope) => {
					const a = this.#assignment(scope.assignment);
					return (
						!!a &&
						a.executing &&
						a.status === "running" &&
						JSON.stringify(this.#scope(a)) === JSON.stringify(scope) &&
						a.executorEpoch === this.#ledger?.status().executorEpoch
					);
				},
			});
		}
		this.#models = createModels({
			authContext: { env: async (name) => (name === "ANTHROPIC_API_KEY" ? config.apiKey : undefined), fileExists: async () => false },
		});
		const provider = config.provider ?? anthropicProvider();
		// The only provider implementation seam: fixtures substitute provider variability, never Ledger or storage.
		this.#models.setProvider({
			...provider,
			streamSimple: (model, transcript, options) =>
				lazyStream(model, async () => {
					let scope = options?.sessionId ? this.#sessions.get(options.sessionId) : undefined;
					if (!scope && this.#harness && options?.sessionId) {
						for (const assignment of this.#assignments()) {
							const session = await this.#harness.snapshot(ProviderDoc, assignment.conversation as ConversationId, ctx);
							if (session?.sessionId === options.sessionId) {
								scope = { assignment: assignment.id, task: 0 };
								break;
							}
						}
					}
					if (!scope || !this.#harness) throw new Error("Role provider request has no trusted scope.");
					const a = this.#assignment(scope.assignment);
					if (!a || this.#configurationBlocker(a)) throw new Error("Role provider configuration is unavailable.");
					await this.render(a);
					let activePacket: string | null | undefined;
					for (const message of transcript.messages)
						if (message.role === "system" && message.sections && Object.hasOwn(message.sections, "role-packet"))
							activePacket = message.sections["role-packet"];
					// Native compaction has a distinct summarizer prompt, not a role request. Accept it only
					// while its actual pinned task is live under this executing assignment's conversation.
					let nativeCompaction = false;
					if (
						transcript.messages[0]?.role === "system" &&
						typeof transcript.messages[0].content === "string" &&
						transcript.messages[0].content.startsWith("You are a context summarization assistant.")
					) {
						const tasks = await this.#harness.commit(
							(tx) => tx.scanTasks({ conversationId: a.conversation as ConversationId, kind: "pi.compaction", status: "running" }, 200),
							ctx,
						);
						const compact = tasks.items.find(
							(task) =>
								task.kind === "pi.compaction" &&
								task.state.status !== "terminal" &&
								(task.state.checkpoint as { phase?: string }).phase === "summarize",
						);
						if (compact) {
							nativeCompaction = true;
							scope.task = compact.id;
						}
					}
					if (!nativeCompaction && !activePacket?.includes(JSON.stringify(a.packet)))
						throw new Error("Mandatory role packet is absent from effective provider context.");
					if (model.provider !== a.packet.provider || model.id !== a.packet.model)
						throw new Error("Role model differs from pinned packet.");
					if (Buffer.byteLength(JSON.stringify(transcript)) > a.packet.maxInputBytes)
						throw new Error("Required packet and transcript exceed maxInputBytes; no obligations were dropped.");
					await this.#harness.commit(async (tx) => {
						const work = await tx.doc(RoleWork);
						const current = work.assignments.find((x) => x.id === a.id);
						const meta = await tx.doc(Meta);
						if (
							!current ||
							current.status !== "running" ||
							!current.executing ||
							current.executorEpoch !== meta.executorEpoch ||
							current.generation !== a.generation
						)
							throw new Error("Role provider admission is fenced.");
						const budget = await tx.doc(Budget, a.conversation as ConversationId);
						if (!budget.requests.includes(scope.task)) {
							if (budget.requests.length >= a.packet.maxTurns) throw new Error("Role turn budget exhausted.");
							budget.requests.push(scope.task);
						}
					}, ctx);
					return provider.streamSimple(model, transcript, { ...options, maxTokens: a.packet.maxOutputTokens });
				}),
		});
		const schema = <T extends Record<string, ReturnType<typeof Type.String>>>(fields: T) =>
			Type.Object(fields, { additionalProperties: false });
		const tool = (name: string, parameters: ReturnType<typeof Type.Object>, make: (args: Record<string, string>) => JsonObject) =>
			defineTool({
				name,
				description: `Scoped Ledger ${name}; no inline effects.`,
				parameters,
				replay: "safe",
				execute: async (args, api, _context) => {
					const command = make(args as Record<string, string>);
					const reply = await this.#toolCommand(api, name, command);
					return {
						output: [{ type: "text" as const, text: JSON.stringify(reply) }],
						isError: reply.status !== "accepted",
						...(reply.status === "accepted" &&
						(name === "request_role" ||
							name === "submit_role_result" ||
							name === "request_own_stop" ||
							command.type === "requestCheckpointReview")
							? { control: { handoff: `${name} durably accepted.` } }
							: {}),
					};
				},
			});
		const checkpoint = tool(
			"checkpoint",
			schema({
				command: Type.String({
					description:
						"JSON checkpoint command: requestCheckpoint, stageCheckpoint, requestCheckpointReview, emitCheckpoint or reworkCheckpoint. Human decisions are forbidden.",
				}),
			}),
			(args) => JSON.parse(args.command!) as JsonObject,
		);
		const request = tool(
			"request_role",
			Type.Object({ key: Type.String(), request: Type.Optional(Type.String()) }, { additionalProperties: false }),
			(args) => ({ type: "requestRole", key: args.key!, ...(args.request ? { request: args.request } : {}) }),
		);
		const submit = defineTool({
			name: "submit_role_result",
			description:
				"Submit own report. Required supports lists every relied-on web evidence revision, including negative/conflicting context. Promote exact passages first; use [] only to explicitly declare no web reliance.",
			parameters: Type.Object(
				{
					text: Type.String(),
					supports: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), { maxItems: 32 }),
					verification: Type.Optional(
						Type.Object(
							{
								outcome: Type.Union([Type.Literal("pass"), Type.Literal("non-pass")]),
								rank: Type.Union([Type.String(), Type.Null()]),
								reason: Type.String(),
							},
							{ additionalProperties: false },
						),
					),
				},
				{ additionalProperties: false },
			),
			replay: "safe",
			execute: async (args, api) => {
				const reply = await this.#toolCommand(api, "submit_role_result", { type: "submitRoleResult", ...args });
				return {
					output: [{ type: "text", text: JSON.stringify(reply) }],
					isError: reply.status !== "accepted",
					...(reply.status === "accepted" ? { control: { handoff: "Report durably accepted." } } : {}),
				};
			},
		});
		const stop = tool("request_own_stop", schema({}), () => ({ type: "requestOwnStop" }));
		const read = defineTool({
			name: "read_artifact",
			description: "Read only immutable artifacts granted by this packet.",
			parameters: schema({ ref: Type.String() }),
			replay: "safe",
			execute: async (args, api) => {
				const identity = await this.#identity(api, "read_artifact");
				const reply =
					"code" in identity
						? identity
						: (args.ref as string).startsWith("web:")
							? { code: "use_scoped_web_paging" }
							: await this.#ledger!.artifact(identity.context, { read: args.ref as string });
				return {
					output: [{ type: "text", text: "content" in reply ? reply.content.toString("utf8") : JSON.stringify(reply) }],
					isError: !("content" in reply),
				};
			},
		});
		const webTools = (["search", "contents"] as const).map((capability) =>
			defineTool({
				name: `web_${capability}`,
				description:
					"Bounded web observation. Untrusted web text; promote exact support before reliance. Interruption never replays paid work.",
				parameters: Type.Object(
					capability === "search"
						? { queries: Type.Array(Type.String({ minLength: 1, maxLength: 2048 }), { minItems: 1, maxItems: 4 }) }
						: { urls: Type.Array(Type.String({ minLength: 1, maxLength: 2048 }), { minItems: 1, maxItems: 4 }) },
					{ additionalProperties: false },
				),
				replay: "unsafe",
				execute: async (args, api, context) => {
					const identity = await this.#identity(api, `web_${capability}`);
					const output = (value: unknown, isError = false) => ({
						output: [{ type: "text" as const, text: JSON.stringify(value) }],
						isError,
					});
					if ("code" in identity) return output(identity, true);
					const a = identity.a;
					const current = () => {
						const now = this.#assignment(a.id);
						return (
							!!now &&
							sameAgent(now, {
								kind: "assignment-agent",
								assignment: a.id,
								generation: a.generation,
								attempt: a.attempt,
								role: a.packet.role,
							}) &&
							now.status === "running" &&
							now.executing &&
							now.executorEpoch === this.#ledger!.status().executorEpoch &&
							this.#ledger!.status().hostMode === "active"
						);
					};
					if (!current()) return output({ status: "refused", code: "stale_assignment" }, true);
					const inputs = (capability === "search" ? args.queries : args.urls) as string[];
					const normalized: string[] = [];
					for (const input of inputs) {
						if (capability === "search") normalized.push(input.trim());
						else {
							try {
								const url = new URL(input);
								if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
								normalized.push(url.href);
							} catch {
								return output({ status: "refused", code: "invalid_url" }, true);
							}
						}
					}
					if (normalized.some((s) => !s)) return output({ status: "refused", code: "invalid_input" }, true);
					const result = await research(
						this.#config.web ?? {},
						capability,
						normalized,
						{ assignment: a.id, generation: a.generation, attempt: a.attempt },
						context.abortSignal ?? new AbortController().signal,
						current,
					);
					const saved = await this.#ledger!.artifact(scheduling, { upload: { webWorking: result } });
					return output({ ...previewWeb(result), ...("code" in saved ? { handle: undefined, workingUnavailable: saved.code } : {}) });
				},
			}),
		);
		const webRead = defineTool({
			name: "read_web_result",
			description: "Read own expiring full web envelope without network. Offsets are UTF-16 characters.",
			parameters: Type.Object(
				{
					handle: Type.String({ maxLength: 128 }),
					offset: Type.Optional(Type.Integer({ minimum: 0 })),
					limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 16384 })),
				},
				{ additionalProperties: false },
			),
			replay: "safe",
			execute: async (args, api) => {
				const identity = await this.#identity(api, "read_web_result");
				const reply =
					"code" in identity
						? identity
						: !args.handle.startsWith("web:")
							? { code: "invalid_working_handle" }
							: await this.#ledger!.artifact(identity.context, { read: args.handle });
				const text = "content" in reply ? reply.content.toString("utf8") : undefined;
				const offset = args.offset ?? 0;
				const limit = args.limit ?? 16384;
				return {
					output: [
						{
							type: "text",
							text: JSON.stringify(
								text === undefined
									? reply
									: {
											text: text.slice(offset, offset + limit),
											next: offset + limit < text.length ? offset + limit : null,
											total: text.length,
										},
							),
						},
					],
					isError: text === undefined,
				};
			},
		});
		const retain = defineTool({
			name: "retain_web_evidence",
			description:
				"Retain exact passage and context for a claim, including negative/conflicting evidence. Offsets are UTF-16 characters in observation text.",
			parameters: Type.Object(
				{
					handle: Type.String(),
					observation: Type.String(),
					start: Type.Integer({ minimum: 0 }),
					end: Type.Integer({ minimum: 1 }),
					claim: Type.String({ minLength: 1, maxLength: 2048 }),
					stance: Type.Union([Type.Literal("supporting"), Type.Literal("negative"), Type.Literal("conflicting")]),
				},
				{ additionalProperties: false },
			),
			replay: "safe",
			execute: async (args, api) => {
				const reply = await this.#toolCommand(api, "retain_web_evidence", { type: "retainWebEvidence", ...args });
				return { output: [{ type: "text", text: JSON.stringify(reply) }], isError: reply.status !== "accepted" };
			},
		});
		this.#roles = defineExtension({
			name: "render.roles",
			tools: [read, request, submit, stop, checkpoint, ...webTools, webRead, retain],
			sections: [
				section("role-packet", async (input) => {
					const binding = await input.read.snapshot(RoleBinding, input.conversationId, ctx);
					const a = binding ? this.#assignment(binding.assignment) : undefined;
					if (!a) throw new Error("No role assignment");
					return this.render(a);
				}),
			],
			hooks: [
				hook(GenerationTask, {
					beforeRequest: async (_request, api) => {
						const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
						const session = await api.snapshot(ProviderDoc, api.conversationId, ctx);
						if (binding && session) this.#sessions.set(session.sessionId, { assignment: binding.assignment, task: api.taskId });
					},
					afterTools: async (assistant, _results, api) => {
						const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
						const a = binding ? this.#assignment(binding.assignment) : undefined;
						if (a) await this.#command(a, { type: "recordRuntimeHistory", key: `tools:${api.taskId}:${assistant}` });
					},
				}),
			],
		});
		this.#run = defineTask<
			{ assignment: string },
			({ phase: "run"; round: number } | { phase: "resume"; round: number } | { phase: "wait"; submission: number; round: number }) & {
				consumed?: string[];
				observingExecutorEpoch?: string;
			},
			null
		>({
			name: "render.role-work",
			version: 1,
			initial: () => ({ phase: "run", round: 0 }),
			phases: {
				run: async (task, runtime, context) => {
					// Reattaching an interrupted scheduling wait is progress, not another failed execution.
					// Commit the fresh startup identity once; idle observation must not write heartbeats.
					await runtime.commit(async (tx, current) => {
						const { executorEpoch } = await tx.doc(Meta);
						if (current.state.checkpoint.observingExecutorEpoch !== executorEpoch)
							return { status: "running", checkpoint: { ...current.state.checkpoint, observingExecutorEpoch: executorEpoch } };
					}, context);
					const round = task.state.checkpoint.round;
					for (;;) {
						await this.#waitUntil(runtime.signal, () => {
							const a = this.#assignment(task.input.assignment);
							return (
								!a ||
								a.status === "submitted" ||
								a.status === "canceled" ||
								a.status === "running" ||
								(a.status === "queued" && this.#assignments().filter((a) => a.executing).length < 4)
							);
						});
						const a = this.#assignment(task.input.assignment);
						if (!a || a.status === "submitted" || a.status === "canceled")
							return runtime
								.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context)
								.then(() => this.reconcile());
						const blocker = this.#configurationBlocker(a);
						let prompt: string;
						let inputBlocker: string | undefined;
						try {
							if (!blocker && a.packet.investigation) await this.#prepareInvestigation(a);
							prompt = blocker ? "" : await this.render(a);
						} catch (error) {
							prompt = "";
							if (a.packet.verification) inputBlocker = `verification_unrun: ${error}`.slice(0, 1900);
							if (a.packet.investigation) inputBlocker = `investigation_input_unavailable: ${error}`.slice(0, 1900);
						}
						if (blocker || !prompt || Buffer.byteLength(prompt) > a.packet.maxInputBytes) {
							await this.#command(a, { type: "recordBlocker", reason: blocker ?? inputBlocker ?? "required_inputs_do_not_fit" });
							return runtime
								.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context)
								.then(() => this.reconcile());
						}
						if (a.status !== "running") {
							const started = await this.#command(a, { type: "stageTask", executorEpoch: this.#ledger!.status().executorEpoch });
							if (started.status !== "accepted") {
								if (started.code !== "capacity_exhausted" && this.#assignment(a.id)?.status === "queued")
									await this.#command(a, { type: "recordBlocker", reason: started.code });
								continue;
							}
						}
						if (a.packet.execution === "linux-writer") {
							await this.#ownedCheck(this.#assignment(a.id)!);
							return runtime
								.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context)
								.then(() => this.reconcile());
						}
						const conversation = await runtime.conversation(a.conversation as ConversationId, context);
						if (!conversation) throw new Error("Missing role conversation");
						const input = await conversation.submit({ type: "input", requestId: `role:${a.attempt}:${round}`, content: prompt }, context);
						return runtime.commit(
							() => ({
								status: "running",
								checkpoint: {
									phase: "wait",
									submission: input.id,
									round,
									consumed: task.state.checkpoint.consumed ?? [],
								},
							}),
							context,
						);
					}
				},
				wait: async (task, runtime, context) => {
					if (task.state.checkpoint.phase !== "wait") throw new Error("wrong phase");
					const submission = await this.#harness!.submission(task.state.checkpoint.submission as never, context);
					if (!submission) throw new Error("Missing role submission");
					await submission.wait(context);
					const a = this.#assignment(task.input.assignment);
					// Results already delivered to a prior round cannot trigger another continuation.
					const children = a
						? currentChildren(this.#assignments(), a.id).filter((child) => !task.state.checkpoint.consumed?.includes(child.id))
						: [];
					if (a) {
						if (a.status === "running")
							await this.#command(a, { type: "recordBlocker", reason: children.length ? "awaiting_role_results" : "role_did_not_submit" });
						await this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "absent", effects: "reconciled" });
					}
					if (a && children.length && this.#assignment(a.id)?.blocker === "awaiting_role_results")
						return runtime.commit(
							() => ({ status: "running", checkpoint: { phase: "resume", round: task.state.checkpoint.round } }),
							context,
						);
					return runtime
						.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context)
						.then(() => this.reconcile());
				},
				resume: async (task, runtime, context) => {
					await runtime.commit(async (tx, current) => {
						const { executorEpoch } = await tx.doc(Meta);
						if (current.state.checkpoint.observingExecutorEpoch !== executorEpoch)
							return { status: "running", checkpoint: { ...current.state.checkpoint, observingExecutorEpoch: executorEpoch } };
					}, context);
					await this.#waitUntil(runtime.signal, () => {
						const a = this.#assignment(task.input.assignment);
						return (
							!a ||
							a.status === "canceled" ||
							a.status === "submitted" ||
							a.status === "queued" ||
							a.status === "running" ||
							(a.status === "blocked" &&
								a.blocker === "awaiting_role_results" &&
								!a.executing &&
								currentChildren(this.#assignments(), a.id).every((child) => child.status === "submitted"))
						);
					});
					const a = this.#assignment(task.input.assignment);
					if (!a || a.status === "canceled" || a.status === "submitted")
						return runtime
							.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context)
							.then(() => this.reconcile());
					const round = task.state.checkpoint.round;
					// A crash may leave the accepted rebind ahead of this task's checkpoint.
					if (a.status !== "queued" && a.status !== "running") {
						const rebound = await this.#command(a, {
							type: "rebindAttempt",
							providerIdle: true,
							environment: "absent",
							effects: "reconciled",
							executorEpoch: this.#ledger!.status().executorEpoch,
						});
						if (rebound.status !== "accepted") throw new Error(`Role continuation refused: ${rebound.code}`);
					}
					return runtime.commit(
						() => ({
							status: "running",
							checkpoint: {
								phase: "run",
								round: round + 1,
								consumed: currentChildren(this.#assignments(), a.id).map((child) => child.id),
							},
						}),
						context,
					);
				},
			},
			abort: (_task, runtime, context) =>
				runtime.commit(
					() => ({
						status: "terminal",
						outcome: { status: "orphaned", reason: "Role task abort is not proof of environment/effect quiescence." },
					}),
					context,
				),
		});
		this.#notify = defineTask<{ assignment: string; parent: number; report: string }, { phase: "notify" }, null>({
			name: "render.role-notification",
			version: 1,
			initial: () => ({ phase: "notify" }),
			phases: {
				notify: (_task, runtime, context) =>
					runtime.commit(async (tx) => {
						await tx.appendEntry(_task.input.parent as ConversationId, {
							kind: "render.role-result",
							data: { assignment: _task.input.assignment, report: _task.input.report },
						});
						return { status: "terminal", outcome: { status: "completed", result: null } };
					}, context),
			},
			abort: (_task, runtime, context) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
		});
	}

	options(onReport: (error: unknown, info: ReportInfo) => void): RenderRuntimeOptions {
		const registry = createRegistry();
		registry.install(this.#roles);
		registry.install(defineExtension({ name: "render.tasks", tasks: [this.#run, this.#notify] }));
		return {
			models: this.#models,
			registry,
			settings: { extensions: [], retry: { maxRetries: 0 }, compaction: { enabled: true, backgroundTokens: 0 } },
			onReport: (error, info) => {
				onReport(error, info);
				if (info.type === "task_faulted" && this.#ready) {
					const a = this.#assignments().find((a) => a.task === info.task.id || a.conversation === info.task.conversationId);
					if (a && a.status !== "submitted" && a.status !== "canceled")
						void this.#command(a, { type: "recordBlocker", reason: "runtime_task_faulted_reconciliation_required" }).catch(() => {});
				}
			},
			bindLedger: (ledger, harness) => {
				this.#ledger = ledger;
				this.#harness = harness;
			},
			afterResume: () => {
				this.#ready = true;
				void this.reconcile().catch(() => {});
			},
			beforeResume: async () => {
				for (const a of this.#assignments()) {
					if (!a.executing || a.packet.execution !== "linux-writer" || !this.#sandboxes) continue;
					try {
						const scope = this.#scope(a, a.status === "canceling");
						const stopped = await this.#sandboxes.stop({ scope });
						for (const diagnostic of stopped.executions) await this.#diagnostic(a, scope, stopped.source, diagnostic.result, diagnostic);
						if (a.status === "running")
							await this.#command(a, { type: "recordBlocker", reason: "owned_check_interrupted_source_evidence_requires_reconciliation" });
						await this.#command(this.#assignment(a.id)!, {
							type: "recordQuiescence",
							providerIdle: true,
							environment: "stopped",
							effects: "reconciled",
						});
					} catch {
						await this.#command(a, { type: "recordBlocker", reason: "owned_check_quarantined_stop_unconfirmed" });
					}
				}
				for (const a of this.#assignments())
					if (a.executing && a.status === "running" && a.packet.execution === "read-only")
						await this.#command(a, {
							type: "rebindAttempt",
							providerIdle: true,
							environment: "absent",
							effects: "reconciled",
							executorEpoch: this.#ledger!.status().executorEpoch,
						});
			},
			roleTasks: {
				stage: async (tx, intent, a) => {
					const workflow = await tx.doc(Workflow, a.workflow, null);
					if (!workflow.exists) throw new Error("Missing workflow owner");
					if (intent.kind === "notify-role") {
						const state = await tx.doc(RoleWork);
						const parent = state.assignments.find((p) => p.id === a.parent);
						if (!parent || !a.report) throw new Error("Missing result parent");
						return tx.createTask(
							this.#notify,
							{ assignment: a.id, parent: parent.conversation, report: a.report },
							{ conversationId: workflow.conversation as ConversationId, ownership: { kind: "conversation" } },
						);
					}
					await configure(tx, a.conversation as ConversationId, {
						model: { provider: a.packet.provider, modelId: a.packet.model },
						thinkingLevel: a.packet.thinking,
						extensions: [this.#roles],
						tools: this.#roles.tools ?? [],
						modelTools: this.#roles.tools ?? [],
						instructions: `Role ${a.packet.role}. Required output: ${a.packet.expectedOutput}. Submit only via ${a.packet.submission}.`,
						cwd: null,
					});
					return tx.createTask(
						this.#run,
						{ assignment: a.id },
						{ conversationId: workflow.conversation as ConversationId, ownership: { kind: "conversation" } },
					);
				},
				committed: () => {
					queueMicrotask(() => {
						void this.reconcile().catch(() => {});
					});
				},
			},
		};
	}

	async render(a: RoleAssignment): Promise<string> {
		if (!this.#ledger) throw new Error("Engine not bound");
		const current = this.#assignment(a.id);
		if (!current || current.generation !== a.generation || current.attempt !== a.attempt || current.packetRef !== a.packetRef)
			throw new Error("Stale role packet or assignment; render the current binding.");
		const context = mintContext({
			kind: "assignment-agent",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			role: a.packet.role,
		});
		const retained = await this.#ledger.artifact(context, { read: a.packetRef });
		if (!("content" in retained) || retained.content.toString("utf8") !== JSON.stringify(a.packet))
			throw new Error(`Restore exact packet ${a.packetRef}; binding is missing, corrupt or incompatible.`);
		const inputs: { ref: string; text: string }[] = [];
		if (a.packet.investigation && !current.investigationSource)
			throw new Error("Required investigation source observation is unavailable.");
		for (const ref of [...packetRefs(a.packet), ...(current.investigationSource ? [current.investigationSource] : [])]) {
			const value = await this.#ledger.artifact(context, { read: ref });
			if (!("content" in value)) throw new Error(`Required exact input ${ref}: ${value.code}`);
			inputs.push({ ref, text: value.content.toString("utf8") });
		}
		const results = currentChildren(this.#assignments(), a.id)
			.filter((child) => child.status === "submitted")
			.map((child) => ({ assignment: child.id, report: child.report }));
		const frame = this.#ledger.snapshot(scheduling);
		if (!("policy" in frame)) throw new Error("Current policy is unavailable.");
		const policy = frame.policy as import("../kernel/policy.ts").PolicyState;
		const binding = policy.bindings[a.workflow];
		if (!binding || (a.policyBinding !== undefined && a.policyBinding !== binding.revision))
			throw new Error("Stale workflow policy binding.");
		let verification: SelectedCatalog | undefined;
		if (a.packet.verification) {
			if (!this.#effects) throw new Error("Verification catalog trusted source capability unavailable.");
			const source = await this.#effects.perform({
				type: "resolve",
				repository: a.packet.verification.repository,
				commit: a.packet.verification.commit,
			});
			verification = selectCatalog(source, a.packet.verification);
		}
		const workflow = (frame.workflows as import("../kernel/kernel.ts").WorkflowView[]).find((w) => w.workflow === a.workflow);
		const checkpointState = a.packet.role === "coordinator" && !a.packet.investigation && workflow ? workflow.checkpoints : undefined;
		return JSON.stringify({
			...(checkpointState
				? {
						checkpoints: {
							requests: checkpointState.requests.filter((r) => a.packet.inputs.includes(r.scope)),
							concerns: checkpointState.concerns.filter((c) =>
								checkpointState.requests.some((r) => r.id === c.request && a.packet.inputs.includes(r.scope)),
							),
						},
					}
				: {}),
			...(verification ? { verification } : {}),
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			packet: a.packet,
			...(a.checkpointCandidate
				? {
						checkpointCandidate: {
							...a.checkpointCandidate,
							instructions:
								"Independently answer the common bounded question in Ground and shared inputs under your own packet conditions. Own draft only; no winner, approval, source writes or delegated roles. Submit JSON {schema:1,answer,assumptions:[],consequences:[],incidentalChoices:[]}; disclose what you decided beyond the question. No parent or sibling context is inherited.",
						},
					}
				: {}),
			...(a.checkpointReview
				? {
						checkpointReview: {
							...a.checkpointReview,
							instructions:
								"Fresh non-fork exact-revision challenge. Read the full emission, manifest, Ground, principles and saved concerns. Assess alternatives, interactions, scale, usage, incidental choices, and nearby-example copying. Judge genuinely different decompositions, dependency categories, verification seams, depth/locality/deletion and what was decided beyond the question; typed lint is not merit. Submit JSON schema:1, emission, manifest, annotations, checks:{alternatives,interactions,scale,usage,incidentalChoices,nearbyCopying} with reasoned text, objections:[{id,node,reason}]. No approval authority.",
						},
					}
				: {}),
			...(a.packet.role === "coordinator" && !a.packet.investigation
				? {
						checkpointInstructions:
							"Use checkpoint with a JSON command. requestCheckpoint: {stage:'seams'|'modules',scope:humanGroundRef,required:{candidates:boolean,experiment:boolean}}. Preserve its request identity through rework/retry. For required candidates, configure at least two read-only candidate packets with common Ground/inputs and distinct conditions. Call request_role {key,request} for each captured candidate key. Wait for all answers, read and cite every report in the synthesis manifest before staging or challenge. Required unavailable evidence blocks, never waive it. stageCheckpoint: {request,text:completeMarkdown,manifest:{schema:1,stage,nodes:[{id,decision,rationale,alternatives,evidence,classification,default}],decompositions:[{id,modules,dependencies,verificationSeams,depth,locality,deletion}],verificationStrategy,incidentalChoices,responses:[{concern,disposition,reason,resulting:nodeId}]}}. Seams compares genuinely different decompositions. Request exact fresh challenge with requestCheckpointReview:{request,key:configuredChallengerKey}; retrieve the child report. emitCheckpoint:{request,review:reportRef,contested:[{objection,disposition,reason,resulting:nodeId}]} answers every objection. Changed text needs a new stage and review. Human concerns must all survive and receive reasoned mappings. reworkCheckpoint requires saved concerns/reason. Never treat Markdown identity fields or save as consent; only human approval accepts original emitted bytes.",
					}
				: {}),
			...(a.packet.investigation
				? {
						playbook: {
							shape: "investigation",
							instructions:
								"Read the complete scoped source, context, ADRs, full principles and verification instructions in inputs. Preserve human Ground separately from suggestions. No source writes, implementation commitment, delivery roles or publication. A model assertion is not execution evidence. Submit JSON with schema:1, outcome:'finding'|'escalation', summary, facts:[{text,citations:[{ref,path?}]}], uncertainties:[], limits:[], next:null for finding or {playbook:'design'|'experiment'|'change'|'bug'|'performance',reason,question} for escalation. Cite exact source ref plus path; cite other input refs without path. Required experiments/new seams/product choices/source changes escalate with facts, precise missing capability and next human question. These continuation playbooks are unavailable in this staged build; suggestions confer no authorization.",
							source: current.investigationSource,
						},
					}
				: {}),
			executionPolicy: policy.revisions[binding.policy],
			policyBinding: binding.revision,
			inputs,
			results,
		});
	}
	async reconcile(_workflow?: string): Promise<void> {
		if (!this.#ready || !this.#ledger || !this.#harness) return;
		if (this.#reconciling) {
			this.#reconcileAgain = true;
			return;
		}
		this.#reconciling = true;
		try {
			for (const a of this.#assignments()) {
				if (!a.executing && !a.runtimeTaskCaptured && (a.status === "submitted" || a.status === "canceled" || a.status === "blocked")) {
					const task = await this.#harness.getTask(a.task as TaskId, ctx);
					if (task?.state.status === "terminal") await this.#command(a, { type: "recordRuntimeHistory", key: `settled:${a.task}` });
				}
				if (a.status === "canceling") {
					if (a.packet.execution !== "read-only" && a.executing && this.#sandboxes) {
						try {
							await this.#sandboxes.stop({ scope: this.#scope(a, true) });
							if (this.#ownedActive.has(a.id)) continue;
							await this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "stopped", effects: "reconciled" });
						} catch {
							await this.#command(a, { type: "recordBlocker", reason: "owned_check_quarantined_stop_unconfirmed" });
						}
						continue;
					}
					if (a.packet.execution !== "read-only" && a.executing) {
						if (a.blocker !== "whole_environment_stop_unavailable")
							await this.#command(a, { type: "recordBlocker", reason: "whole_environment_stop_unavailable" });
						continue;
					}
					const c = await this.#harness.conversation(a.conversation as ConversationId, ctx);
					if (!c) {
						await this.#command(a, { type: "recordBlocker", reason: "missing_execution_conversation" });
						continue;
					}
					await c.abort(ctx);
					await this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "absent", effects: "reconciled" });
				}
			}
		} finally {
			this.#reconciling = false;
			if (this.#reconcileAgain) {
				this.#reconcileAgain = false;
				void this.reconcile().catch(() => {});
			}
		}
	}
	async #waitUntil(signal: AbortSignal, ready: () => boolean): Promise<void> {
		// The task's existing run/resume checkpoint is durable. Observation is only a wakeup hint:
		// after reopen the phase checkpoints its new observation epoch and rechecks committed state.
		// Debt: each waiter scans a full scheduling snapshot on every Ledger commit. Coalesce these
		// reads when implementing the full streaming workload; larger queues can exceed the V9 ack target.
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		const observation = this.#ledger!.observe(scheduling, {
			send: () => {
				if (ready()) resolve();
			},
			end: () => reject(new Error("Role observation ended.")),
		});
		if (!("snapshot" in observation)) throw new Error(`Role observation refused: ${observation.code}`);
		const abort = () => reject(signal.reason);
		try {
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
			else if (ready()) resolve();
			await promise;
		} finally {
			signal.removeEventListener("abort", abort);
			observation.stop();
		}
	}
	#assignments(): RoleAssignment[] {
		const frame = this.#ledger?.snapshot(scheduling);
		return frame && "assignments" in frame ? (frame.assignments as RoleAssignment[]) : [];
	}
	#assignment(id: string) {
		return this.#assignments().find((a) => a.id === id);
	}
	#scope(a: RoleAssignment, fenced = false): ExecutionScope {
		return {
			assignment: a.id,
			generation: a.generation - (fenced ? 1 : 0),
			attempt: a.attempt,
			executorEpoch: a.executorEpoch ?? "unbound",
		};
	}
	async #ownedCheck(a: RoleAssignment): Promise<void> {
		const check = this.#config.ownedChecks!.checks[a.packet.profile]!;
		this.#ownedActive.add(a.id);
		// A fresh execution has not called prepare yet. Recovery never uses this local proof:
		// beforeResume reconciles the original scope and keeps uncertain journals quarantined.
		// Debt: a cancellation landing during trusted resolve fences prepare, finds no journal and stays quarantined.
		let environment: "absent" | "stopped" | undefined = "absent";
		try {
			const base = await this.#effects!.perform({ type: "resolve", repository: check.repository, commit: check.commit });
			if ("catalog" in check !== !!a.packet.verification)
				throw new Error("Catalog execution must be explicitly authorized; no operator-command fallback.");
			const catalog = a.packet.verification ? selectCatalog(base, a.packet.verification) : undefined;
			environment = undefined;
			const handle = await this.#sandboxes!.prepare(this.#scope(a), check.profile, base);
			const run = async (argv: string[]) => {
				const execution = await this.#sandboxes!.execute(handle, {
					scope: this.#scope(a),
					argv,
					timeoutMs: check.timeoutMs,
					verifierRevision: catalog?.selection.digest ?? ("verifierRevision" in check ? check.verifierRevision : undefined),
				});
				await this.#diagnostic(a, this.#scope(a), base, execution);
				return execution;
			};
			let execution: ExecutionResult | undefined;
			const results: CatalogResult[] = [];
			const cleanup: { status: "complete" | "pending"; results: ExecutionResult[] } = { status: "complete", results: [] };
			if (catalog) {
				// Decisive results are committed before cleanup can remove any owned fixture bytes.
				for (const row of catalog.rows) {
					const result: CatalogResult = { name: row.name, status: row.kind === "human" ? "advisory" : "completed", steps: [] };
					if (row.kind !== "human") {
						for (const command of row.journey?.steps ?? [row.run]) result.steps.push(await run(["sh", "-c", command]));
						if (row.journey) result.sanity = await run(["sh", "-c", row.journey.sanity]);
						const actual = [...result.steps, ...(result.sanity ? [result.sanity] : [])];
						if (actual.some((r) => r.exitCode === 126 || r.exitCode === 127)) result.status = "unrun";
						else if (actual.some((r) => r.exitCode !== 0 || r.timedOut)) result.status = "failed";
					}
					results.push(result);
				}
				await this.#retainDiagnostic(
					a.workflow,
					this.#scope(a),
					JSON.stringify({
						schema: 1,
						kind: "catalog-results",
						scope: this.#scope(a),
						catalog,
						results,
						cleanup: "pending",
						verification: "unaccepted",
					}),
				);
				for (const command of catalog.cleanup) cleanup.results.push(await run(["sh", "-c", command]));
				if (cleanup.results.some((r) => r.exitCode !== 0 || r.timedOut)) cleanup.status = "pending";
			} else if ("argv" in check) execution = await run(check.argv);
			const capture = await this.#sandboxes!.seal(handle);
			environment = "stopped";
			const source = await this.#effects!.perform({ type: "retain", base, capture });
			await this.#effects!.reconcile(source);
			const compact = (value: SourceReceipt["source"]) => ({
				...value,
				entries: value.entries.map(({ content, ...entry }) => ({ ...entry, byteLength: Buffer.from(content, "base64").length })),
			});
			const receipt = {
				schema: 1,
				kind: catalog ? "catalog-check" : "owned-check",
				...(catalog ? { role: a.packet.role, catalog, results, cleanup } : {}),
				scope: this.#scope(a),
				execution,
				verifierRevision: catalog?.selection.digest ?? ("verifierRevision" in check ? check.verifierRevision : undefined),
				verification: {
					inputCommit: base.commit,
					inputTree: base.tree,
					resultTree: source.source.tree,
					status:
						base.tree !== source.source.tree
							? "source_changed"
							: catalog
								? cleanup.status === "complete" &&
									results.filter((r) => requiredCatalogRows(catalog.selection).includes(r.name)).every((r) => r.status === "completed")
									? "needs_assessment"
									: "non-pass"
								: execution?.exitCode === 0
									? "passed"
									: "failed",
				},
				source: { ...source, base: compact(source.base), source: compact(source.source) },
				limits: { network: "ordinary bridge; reachable host/LAN/tailnet are not confined", macOS: "unrun", profile: check.profile },
				reviewWarning: source.configurationChanges.length
					? `REVIEW SOURCE CONFIGURATION CHANGES: ${source.configurationChanges.join(", ")}; never activated on host`
					: null,
			};
			const text = JSON.stringify(receipt);
			const reply = await this.#ledger!.command(
				{
					version: 1,
					authorityEpoch: this.#ledger!.status().authorityEpoch,
					commandId: `owned-check:${a.id}:${a.generation}`,
					workflow: a.workflow,
					command: { type: "recordRunnerObservation", assignment: a.id, generation: a.generation, attempt: a.attempt, text },
				},
				mintContext({ kind: "host", scope: "effects" }),
			);
			if (reply.status !== "accepted") {
				if (this.#assignment(a.id)!.generation !== a.generation)
					await this.#ledger!.command(
						{
							version: 1,
							authorityEpoch: this.#ledger!.status().authorityEpoch,
							commandId: `owned-quarantine:${a.id}:${a.generation}`,
							workflow: a.workflow,
							command: { type: "recordRecoveryState", assignment: a.id, generation: a.generation, attempt: a.attempt, text },
						},
						mintContext({ kind: "host", scope: "recovery" }),
					);
				else {
					// Policy adoption keeps the generation current, so this evidence cannot enter the fenced-identity quarantine.
					await this.#retainDiagnostic(
						a.workflow,
						this.#scope(a),
						JSON.stringify({ ...receipt, kind: "owned-check-diagnostic", observed: receipt.verification, verification: "unaccepted" }),
					);
					throw new Error(`Owned check receipt refused: ${reply.code}`);
				}
			}
		} catch (error) {
			if (error instanceof SandboxInputRefusal) environment = "absent";
			const current = this.#assignment(a.id)!;
			await this.#command(current, {
				type: "recordBlocker",
				reason: `owned_check_blocked: ${current.blocker ? `${current.blocker}: ` : ""}${error}`.slice(0, 1900),
			});
			if (!environment) {
				try {
					const result = await this.#sandboxes!.stop({ scope: this.#scope(a) });
					for (const diagnostic of result.executions)
						await this.#diagnostic(a, this.#scope(a), result.source, diagnostic.result, diagnostic.result ? undefined : diagnostic);
					environment = "stopped";
				} catch {
					/* Preserve executing capacity and quarantine until the original runtime is reconciled. */
				}
			}
		} finally {
			this.#ownedActive.delete(a.id);
			if (environment)
				await this.#command(this.#assignment(a.id)!, {
					type: "recordQuiescence",
					providerIdle: true,
					environment,
					effects: "reconciled",
				});
		}
	}
	async #diagnostic(
		a: RoleAssignment,
		scope: ExecutionScope,
		base: Source,
		execution?: ExecutionResult,
		interrupted?: unknown,
	): Promise<void> {
		const text = JSON.stringify({
			schema: 1,
			kind: "owned-check-diagnostic",
			scope,
			input: { repository: base.repository, commit: base.commit, tree: base.tree, root: base.root, objectFormat: base.objectFormat },
			execution,
			interrupted,
			verifierRevision: execution?.verifierRevision ?? null,
			verification: "unaccepted",
		});
		await this.#retainDiagnostic(a.workflow, scope, text);
	}
	async #retainDiagnostic(workflow: string, scope: ExecutionScope, text: string): Promise<void> {
		const reply = await this.#ledger!.command(
			{
				version: 1,
				authorityEpoch: this.#ledger!.status().authorityEpoch,
				commandId: `owned-diagnostic:${createHash("sha256").update(text).digest("hex")}`,
				workflow,
				command: {
					type: "recordRunnerDiagnostic",
					assignment: scope.assignment,
					generation: scope.generation,
					attempt: scope.attempt,
					text,
				},
			},
			mintContext({ kind: "host", scope: "effects" }),
		);
		if (reply.status !== "accepted") throw new Error(`Owned diagnostic retention refused: ${reply.code}`);
	}
	async #prepareInvestigation(a: RoleAssignment): Promise<void> {
		if (a.investigationSource) return; // Exact retained bytes, never refetch a damaged historical citation.
		const input = a.packet.investigation!;
		const source = await this.#investigationEffects!.perform({ type: "resolve", repository: input.repository, commit: input.commit });
		const entries = input.paths.map((path) => {
			const entry = source.entries.find((e) => e.path === path);
			if (!entry) throw new Error(`Restore exact source ${source.commit}:${path}.`);
			const bytes = Buffer.from(entry.content, "base64");
			const text = bytes.toString("utf8");
			if (!Buffer.from(text).equals(bytes) || bytes.includes(0))
				throw new Error(`Unsupported non-text investigation input ${source.commit}:${path}; supply an explicit readable artifact.`);
			return { path: entry.path, mode: entry.mode, oid: entry.oid, text };
		});
		const text = JSON.stringify({
			schema: 1,
			kind: "investigation-source",
			repository: source.repository,
			commit: source.commit,
			tree: source.tree,
			objectFormat: source.objectFormat,
			entries,
		});
		const reply = await this.#ledger!.command(
			{
				version: 1,
				authorityEpoch: this.#ledger!.status().authorityEpoch,
				commandId: `investigation-source:${a.id}:${a.generation}`,
				workflow: a.workflow,
				command: { type: "recordSourceObservation", assignment: a.id, generation: a.generation, attempt: a.attempt, text },
			},
			mintContext({ kind: "host", scope: "effects" }),
		);
		if (reply.status !== "accepted") throw new Error(`Source retention refused: ${reply.reason}`);
	}
	#configurationBlocker(a: RoleAssignment): string | undefined {
		if (a.packet.investigation && !this.#investigationEffects && !a.investigationSource)
			return "investigation_source_capability_unavailable";
		if (a.packet.execution === "linux-writer" && this.#config.ownedChecks)
			return Object.hasOwn(this.#config.ownedChecks.checks, a.packet.profile) ? undefined : "owned_check_profile_unavailable";
		if (!this.#config.apiKey) return "native_provider_configuration_missing";
		if (a.packet.execution !== "read-only") return "sandbox_capability_unavailable";
		if (this.#config.provider && this.#config.provider.id !== "anthropic") return "native_provider_required";
		if (this.#config.families?.[a.packet.model] !== a.packet.family || a.packet.requiredFamily !== a.packet.family)
			return "required_model_family_unavailable";
		if (!this.#models.getModel(a.packet.provider, a.packet.model)) return "required_model_unavailable";
		return undefined;
	}
	async #command(a: RoleAssignment, command: Record<string, unknown>) {
		const reply = await this.#ledger!.command(
			{
				version: 1,
				authorityEpoch: this.#ledger!.status().authorityEpoch,
				commandId: `engine:${a.id}:${a.generation}:${a.executionOrdinal}:${a.status}:${command.type}:${createHash("sha256").update(JSON.stringify(command)).digest("hex").slice(0, 24)}`,
				workflow: a.workflow,
				command: { assignment: a.id, generation: a.generation, attempt: a.attempt, ...command },
			},
			scheduling,
		);
		return reply;
	}
	async #identity(api: ToolExecutionApi, toolName: string) {
		const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
		const a = binding ? this.#assignment(binding.assignment) : undefined;
		const task = await api.getTask(api.taskId, ctx);
		if (
			!task ||
			task.kind !== "pi.tool" ||
			task.conversationId !== api.conversationId ||
			!binding ||
			!a ||
			a.conversation !== api.conversationId
		)
			return { code: "untrusted_invocation", status: "refused" as const };
		if ((task.input as { kind?: string }).kind !== "model") return { code: "unsafe_ancestor", status: "refused" as const };
		const invocation = task.input as { assistant: import("@earendil-works/pi-durable").EntryId; callId: string };
		const entry = await api.commit((tx) => tx.entry(invocation.assistant), ctx);
		if (
			invocation.callId !== api.callId ||
			!entry?.model?.some(
				(m) => m.role === "assistant" && m.content.some((c) => c.type === "toolCall" && c.id === api.callId && c.name === toolName),
			)
		)
			return { code: "untrusted_invocation", status: "refused" as const };
		const principal = {
			kind: "assignment-agent" as const,
			assignment: binding.assignment,
			generation: binding.generation,
			attempt: binding.attempt,
			role: binding.role,
		};
		if (!sameAgent(a, principal)) return { code: "stale_assignment", status: "refused" as const };
		return { a, context: mintContext(principal) };
	}
	async #toolCommand(
		api: ToolExecutionApi,
		toolName: string,
		command: JsonObject,
	): Promise<CommandReply | { status: "refused"; code: string }> {
		const identity = await this.#identity(api, toolName);
		if (identity.status === "refused") {
			if (identity.code === "stale_assignment" && command.type === "submitRoleResult") await this.#quarantine(api, command);
			return identity;
		}
		const a = identity.a;
		const commandId = `role:${createHash("sha256")
			.update(JSON.stringify([a.workflow, api.conversationId, a.id, a.generation, a.attempt, api.taskId, api.callId]))
			.digest("hex")}`;
		const envelope = await api.memo(
			"render.envelope",
			{ version: 1, authorityEpoch: this.#ledger!.status().authorityEpoch, commandId, workflow: a.workflow, command },
			ctx,
		);
		const reply = await this.#ledger!.command(envelope, identity.context);
		if (
			reply.status === "refused" &&
			(reply.code === "unauthorized" || reply.code === "stale_assignment") &&
			command.type === "submitRoleResult"
		)
			await this.#quarantine(api, command);
		return reply;
	}
	async #quarantine(api: ToolExecutionApi, command: JsonObject): Promise<void> {
		const binding = await api.snapshot(RoleBinding, api.conversationId, ctx);
		const a = binding ? this.#assignment(binding.assignment) : undefined;
		if (!a || !binding || typeof command.text !== "string") return;
		await this.#ledger!.command(
			{
				version: 1,
				authorityEpoch: this.#ledger!.status().authorityEpoch,
				commandId: `quarantine:${api.taskId}:${createHash("sha256").update(api.callId).digest("hex")}`,
				workflow: a.workflow,
				command: {
					type: "recordRecoveryState",
					assignment: binding.assignment,
					generation: binding.generation,
					attempt: binding.attempt,
					text: command.text,
				},
			},
			mintContext({ kind: "host", scope: "recovery" }),
		);
	}
}

export function runtimeOptions(onReport: (error: unknown, info: ReportInfo) => void): RenderRuntimeOptions {
	return new Engine().options(onReport);
}
