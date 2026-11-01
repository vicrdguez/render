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
import { packetRefs, type RoleAssignment, type RoleIntent, sameAgent } from "../kernel/roles.ts";
import type { CommandReply, Ledger } from "../ledger/ledger.ts";
import { mintContext } from "../ledger/principals.ts";
import { Meta, RoleBinding, RoleWork, Workflow } from "../ledger/records.ts";

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

export class Engine {
	#ledger: Ledger | undefined;
	#harness: Harness | undefined;
	#reconciling = false;
	#reconcileAgain = false;
	#ready = false;
	#sessions = new Map<string, { assignment: string; task: number }>();
	readonly #config: { apiKey?: string; families?: Readonly<Record<string, string>>; provider?: Provider };
	readonly #roles;
	readonly #run;
	readonly #notify;
	readonly #models;

	constructor(config: { apiKey?: string; families?: Readonly<Record<string, string>>; provider?: Provider } = {}) {
		this.#config = config;
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
					const reply = await this.#toolCommand(api, name, make(args as Record<string, string>));
					return {
						output: [{ type: "text" as const, text: JSON.stringify(reply) }],
						isError: reply.status !== "accepted",
						...(reply.status === "accepted" && (name === "request_role" || name === "submit_role_result" || name === "request_own_stop")
							? { control: { handoff: `${name} durably accepted.` } }
							: {}),
					};
				},
			});
		const request = tool("request_role", schema({ key: Type.String() }), (args) => ({ type: "requestRole", key: args.key! }));
		const submit = tool("submit_role_result", schema({ text: Type.String() }), (args) => ({ type: "submitRoleResult", text: args.text! }));
		const stop = tool("request_own_stop", schema({}), () => ({ type: "requestOwnStop" }));
		const read = defineTool({
			name: "read_artifact",
			description: "Read only immutable artifacts granted by this packet.",
			parameters: schema({ ref: Type.String() }),
			replay: "safe",
			execute: async (args, api) => {
				const identity = await this.#identity(api, "read_artifact");
				const reply = "code" in identity ? identity : await this.#ledger!.artifact(identity.context, { read: args.ref as string });
				return {
					output: [{ type: "text", text: "content" in reply ? reply.content.toString("utf8") : JSON.stringify(reply) }],
					isError: !("content" in reply),
				};
			},
		});
		this.#roles = defineExtension({
			name: "render.roles",
			tools: [read, request, submit, stop],
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
						try {
							prompt = blocker ? "" : await this.render(a);
						} catch {
							prompt = "";
						}
						if (blocker || !prompt || Buffer.byteLength(prompt) > a.packet.maxInputBytes) {
							await this.#command(a, { type: "recordBlocker", reason: blocker ?? "required_inputs_do_not_fit" });
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
					const children = this.#assignments().filter(
						(child) => child.parent === a?.id && !task.state.checkpoint.consumed?.includes(child.id),
					);
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
								this.#assignments()
									.filter((child) => child.parent === a.id)
									.every((child) => child.status === "submitted"))
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
								consumed: this.#assignments()
									.filter((child) => child.parent === a.id)
									.map((child) => child.id),
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
		for (const ref of packetRefs(a.packet)) {
			const value = await this.#ledger.artifact(context, { read: ref });
			if (!("content" in value)) throw new Error(`Required exact input ${ref}: ${value.code}`);
			inputs.push({ ref, text: value.content.toString("utf8") });
		}
		const results = this.#assignments()
			.filter((child) => child.parent === a.id && child.status === "submitted")
			.map((child) => ({ assignment: child.id, report: child.report }));
		const frame = this.#ledger.snapshot(scheduling);
		if (!("policy" in frame)) throw new Error("Current policy is unavailable.");
		const policy = frame.policy as import("../kernel/policy.ts").PolicyState;
		const binding = policy.bindings[a.workflow];
		if (!binding || (a.policyBinding !== undefined && a.policyBinding !== binding.revision))
			throw new Error("Stale workflow policy binding.");
		return JSON.stringify({
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
			packet: a.packet,
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
	#configurationBlocker(a: RoleAssignment): string | undefined {
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
		if (reply.status === "packaged") throw new Error("Unexpected local-admin response to role command");
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
