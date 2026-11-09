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
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { fromPromise, runPromise } from "../effect.ts";
import type { ForgeConfig, ForgeDispatch } from "../effects/forge.ts";
import { Effects, type Source, type SourceReceipt, type TargetObservation, treeOid } from "../effects/source.ts";
import { experimentInputs } from "../kernel/experiments.ts";
import {
	auditReviewerPacket,
	completedReviews,
	PREPARATION_REASON_BYTES,
	type PreparationRecord,
	type PreparedChecks,
	preparationBase,
	reviewQualification,
	reviewSelection,
	watchdogVerdict,
} from "../kernel/implementation.ts";
import {
	type Integration,
	type IntegrationIntent,
	type IntegrationObservation,
	type IntegrationOutcome,
	integrated,
	serializing,
	unresolved,
} from "../kernel/integration.ts";
import type { WorkflowView } from "../kernel/kernel.ts";
import { bindingFor, initialPolicy, type PolicyBasis, type PolicyState, policyBasis } from "../kernel/policy.ts";
import { type Project, type ProjectFacts, projectFacts } from "../kernel/projects.ts";
import type { ForgeObservation, ForgeOperation, PublicationView } from "../kernel/publication.ts";
import {
	currentChildren,
	type ImplementationPass,
	latestPass,
	packetRefs,
	type RoleAssignment,
	type RoleIntent,
	sameAgent,
} from "../kernel/roles.ts";
import {
	type CatalogEvidence,
	type CatalogResult,
	requiredCatalogRows,
	rowDefinitionGap,
	rowExecuted,
	type SelectedCatalog,
} from "../kernel/verification.ts";
import { faultBarrier } from "../ledger/barrier.ts";
import type { CommandReply, Ledger } from "../ledger/ledger.ts";
import { mintContext } from "../ledger/principals.ts";
import { Meta, RoleBinding, RoleWork, Workflow } from "../ledger/records.ts";
import {
	type ExecutionResult,
	type ExecutionScope,
	type LinuxProfile,
	Sandboxes,
	type SandboxHandle,
	SandboxInputRefusal,
} from "../sandboxes/sandboxes.ts";
import { selectCatalog, VERIFICATION_AUTHORING } from "./catalog.ts";
import { type ExperimentConfig, Experiments } from "./experiments.ts";
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
	/** Per Linux profile: the base commit and limits. The project names the source and the check image. */
	checks: Readonly<
		Record<
			string,
			{ commit: string; profile: Omit<LinuxProfile, "image">; timeoutMs: number } & (
				| { catalog: true }
				| { argv: string[]; verifierRevision: string }
			)
		>
	>;
};
type PreparationJob = {
	owner: RoleAssignment;
	pass: ImplementationPass;
	check: OwnedChecks["checks"][string];
	save: (scope: ExecutionScope) => Promise<unknown>;
};
/** X's own verifier bytes cannot define its required checks; deterministic, so repair needs a new pass, not a retry. */
class VerifierDefect extends Error {}
type EngineConfig = {
	apiKey?: string;
	families?: Readonly<Record<string, string>>;
	provider?: Provider;
	ownedChecks?: OwnedChecks;
	experiments?: ExperimentConfig;
	investigations?: { root: string };
	/** Trusted forge configuration, passed only to Effects; no packet, record or Sandboxes input carries it. */
	forge?: ForgeConfig;
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
	readonly #experiments: Experiments | undefined;
	readonly #sandboxes: Sandboxes | undefined;
	readonly #ownedActive = new Set<string>();
	readonly #workspaces = new Map<string, { handle: SandboxHandle; source: Source; sealed: boolean }>();
	readonly #implementationActive = new Set<string>();
	readonly #implementationAdmitted = new Set<string>();
	/** Exact Sandboxes scopes of in-flight host checks of prepared X; they confer no role or writer authority. */
	readonly #preparing = new Set<string>();
	#cached: { sequence: number; frame: ReturnType<Ledger["snapshot"]> } | undefined;
	readonly #integrating = new Map<string, Promise<void>>();
	/** Proposals with a publication run in flight, and those asked to run again once it ends. */
	readonly #publishing = new Set<string>();
	readonly #publishAgain = new Set<string>();
	readonly #preparation;
	readonly #priorPreparation;
	readonly #roles;
	readonly #run;
	readonly #notify;
	readonly #models;

	constructor(config: EngineConfig = {}) {
		this.#config = config;
		if (config.experiments)
			this.#experiments = new Experiments(
				config.experiments,
				() => this.#ledger!,
				() => this.#assignments(),
				(workflow) => this.#project(workflow),
			);
		if (config.investigations)
			this.#investigationEffects = new Effects({ root: config.investigations.root, ...(config.forge ? { forge: config.forge } : {}) });
		if (config.ownedChecks) {
			this.#effects = new Effects({
				root: `${config.ownedChecks.root}/effects`,
				...(config.forge ? { forge: config.forge } : {}),
			});
			this.#sandboxes = new Sandboxes({
				root: `${config.ownedChecks.root}/sandboxes`,
				authorize: (scope) => {
					const a = this.#assignment(scope.assignment);
					if (this.#preparing.has(JSON.stringify(scope)))
						return !!a && a.status === "submitted" && scope.executorEpoch === this.#ledger?.status().executorEpoch;
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
				lazyStream(model, () =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							const harness = this.#harness;
							let scope = options?.sessionId ? this.#sessions.get(options.sessionId) : undefined;
							if (!scope && harness && options?.sessionId) {
								for (const assignment of this.#assignments()) {
									const session = yield* fromPromise(() => harness.snapshot(ProviderDoc, assignment.conversation as ConversationId, ctx));
									if (session?.sessionId === options.sessionId) {
										scope = { assignment: assignment.id, task: 0 };
										break;
									}
								}
							}
							if (!scope || !harness) throw new Error("Role provider request has no trusted scope.");
							const a = this.#assignment(scope.assignment);
							if (!a || this.#configurationBlocker(a)) throw new Error("Role provider configuration is unavailable.");
							yield* this.render(a);
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
								const tasks = yield* fromPromise(() =>
									harness.commit(
										(tx) =>
											tx.scanTasks({ conversationId: a.conversation as ConversationId, kind: "pi.compaction", status: "running" }, 200),
										ctx,
									),
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
							yield* fromPromise(() =>
								harness.commit(async (tx) => {
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
								}, ctx),
							);
							return provider.streamSimple(model, transcript, { ...options, maxTokens: a.packet.maxOutputTokens });
						}),
					),
				),
		});
		const schema = <T extends Record<string, ReturnType<typeof Type.String>>>(fields: T) =>
			Type.Object(fields, { additionalProperties: false });
		const tool = (name: string, parameters: ReturnType<typeof Type.Object>, make: (args: Record<string, string>) => JsonObject) =>
			defineTool({
				name,
				description: `Scoped Ledger ${name}; no inline effects.`,
				parameters,
				replay: "safe",
				execute: (args, api, _context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							const command = make(args as Record<string, string>);
							const reply = yield* this.#toolCommand(api, name, command);
							return {
								output: [{ type: "text" as const, text: JSON.stringify(reply) }],
								isError: reply.status !== "accepted",
								...(reply.status === "accepted" &&
								(name === "request_role" ||
									name === "submit_role_result" ||
									name === "request_own_stop" ||
									command.type === "requestCheckpointReview" ||
									command.type === "requestIntakeReview")
									? { control: { handoff: `${name} durably accepted.` } }
									: {}),
							};
						}),
					),
			});
		const checkpoint = tool(
			"checkpoint",
			schema({
				command: Type.String({
					description:
						"JSON checkpoint/intake command: requestCheckpoint, stageCheckpoint, requestCheckpointReview, emitCheckpoint, reworkCheckpoint, advanceDelegatedCheckpoint, stageIntake or requestIntakeReview. Human decisions are forbidden.",
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
			execute: (args, api) =>
				runPromise(
					Effect.gen({ self: this }, function* () {
						const reply = yield* this.#toolCommand(api, "submit_role_result", { type: "submitRoleResult", ...args });
						return {
							output: [{ type: "text", text: JSON.stringify(reply) }],
							isError: reply.status !== "accepted",
							...(reply.status === "accepted" ? { control: { handoff: "Report durably accepted." } } : {}),
						};
					}),
				),
		});
		const experimentRun = defineTool({
			name: "experiment_run",
			description:
				"Run one bounded command in your isolated experiment workspace. Parent originals at /candidates/<id> are read-only; /workspace is scratch. Never replay uncertain execution.",
			parameters: Type.Object({ argv: Type.Array(Type.String(), { minItems: 1, maxItems: 64 }) }, { additionalProperties: false }),
			replay: "unsafe",
			execute: (args, api) =>
				runPromise(
					Effect.gen({ self: this }, function* () {
						const identity = yield* this.#identity(api, "experiment_run");
						return yield* Effect.gen({ self: this }, function* () {
							if ("code" in identity || !identity.a.packet.experiment || !this.#experiments)
								throw new Error("experiment_capability_unavailable");
							yield* this.render(identity.a);
							const result = yield* this.#experiments.run(identity.a, args.argv);
							return { output: [{ type: "text" as const, text: JSON.stringify(result) }] };
						}).pipe(
							Effect.catchCause((cause) => {
								if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
								const error = Cause.squash(cause);
								return Effect.sync(() => {
									return { output: [{ type: "text" as const, text: String(error) }], isError: true };
								});
							}),
						);
					}),
				),
		});
		const stop = tool("request_own_stop", schema({}), () => ({ type: "requestOwnStop" }));
		const read = defineTool({
			name: "read_artifact",
			description: "Read only immutable artifacts granted by this packet.",
			parameters: schema({ ref: Type.String() }),
			replay: "safe",
			execute: (args, api) =>
				runPromise(
					Effect.gen({ self: this }, function* () {
						const identity = yield* this.#identity(api, "read_artifact");
						const reply =
							"code" in identity
								? identity
								: (args.ref as string).startsWith("web:")
									? { code: "use_scoped_web_paging" }
									: yield* this.#ledger!.artifact(identity.context, { read: args.ref as string });
						return {
							output: [{ type: "text", text: "content" in reply ? reply.content.toString("utf8") : JSON.stringify(reply) }],
							isError: !("content" in reply),
						};
					}),
				),
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
				execute: (args, api, context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							const identity = yield* this.#identity(api, `web_${capability}`);
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
							const result = yield* research(
								this.#config.web ?? {},
								capability,
								normalized,
								{ assignment: a.id, generation: a.generation, attempt: a.attempt },
								context.abortSignal ?? new AbortController().signal,
								current,
							);
							const saved = yield* this.#ledger!.artifact(scheduling, { upload: { webWorking: result } });
							return output({ ...previewWeb(result), ...("code" in saved ? { handle: undefined, workingUnavailable: saved.code } : {}) });
						}),
					),
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
			execute: (args, api) =>
				runPromise(
					Effect.gen({ self: this }, function* () {
						const identity = yield* this.#identity(api, "read_web_result");
						const reply =
							"code" in identity
								? identity
								: !args.handle.startsWith("web:")
									? { code: "invalid_working_handle" }
									: yield* this.#ledger!.artifact(identity.context, { read: args.handle });
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
					}),
				),
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
			execute: (args, api) =>
				runPromise(
					Effect.gen({ self: this }, function* () {
						const reply = yield* this.#toolCommand(api, "retain_web_evidence", { type: "retainWebEvidence", ...args });
						return { output: [{ type: "text", text: JSON.stringify(reply) }], isError: reply.status !== "accepted" };
					}),
				),
		});
		const implementation = (name: string, parameters: ReturnType<typeof Type.Object>) =>
			defineTool({
				name,
				description:
					name === "implementation_execute"
						? "Run bounded argv in this accepted implementation's owned Linux workspace. Never on the host."
						: "Capture exact source, execute its selected checks and request the one Audit or final sealed handoff. Capture stops the environment; caches, services and Git metadata may be lost.",
				parameters,
				// Arbitrary coding commands cannot be replayed after an uncertain tool outcome.
				replay: name === "implementation_execute" ? "unsafe" : "safe",
				execute: (args, api) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							const identity = yield* this.#identity(api, name);
							if ("code" in identity) return { output: [{ type: "text" as const, text: JSON.stringify(identity) }], isError: true };
							const a = identity.a;
							if (!a.passRef || a.packet.role !== "implementer" || a.packet.execution !== "linux-writer")
								return {
									output: [{ type: "text" as const, text: "Only the current accepted implementing writer may use this tool." }],
									isError: true,
								};
							if (this.#implementationActive.has(a.id))
								return {
									output: [
										{ type: "text" as const, text: "Implementation operation already in flight; serialize coding, capture and handoff." },
									],
									isError: true,
								};
							this.#implementationActive.add(a.id);
							return yield* Effect.gen({ self: this }, function* () {
								if (name === "implementation_execute") {
									const workspace = yield* this.#implementationWorkspace(a);
									const result = yield* this.#sandboxes!.execute(workspace.handle, {
										scope: this.#scope(a),
										argv: (args as { argv: string[] }).argv,
										timeoutMs: this.#config.ownedChecks!.checks[a.packet.profile]!.timeoutMs,
									});
									yield* this.#diagnostic(a, this.#scope(a), workspace.source, result);
									return { output: [{ type: "text" as const, text: JSON.stringify(result) }], isError: result.exitCode !== 0 };
								}
								if (name === "implementation_reproduce") {
									const reply = yield* this.#captureImplementation(a, "reproduction");
									return { output: [{ type: "text" as const, text: JSON.stringify(reply) }], isError: reply.result.reproduction !== "red" };
								}
								const kind = name === "implementation_audit" ? "audit" : "final";
								const existing = this.#implementationPass(a);
								const captured =
									kind === "audit" ? !!existing.captureA : existing.captureB === existing.workspace && !!this.#workspaces.get(a.id)?.sealed;
								if (!captured && !existing.handoff) yield* this.#captureImplementation(a, kind);
								if (name === "implementation_check")
									return {
										output: [{ type: "text" as const, text: JSON.stringify({ source: this.#implementationPass(a).captureB }) }],
										isError: false,
									};
								const reply = yield* this.#toolCommand(
									api,
									name,
									kind === "audit"
										? { type: "requestImplementationAudit" }
										: { type: "submitImplementationHandoff", ...(args as JsonObject) },
								);
								return {
									output: [{ type: "text" as const, text: JSON.stringify(reply) }],
									isError: reply.status !== "accepted",
									...(reply.status === "accepted" ? { control: { handoff: `${name} durably accepted.` } } : {}),
								};
							}).pipe(
								Effect.catchCause((cause) => {
									if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
									const error = Cause.squash(cause);
									return Effect.succeed({
										output: [{ type: "text" as const, text: `Implementation remains unaccepted: ${error}` }],
										isError: true,
									});
								}),
								Effect.ensuring(
									Effect.sync(() => {
										this.#implementationActive.delete(a.id);
										void runPromise(this.reconcile()).catch(() => {});
									}),
								),
								Effect.uninterruptible,
							);
						}),
					),
			});
		const executeImplementation = implementation(
			"implementation_execute",
			Type.Object({ argv: Type.Array(Type.String(), { minItems: 1 }) }, { additionalProperties: false }),
		);
		const auditImplementation = implementation("implementation_audit", schema({}));
		const checkImplementation = implementation("implementation_check", schema({}));
		const reproduceImplementation = implementation("implementation_reproduce", schema({}));
		const handoffImplementation = implementation(
			"implementation_handoff",
			Type.Object(
				{
					text: Type.String(),
					dispositions: Type.Array(
						Type.Object(
							{
								report: Type.String(),
								finding: Type.String(),
								disposition: Type.Union([
									Type.Literal("fixed"),
									Type.Literal("considered"),
									Type.Literal("dismissed"),
									Type.Literal("needs-human"),
								]),
								reason: Type.String(),
								changes: Type.Array(Type.String()),
								rechecks: Type.Array(Type.String()),
							},
							{ additionalProperties: false },
						),
					),
					verification: Type.Object(
						{
							outcome: Type.Union([Type.Literal("pass"), Type.Literal("non-pass")]),
							rank: Type.Union([Type.String(), Type.Null()]),
							reason: Type.String(),
						},
						{ additionalProperties: false },
					),
				},
				{ additionalProperties: false },
			),
		);
		this.#roles = defineExtension({
			name: "render.roles",
			tools: [
				read,
				request,
				submit,
				stop,
				checkpoint,
				...webTools,
				webRead,
				retain,
				experimentRun,
				executeImplementation,
				auditImplementation,
				checkImplementation,
				reproduceImplementation,
				handoffImplementation,
			],
			sections: [
				section("role-packet", (input) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							const binding = yield* fromPromise(() => input.read.snapshot(RoleBinding, input.conversationId, ctx));
							const a = binding ? this.#assignment(binding.assignment) : undefined;
							if (!a) throw new Error("No role assignment");
							return yield* this.render(a);
						}),
					),
				),
			],
			hooks: [
				hook(GenerationTask, {
					beforeRequest: (_request, api) =>
						runPromise(
							Effect.gen({ self: this }, function* () {
								const binding = yield* fromPromise(() => api.snapshot(RoleBinding, api.conversationId, ctx));
								const session = yield* fromPromise(() => api.snapshot(ProviderDoc, api.conversationId, ctx));
								if (binding && session) this.#sessions.set(session.sessionId, { assignment: binding.assignment, task: api.taskId });
								return undefined;
							}),
						),
					afterTools: (assistant, _results, api) =>
						runPromise(
							Effect.gen({ self: this }, function* () {
								const binding = yield* fromPromise(() => api.snapshot(RoleBinding, api.conversationId, ctx));
								const a = binding ? this.#assignment(binding.assignment) : undefined;
								if (a) yield* this.#command(a, { type: "recordRuntimeHistory", key: `tools:${api.taskId}:${assistant}` });
							}),
						),
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
				run: (task, runtime, context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							// Reattaching an interrupted scheduling wait is progress, not another failed execution.
							// Commit the fresh startup identity once; idle observation must not write heartbeats.
							yield* fromPromise(() =>
								runtime.commit(async (tx, current) => {
									const { executorEpoch } = await tx.doc(Meta);
									if (current.state.checkpoint.observingExecutorEpoch !== executorEpoch)
										return { status: "running", checkpoint: { ...current.state.checkpoint, observingExecutorEpoch: executorEpoch } };
								}, context),
							);
							const round = task.state.checkpoint.round;
							for (;;) {
								yield* this.#waitUntil(runtime.signal, () => {
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
								if (!a || a.status === "submitted" || a.status === "canceled") {
									yield* fromPromise(() =>
										runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
									);
									return yield* this.reconcile();
								}
								const blocker = this.#configurationBlocker(a) ?? (yield* this.#openingBlocker(a));
								let prompt!: string;
								let inputBlocker: string | undefined;
								yield* Effect.gen({ self: this }, function* () {
									if (!blocker && a.packet.investigation) yield* this.#prepareInvestigation(a);
									prompt = blocker ? "" : yield* this.render(a);
								}).pipe(
									Effect.catchCause((cause) => {
										if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
										const error = Cause.squash(cause);
										return Effect.sync(() => {
											prompt = "";
											if (a.packet.verification) inputBlocker = `verification_unrun: ${error}`.slice(0, 1900);
											if (a.packet.investigation) inputBlocker = `investigation_input_unavailable: ${error}`.slice(0, 1900);
										});
									}),
								);
								if (blocker || !prompt || Buffer.byteLength(prompt) > a.packet.maxInputBytes) {
									yield* this.#command(a, { type: "recordBlocker", reason: blocker ?? inputBlocker ?? "required_inputs_do_not_fit" });
									yield* fromPromise(() =>
										runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
									);
									return yield* this.reconcile();
								}
								if (a.status !== "running") {
									const started = yield* this.#command(a, { type: "stageTask", executorEpoch: this.#ledger!.status().executorEpoch });
									if (started.status !== "accepted") {
										if (started.code !== "capacity_exhausted" && this.#assignment(a.id)?.status === "queued")
											yield* this.#command(a, { type: "recordBlocker", reason: started.code });
										continue;
									}
								}
								const review = this.#assignment(a.id);
								if (review?.watchdogReview && !review.watchdogReview.checks) {
									const unavailable = yield* this.#reviewChecks(review);
									if (!unavailable) prompt = yield* this.render(this.#assignment(a.id)!);
									if (unavailable || Buffer.byteLength(prompt) > a.packet.maxInputBytes) {
										yield* this.#command(this.#assignment(a.id)!, {
											type: "recordBlocker",
											reason: unavailable ?? "required_inputs_do_not_fit",
										});
										yield* fromPromise(() =>
											runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
										);
										return yield* this.reconcile();
									}
								}
								if (a.packet.experiment) {
									const prepared = yield* Effect.exit(this.#experiments!.prepare(this.#assignment(a.id)!));
									if (Exit.isFailure(prepared)) {
										const error = Cause.squash(prepared.cause);
										yield* this.#command(this.#assignment(a.id)!, {
											type: "recordBlocker",
											reason: `experiment_prepare_blocked: ${error}`.slice(0, 1900),
										});
										if (error instanceof SandboxInputRefusal)
											yield* this.#command(this.#assignment(a.id)!, {
												type: "recordQuiescence",
												providerIdle: true,
												environment: "absent",
												effects: "reconciled",
											});
										else yield* this.#stopExperiment(this.#assignment(a.id)!);
										return yield* fromPromise(() =>
											runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
										);
									}
								}
								if (a.packet.execution === "linux-writer" && !a.packet.experiment && !a.passRef) {
									yield* this.#ownedCheck(this.#assignment(a.id)!);
									yield* fromPromise(() =>
										runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
									);
									return yield* this.reconcile();
								}
								const conversation = yield* fromPromise(() => runtime.conversation(a.conversation as ConversationId, context));
								if (!conversation) throw new Error("Missing role conversation");
								const input = yield* fromPromise(() =>
									conversation.submit({ type: "input", requestId: `role:${a.attempt}:${round}`, content: prompt }, context),
								);
								return yield* fromPromise(() =>
									runtime.commit(
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
									),
								);
							}
						}),
					),
				wait: (task, runtime, context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							if (task.state.checkpoint.phase !== "wait") throw new Error("wrong phase");
							const submission = yield* fromPromise(() => this.#harness!.submission(task.state.checkpoint.submission as never, context));
							if (!submission) throw new Error("Missing role submission");
							yield* fromPromise(() => submission.wait(context));
							const a = this.#assignment(task.input.assignment);
							// Results already delivered to a prior round cannot trigger another continuation.
							const children = a
								? currentChildren(this.#assignments(), a.id).filter((child) => !task.state.checkpoint.consumed?.includes(child.id))
								: [];
							if (a) {
								const unproven = a.status === "running" && !children.length ? yield* this.#unproven(a) : undefined;
								if (a.status === "running")
									yield* this.#command(a, {
										type: "recordBlocker",
										reason: children.length ? "awaiting_role_results" : (unproven ?? "role_did_not_submit"),
									});
								if (a.passRef) yield* this.#quiesceImplementation(a);
								else if (a.packet.experiment) yield* this.#stopExperiment(this.#assignment(a.id)!);
								else
									yield* this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "absent", effects: "reconciled" });
							}
							if (a && children.length && this.#assignment(a.id)?.blocker === "awaiting_role_results")
								return yield* fromPromise(() =>
									runtime.commit(
										() => ({ status: "running", checkpoint: { phase: "resume", round: task.state.checkpoint.round } }),
										context,
									),
								);
							yield* fromPromise(() =>
								runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
							);
							return yield* this.reconcile();
						}),
					),
				resume: (task, runtime, context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							yield* fromPromise(() =>
								runtime.commit(async (tx, current) => {
									const { executorEpoch } = await tx.doc(Meta);
									if (current.state.checkpoint.observingExecutorEpoch !== executorEpoch)
										return { status: "running", checkpoint: { ...current.state.checkpoint, observingExecutorEpoch: executorEpoch } };
								}, context),
							);
							yield* this.#waitUntil(runtime.signal, () => {
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
							if (!a || a.status === "canceled" || a.status === "submitted") {
								yield* fromPromise(() =>
									runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
								);
								return yield* this.reconcile();
							}
							const round = task.state.checkpoint.round;
							// A crash may leave the accepted rebind ahead of this task's checkpoint.
							if (a.status !== "queued" && a.status !== "running") {
								const rebound = yield* this.#command(a, {
									type: "rebindAttempt",
									providerIdle: true,
									environment: a.passRef ? "stopped" : "absent",
									effects: "reconciled",
									executorEpoch: this.#ledger!.status().executorEpoch,
								});
								if (rebound.status !== "accepted") throw new Error(`Role continuation refused: ${rebound.code}`);
							}
							return yield* fromPromise(() =>
								runtime.commit(
									() => ({
										status: "running",
										checkpoint: {
											phase: "run",
											round: round + 1,
											consumed: currentChildren(this.#assignments(), a.id).map((child) => child.id),
										},
									}),
									context,
								),
							);
						}),
					),
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
		// The prior release's task keeps its exact meaning to drain work it admitted (spec §10 version policy); a human
		// retry of the blocked handoff then stages actual preparation. New handoffs never stage it.
		this.#priorPreparation = defineTask<{ assignment: string }, { phase: "blocked" }, null>({
			name: "render.implementation-preparation",
			version: 1,
			initial: () => ({ phase: "blocked" }),
			phases: {
				blocked: (task, runtime, context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							const owner = this.#assignment(task.input.assignment);
							if (!owner) throw new Error("Missing sealed handoff owner");
							const reply = yield* this.#command(owner, {
								type: "recordPreparationBlocker",
								reason: "preparation_capability_unavailable; Watchdog has not run",
							});
							if (reply.status !== "accepted") throw new Error(`Preparation blockage retention failed: ${reply.code}`);
							return yield* fromPromise(() =>
								runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
							);
						}),
					),
			},
			abort: (_task, runtime, context) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
		});
		// Deterministic host work, not a role: Ledger state says which attempts exist, so a resumed task continues them.
		this.#preparation = defineTask<{ assignment: string; from?: number }, { phase: "prepare"; scope?: ExecutionScope }, null>({
			name: "render.target-preparation",
			version: 1,
			initial: () => ({ phase: "prepare" }),
			phases: {
				prepare: (task, runtime, context) =>
					runPromise(
						Effect.gen({ self: this }, function* () {
							yield* this.#prepareHandoff(
								task.id,
								task.input.assignment,
								task.input.from ?? 0,
								task.state.checkpoint.scope,
								(scope) => runtime.commit(() => ({ status: "running", checkpoint: { phase: "prepare", scope } }), context),
								runtime.signal,
							);
							return yield* fromPromise(() =>
								runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result: null } }), context),
							);
						}),
					),
			},
			abort: (_task, runtime, context) => runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context),
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
		registry.install(
			defineExtension({ name: "render.tasks", tasks: [this.#run, this.#notify, this.#preparation, this.#priorPreparation] }),
		);
		return {
			models: this.#models,
			registry,
			settings: { extensions: [], retry: { maxRetries: 0 }, compaction: { enabled: true, backgroundTokens: 0 } },
			onReport: (error, info) => {
				onReport(error, info);
				if (info.type === "task_faulted" && this.#ready) {
					const a = this.#assignments().find((a) => a.task === info.task.id || a.conversation === info.task.conversationId);
					if (a && a.status !== "submitted" && a.status !== "canceled")
						void runPromise(this.#command(a, { type: "recordBlocker", reason: "runtime_task_faulted_reconciliation_required" })).catch(
							() => {},
						);
				}
			},
			bindLedger: (ledger, harness) => {
				this.#cached = undefined;
				this.#ledger = ledger;
				this.#harness = harness;
			},
			afterResume: () => {
				this.#ready = true;
				void runPromise(this.reconcile()).catch(() => {});
				for (const w of this.#publications()) this.#schedulePublication(w.workflow);
			},
			beforeResume: () =>
				runPromise(
					Effect.gen({ self: this }, function* () {
						for (const a of this.#assignments()) {
							if (a.executing && a.packet.experiment) {
								if (a.status === "running" && a.experimentSource && this.#experiments) {
									yield* Effect.gen({ self: this }, function* () {
										yield* this.#experiments!.stop(a);
										yield* this.#command(a, {
											type: "rebindAttempt",
											providerIdle: true,
											environment: "stopped",
											effects: "reconciled",
											executorEpoch: this.#ledger!.status().executorEpoch,
										});
									}).pipe(
										Effect.catchCause((cause) => {
											if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
											const error = Cause.squash(cause);
											return Effect.gen({ self: this }, function* () {
												yield* this.#command(a, {
													type: "recordBlocker",
													reason: `experiment_reconciliation_required: ${error}`.slice(0, 1900),
												});
											});
										}),
									);
								} else {
									if (a.status === "running")
										yield* this.#command(a, {
											type: "recordBlocker",
											reason: "experiment_interrupted_reconcile_original_evidence_or_start_new_round",
										});
									yield* this.#stopExperiment(this.#assignment(a.id)!);
								}
								continue;
							}
							if (!a.executing || a.packet.execution !== "linux-writer" || !this.#sandboxes) continue;
							yield* Effect.gen({ self: this }, function* () {
								const scope = this.#scope(a, a.status === "canceling");
								const stopped = yield* this.#sandboxes!.stop({ scope });
								for (const diagnostic of stopped.executions)
									yield* this.#diagnostic(a, scope, diagnostic.source ?? stopped.source, diagnostic.result, diagnostic);
								if (a.passRef && a.status === "running") {
									const capture = yield* this.#sandboxes!.seal(stopped.handle);
									const source = yield* this.#effects!.perform({ type: "retain", base: stopped.source, capture });
									yield* this.#effects!.reconcile(source);
									yield* this.#recordImplementationSource(a, "checkpoint", source);
									yield* this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "stopped", effects: "reconciled" });
									const reply = yield* this.#command(this.#assignment(a.id)!, {
										type: "rebindAttempt",
										providerIdle: true,
										environment: "stopped",
										effects: "reconciled",
										executorEpoch: this.#ledger!.status().executorEpoch,
									});
									if (reply.status !== "accepted") throw new Error(`Implementation recovery refused: ${reply.code}`);
								} else {
									if (a.status === "running")
										yield* this.#command(a, {
											type: "recordBlocker",
											reason: "owned_check_interrupted_source_evidence_requires_reconciliation",
										});
									yield* this.#command(this.#assignment(a.id)!, {
										type: "recordQuiescence",
										providerIdle: true,
										environment: "stopped",
										effects: "reconciled",
									});
								}
							}).pipe(
								Effect.catchCause((cause) => {
									if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
									return Effect.gen({ self: this }, function* () {
										yield* this.#command(a, { type: "recordBlocker", reason: "owned_check_quarantined_stop_unconfirmed" });
									});
								}),
							);
						}
						for (const a of this.#assignments()) {
							if (!a.executing || a.status !== "running" || a.packet.execution !== "read-only") continue;
							// An interrupted round may have left its own check runtime; it stops before the same review resumes.
							if (a.watchdogReview && !a.watchdogReview.checks && this.#sandboxes) {
								const stopped = yield* Effect.exit(this.#stopPreparationScope(this.#scope(a)));
								if (Exit.isFailure(stopped)) {
									const error = Cause.squash(stopped.cause);
									yield* this.#command(a, {
										type: "recordBlocker",
										reason: `watchdog_check_quiescence_unconfirmed: ${error}`.slice(0, 1900),
									});
									continue;
								}
							}
							yield* this.#command(a, {
								type: "rebindAttempt",
								providerIdle: true,
								environment: "absent",
								effects: "reconciled",
								executorEpoch: this.#ledger!.status().executorEpoch,
							});
						}
					}),
				),
			roleTasks: {
				stage: async (tx, intent, a) => {
					const workflow = await tx.doc(Workflow, a.workflow, null);
					if (!workflow.exists) throw new Error("Missing workflow owner");
					if (intent.kind === "prepare-pass")
						return tx.createTask(
							this.#preparation,
							{ assignment: a.id, from: intent.from ?? 0 },
							{ conversationId: workflow.conversation as ConversationId, ownership: { kind: "conversation" } },
						);
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
					const tools = (this.#roles.tools ?? []).filter(
						(tool) => (a.passRef || !tool.name.startsWith("implementation_")) && (tool.name !== "experiment_run" || !!a.packet.experiment),
					);
					await configure(tx, a.conversation as ConversationId, {
						model: { provider: a.packet.provider, modelId: a.packet.model },
						thinkingLevel: a.packet.thinking,
						extensions: [this.#roles],
						tools,
						modelTools: tools,
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
						void runPromise(this.reconcile()).catch(() => {});
					});
				},
			},
		};
	}

	render(a: RoleAssignment): Effect.Effect<string, unknown> {
		return Effect.gen({ self: this }, function* () {
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
			const retained = yield* this.#ledger!.artifact(context, { read: a.packetRef });
			if (!("content" in retained) || retained.content.toString("utf8") !== JSON.stringify(a.packet))
				throw new Error(`Restore exact packet ${a.packetRef}; binding is missing, corrupt or incompatible.`);
			const inputs: { ref: string; text: string }[] = [];
			if (a.packet.investigation && !current.investigationSource)
				throw new Error("Required investigation source observation is unavailable.");
			for (const ref of [
				...packetRefs(a.packet),
				...experimentInputs(this.#assignments(), a.packet),
				...(current.experimentSource ? [current.experimentSource] : []),
				...(current.investigationSource ? [current.investigationSource] : []),
				...(current.watchdogReview?.checks ? [current.watchdogReview.checks] : []),
			]) {
				const value = yield* this.#ledger!.artifact(context, { read: ref });
				if (!("content" in value)) throw new Error(`Required exact input ${ref}: ${value.code}`);
				inputs.push({ ref, text: value.content.toString("utf8") });
			}
			// Earlier rounds are context, not required inputs: an unavailable one means a full review, never a reset count.
			const prior: { ref: string; text?: string; unavailable?: string }[] = [];
			for (const ref of current.watchdogReview?.prior ?? []) {
				const value = yield* this.#ledger!.artifact(context, { read: ref });
				prior.push("content" in value ? { ref, text: value.content.toString("utf8") } : { ref, unavailable: value.code });
			}
			const results = currentChildren(this.#assignments(), a.id)
				.filter((child) => child.status === "submitted")
				.map((child) => ({ assignment: child.id, report: child.report }));
			const frame = this.#frame()!;
			if (!("policy" in frame)) throw new Error("Current policy is unavailable.");
			const policy = frame.policy as import("../kernel/policy.ts").PolicyState;
			const binding = policy.bindings[a.workflow];
			if (!binding || (a.policyBinding !== undefined && a.policyBinding !== binding.revision))
				throw new Error("Stale workflow policy binding.");
			let verification: SelectedCatalog | undefined;
			if (a.packet.verification && !a.passRef) {
				if (!this.#effects) throw new Error("Verification catalog trusted source capability unavailable.");
				const source = yield* this.#effects!.perform({
					type: "resolve",
					project: this.#project(a.workflow),
					commit: a.packet.verification!.commit,
				});
				verification = selectCatalog(source, a.packet.verification);
			}
			const workflow = (frame.workflows as import("../kernel/kernel.ts").WorkflowView[]).find((w) => w.workflow === a.workflow);
			const checkpointState = a.packet.role === "coordinator" && !a.packet.investigation && workflow ? workflow.checkpoints : undefined;
			const implementation = a.passRef
				? (frame.implementationPasses as ImplementationPass[]).find((pass) => pass.ref === a.passRef)
				: undefined;
			if (a.passRef && !implementation) throw new Error("Missing retained implementation pass");
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
				...(workflow && a.packet.role === "coordinator" && !a.packet.investigation
					? {
							intakes: {
								...workflow.intakes,
								drafts: workflow.intakes.drafts.filter((d) => a.packet.inputs.includes(d.manifest.ground)),
								concerns: workflow.intakes.concerns.filter((n) =>
									workflow.intakes.drafts.some((d) => d.id === n.intake && a.packet.inputs.includes(d.manifest.ground)),
								),
							},
						}
					: {}),
				...(a.intakeReview
					? {
							intakeReview: {
								...a.intakeReview,
								instructions:
									"Fresh independent exact-basis fidelity. Compare full intake, approved decisions, human Ground, applicable existing-seam sources, evidence and every saved concern for omitted, weakened, strengthened, contradictory or invented obligations. Typed lint cannot prove semantic fidelity. Distinguish transcription repairs (restage/review) from technical decisions (revised approved checkpoint) and product/Contract changes (human direction); do not waive unresolved decisions. Submit JSON schema:1,intake,manifest,annotations,checks:{omitted,weakened,strengthened,contradictory,invented} with reasoned text,findings:[{kind,reason}]. Nonempty findings block acceptance. Never accept a Contract.",
							},
						}
					: {}),
				...(a.packet.role === "coordinator" && !a.packet.investigation
					? {
							intakeInstructions:
								"Use checkpoint for stageIntake:{expected:latestIntakeOrNull,text:completeContract,manifest:{schema:1,shape,ground,sources,decisions,catalog,breakdown,slices,checks,mapping,dependencies,responses,unresolved}} then requestIntakeReview:{intake,key:configuredChallenger}. A bug manifest also carries reproduction:{obligation,observed,expected}: Ground's observed wrong behavior and expected correction verbatim, naming its one behavior obligation. catalog is null only for a verify-create that creates the repository's first asset, where every check is new. Read all approved sources and complete obligations; new runnable checks are deliverables, not executed evidence. Bug/performance use one compact Slice, change keeps a bounded breakdown; a Record Slice (record:true) holds only obligations {id,kind:'record',output:'adr'|'principle'|'design',text,sources} citing approved nodes or approved existing-seam sources; existing-seam paths need no new Seams/Modules solely for build dependencies. Shortened-path human Ground names goal, donePredicate, constraints, facts and approvedSources. Design cites actual approved nodes and decision refs. Preserve all saved concerns with reasoned resulting obligation mappings. Fresh fidelity reviews the exact immutable draft; changed decisions or annotations need current review. Only authenticated human acceptIntake/amendContract/supersedeContract accepts obligations. Record/integration dependencies remain blocked until real qualifying integration; there is no delivery bypass.",
						}
					: {}),
				...(verification ? { verification } : {}),
				...(verification?.selection.maintenance
					? {
							maintenanceInstructions:
								"Verify-maintain, read-only. Read the cited maintenance runs: every non-human row's actual results, invalid definitions, journey sanity and discovery output. Classify each non-human row from that observed basis: clean only when it executed and meets its expectations; changed only for proven harness drift (stale command/path, discovery no longer matching a dependent row), never to make a product pass; blocked with cause product for a product regression (a finding for separate accepted work) or prerequisite when a required tool/fixture is unavailable. Compare each discovery row with the dependent rows it indexes. Human rows stay advisory. No product fixes and no lowered expectations; corrections are ordinary accepted source work. With a basis, judge the corrected run: claim changed only for rows the basis classified changed that now executed successfully. Submit JSON {schema:1,maintenance:{row:{status,reason,cause?,compared?}}}.",
						}
					: {}),
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				packet: a.packet,
				...(a.auditReview
					? {
							auditReview: a.auditReview,
							auditInstructions:
								"Inspect only this immutable A and accepted obligations, not later B/X. A's retained record carries its verification: the selected verifier and the results the implementer ran on A, not checks you ran. Submit schema:1 plus exact auditReview fields and findings:[{id,text,needsHuman}]. Report all violations; unresolved product/Contract choices need human direction. Own scope only; no inherited implementer conversation or other-axis context.",
						}
					: {}),
				...(current.watchdogReview
					? {
							watchdogReview: { ...current.watchdogReview, prior },
							watchdogInstructions:
								"Fresh independent Watchdog round on exact prepared X/T. Inputs hold the accepted Contract, pass record, handoff (B, dispositions and completion table), sealed B, pre-fix Audit source A with both Audit reports, the preparation record for X/T and, once retained, your own checks: literal X plus the results the host ran for you on exact X in Linux with X's own verifier. Audit examined A, never B/X: independently judge actual X, its fixes and integration effects with T. Add no obligations and waive no scope; you cannot edit source or Debt Markers. prior holds earlier rounds' reports, return observations and any human direction that resolved a stopped round; judge fixes against that direction, which waives no Contract scope. When any prior item is unavailable, perform a full review of X rather than a delta. Submit JSON {schema:1,verdict:'pass'|'rework'|'needs-human',passRef,handoff,source,prepared,target} copied exactly from watchdogReview, plus findings:[{id,text}] and directions:[] for rework, with verification {outcome,rank,reason} assessing your own checks. A pass needs your own passing checks; unresolved product/Contract choices are needs-human.",
						}
					: {}),
				...(implementation
					? {
							implementation: {
								...implementation,
								audit: implementation.audit ? { ...implementation.audit, reports: results } : undefined,
							},
							verificationAuthoring: VERIFICATION_AUTHORING,
							implementationInstructions:
								"Use implementation_execute for coding commands in owned Linux only. Bootstrap the selected verification asset if absent and maintain affected checks as ordinary accepted source work; new rows name deliverables. Run tests before implementation; never lower accepted expectations. implementation_audit captures/checks A, stops the runtime and stages exactly two fresh reviewers. Read both reports; fix/dispose every finding with reasons and exact source/check refs, without requesting a second Audit. Caches, services and Git metadata do not survive capture; rerun setup as needed. For a bug Contract, before product code write the regression check named by the Contract's reproduction, then implementation_reproduce captures and checks the pre-fix source: it is red-on-the-bug only when a regression row fails showing the reported wrong behavior. A missing prerequisite, setup failure or passing row is reported in its reply and blocks Audit; report it rather than claiming a correction. Use implementation_check to capture/check final B before naming its exact revision in fixed dispositions (changes:[captureB], rechecks:[catalogRowNames]). implementation_handoff reuses unchanged sealed B, or captures/checks it when absent, and accepts only a passing current completion table. Audit remains about A, not B/X. Preparation/Watchdog may be unavailable and are not a full delivery pass. Report verifier changes separately. When implementation.opening is present this is a new pass after a retained handoff: the workspace starts from opening.base, the observation in inputs says why (after Watchdog rework, the cited Watchdog report with its findings and directions is also in inputs, and after a human-directed return so is the human's direction: address them), predecessor source and reports are read-only references, and this pass needs its own Audit before its own handoff. After a preparation conflict, the retained preparation record in inputs holds Git's exact conflict output, and read-only originals are mounted at /candidates/implementation (B), /candidates/base (recorded base T0) and /candidates/target (T1); reapply and resolve in the writable workspace, never guess.",
						}
					: {}),
				...(a.packet.experiment
					? {
							experiment: {
								instructions:
									"Apply only the immutable protocol. experiment_run executes inside your own container. Candidates may implement only their assigned experiment in /workspace. Parent originals are sealed read-only /candidates/<id>; use /workspace as independent rerun scratch. No criteria changes, original repairs, adoption or publication. Material deviations require another protocol/round. submit_role_result seals the whole container and retains exact source and raw results before accepting your report. Submit JSON schema:1, protocol:<exact revision>, outcome:positive|negative|inconclusive|deviation, summary, measurements:[{name,value:number,unit}], failures:[], limits:[]. A report is a model claim, not a runner observation. Ordinary networking can reach host/LAN/tailnet; credentials and other candidate workspaces are not granted.",
							},
						}
					: {}),
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
								agreedScopeRef: workflow?.checkpoints.requests.find((r) => r.id === a.checkpointReview!.request)?.scope,
								instructions:
									"Fresh non-fork exact-revision challenge. Read the full emission, manifest, Ground, principles and saved concerns. Assess alternatives, interactions, scale, usage, incidental choices, and nearby-example copying. Judge genuinely different decompositions, dependency categories, verification seams, depth/locality/deletion and what was decided beyond the question; typed lint is not merit. Submit JSON schema:1, emission, manifest, annotations, checks:{alternatives,interactions,scale,usage,incidentalChoices,nearbyCopying} with reasoned text, objections:[{id,node,reason}]. For delegated routing also submit delegation:{agreedScopeRef,reason,unresolvedProduct:[nodeIds],scopeChanges:[nodeIds],humanDecisions:[exactHumanRefs]}. Independently assess author classification and human scope, flag unresolved product choices even if labeled technical; carried product constraints require retained human decisions. No approval authority.",
							},
						}
					: {}),
				...(a.packet.role === "coordinator" && !a.packet.investigation
					? {
							checkpointInstructions:
								"Use checkpoint with a JSON command. requestCheckpoint: {stage:'seams'|'modules',scope:humanGroundRef,required:{candidates:boolean,experiment:boolean}}. Preserve its request identity through rework/retry. For required candidates, configure at least two read-only candidate packets with common Ground/inputs and distinct conditions. Call request_role {key,request} for each captured candidate key. Wait for all answers, read and cite every report in the synthesis manifest before staging or challenge. Required unavailable evidence blocks, never waive it. stageCheckpoint: {request,text:completeMarkdown,manifest:{schema:1,stage,nodes:[{id,decision,rationale,alternatives,evidence,classification,default,humanDecision?:exactHumanRef}],decompositions:[{id,modules,dependencies,verificationSeams,depth,locality,deletion}],verificationStrategy,incidentalChoices,responses:[{concern,disposition,reason,resulting:nodeId}]}}. Seams compares genuinely different decompositions. Request exact fresh challenge with requestCheckpointReview:{request,key:configuredChallengerKey}; retrieve the child report. emitCheckpoint:{request,review:reportRef,contested:[{objection,disposition,reason,resulting:nodeId}]} answers every objection. Changed text needs a new stage and review. Human concerns must all survive and receive reasoned mappings. reworkCheckpoint requires saved concerns/reason. Never treat Markdown identity fields or save as consent; human approveCheckpoint or captured delegated advanceDelegatedCheckpoint accepts only original emitted bytes. advanceDelegatedCheckpoint:{request,emission,manifest,annotations,policyBinding,decisions:{nodeId:alternative},nonbinding:[]} uses common exact evidence. Delegation cannot dismiss human notes as nonbinding or resolve new product/scope choices. Proposal/Contract acceptance is always human; changing defaults never changes pending routing.",
						}
					: {}),
				...(a.packet.investigation
					? {
							playbook: {
								shape: "investigation",
								instructions:
									"Read the complete scoped source, context, ADRs, full principles and verification instructions in inputs. Preserve human Ground separately from suggestions. No source writes, implementation commitment, delivery roles or publication. A model assertion is not execution evidence. Submit JSON with schema:1, outcome:'finding'|'escalation', summary, facts:[{text,citations:[{ref,path?}]}], uncertainties:[], limits:[], next:null for finding or {playbook:'design'|'experiment'|'change'|'bug'|'performance',reason,question} for escalation. Cite exact source ref plus path; cite other input refs without path. Required experiments/new seams/product choices/source changes escalate with facts, precise missing capability and next human question. Experiment escalation requires a separately retained protocol and explicit isolated experiment assignments; it never authorizes adoption. Other continuation playbooks remain unavailable in this staged build; suggestions confer no authorization.",
								source: current.investigationSource,
							},
						}
					: {}),
				executionPolicy: policy.revisions[binding.policy],
				policyBinding: binding.revision,
				inputs,
				results,
			});
		});
	}

	reconcile(_workflow?: string): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (!this.#ready || !this.#ledger || !this.#harness) return;
			if (this.#reconciling) {
				this.#reconcileAgain = true;
				return;
			}
			this.#reconciling = true;
			return yield* Effect.gen({ self: this }, function* () {
				for (const a of this.#assignments()) {
					if (!a.executing && !a.runtimeTaskCaptured && (a.status === "submitted" || a.status === "canceled" || a.status === "blocked")) {
						const task = yield* fromPromise(() => this.#harness!.getTask(a.task as TaskId, ctx));
						if (task?.state.status === "terminal") yield* this.#command(a, { type: "recordRuntimeHistory", key: `settled:${a.task}` });
					}
					if (a.status === "canceling") {
						if (a.packet.experiment && a.executing) {
							const conversation = yield* fromPromise(() => this.#harness!.conversation(a.conversation as ConversationId, ctx));
							if (conversation) yield* fromPromise(() => conversation.abort(ctx));
							yield* this.#stopExperiment(a);
							continue;
						}
						if (a.packet.execution !== "read-only" && a.executing && this.#sandboxes) {
							yield* Effect.gen({ self: this }, function* () {
								if (a.passRef) {
									const conversation = yield* fromPromise(() => this.#harness!.conversation(a.conversation as ConversationId, ctx));
									if (!conversation) throw new Error("Missing implementing conversation");
									yield* fromPromise(() => conversation.abort(ctx));
								}
								yield* this.#sandboxes!.stop({ scope: this.#scope(a, true) });
								if (!this.#ownedActive.has(a.id) && !this.#implementationActive.has(a.id))
									yield* this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "stopped", effects: "reconciled" });
							}).pipe(
								Effect.catchCause((cause) => {
									if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
									return Effect.gen({ self: this }, function* () {
										yield* this.#command(a, { type: "recordBlocker", reason: "owned_check_quarantined_stop_unconfirmed" });
									});
								}),
							);
							continue;
						}
						if (a.packet.execution !== "read-only" && a.executing) {
							if (a.blocker !== "whole_environment_stop_unavailable")
								yield* this.#command(a, { type: "recordBlocker", reason: "whole_environment_stop_unavailable" });
							continue;
						}
						// A read-only Watchdog round may own a check environment: stop it whole before releasing the slot.
						let environment: "absent" | "stopped" = "absent";
						if (a.watchdogReview && !a.watchdogReview.checks && a.executing && this.#sandboxes) {
							const stopped = yield* Effect.exit(this.#stopPreparationScope(this.#scope(a, true)));
							if (Exit.isFailure(stopped)) {
								const error = Cause.squash(stopped.cause);
								// Debt: no fault injection makes a Docker stop fail here; this held-slot branch is verified by inspection only.
								const reason = `watchdog_check_quiescence_unconfirmed: ${error}`.slice(0, 1900);
								if (a.blocker !== reason) yield* this.#command(a, { type: "recordBlocker", reason });
								continue;
							}
							environment = stopped.value;
						}
						const c = yield* fromPromise(() => this.#harness!.conversation(a.conversation as ConversationId, ctx));
						if (!c) {
							yield* this.#command(a, { type: "recordBlocker", reason: "missing_execution_conversation" });
							continue;
						}
						yield* fromPromise(() => c.abort(ctx));
						yield* this.#command(a, { type: "recordQuiescence", providerIdle: true, environment, effects: "reconciled" });
					}
				}
				// A scope change on an unchanged head reaches the PR summary on the next reconcile, not only on new source.
				for (const w of this.#publications()) if (w.publication.summaryStale) this.#schedulePublication(w.workflow);
			}).pipe(
				Effect.ensuring(
					Effect.sync(() => {
						this.#reconciling = false;
						if (this.#reconcileAgain) {
							this.#reconcileAgain = false;
							void runPromise(this.reconcile()).catch(() => {});
						}
					}),
				),
			);
		}).pipe(Effect.uninterruptible);
	}
	#waitUntil(signal: AbortSignal, ready: () => boolean): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			// The task's existing run/resume checkpoint is durable. Observation is only a wakeup hint:
			// after reopen the phase checkpoints its new observation epoch and rechecks committed state.
			// Waiters share one scheduling frame per committed sequence (`#frame`), so queued work stays cheap per commit.
			const { promise, resolve, reject } = Promise.withResolvers<void>();
			const observation = Effect.runSync(
				this.#ledger!.observe(scheduling, {
					send: () => {
						if (ready()) resolve();
					},
					end: () => reject(new Error("Role observation ended.")),
				}),
			);
			if (!("snapshot" in observation)) throw new Error(`Role observation refused: ${observation.code}`);
			const abort = () => reject(signal.reason);
			return yield* Effect.gen({ self: this }, function* () {
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) abort();
				else if (ready()) resolve();
				yield* fromPromise(() => promise);
			}).pipe(
				Effect.ensuring(
					Effect.sync(() => {
						signal.removeEventListener("abort", abort);
						observation.stop();
					}),
				),
			);
		});
	}
	/**
	 * The scheduling view of committed state, built once per Ledger sequence and shared by every reader (V9: one frame per
	 * commit, not one per waiting task). Frozen, because it is shared: Engine never edits committed state in place.
	 */
	#frame(): ReturnType<Ledger["snapshot"]> | undefined {
		if (!this.#ledger) return undefined;
		const sequence = this.#ledger.status().sequence;
		if (this.#cached?.sequence !== sequence) this.#cached = { sequence, frame: deepFreeze(this.#ledger.snapshot(scheduling)) };
		return this.#cached.frame;
	}
	/** The workflow's current project. Engine passes its facts to Effects, which never reads Ledger. */
	#projectOf(workflow: string): Project {
		const frame = this.#frame() as { workflows?: WorkflowView[]; projects?: Project[] } | undefined;
		const id = frame?.workflows?.find((w) => w.workflow === workflow)?.project;
		const project = frame?.projects?.find((p) => p.id === id);
		if (!project) throw new Error(`project_unavailable: ${workflow} has no current project`);
		return project;
	}
	#project(workflow: string): ProjectFacts {
		return projectFacts(this.#projectOf(workflow));
	}
	/** A check's Linux profile on the project's check image, by tag; Sandboxes records the digest it resolves to (X10). */
	#profile(check: OwnedChecks["checks"][string], workflow: string): LinuxProfile {
		return { ...check.profile, image: this.#projectOf(workflow).checkImage };
	}
	#assignments(): RoleAssignment[] {
		const frame = this.#frame();
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
	#implementationPass(a: RoleAssignment): ImplementationPass {
		const frame = this.#frame()!;
		const pass =
			"implementationPasses" in frame ? (frame.implementationPasses as ImplementationPass[]).find((p) => p.ref === a.passRef) : undefined;
		if (!pass) throw new Error("Missing retained implementation pass");
		return pass;
	}
	#implementationWorkspace(a: RoleAssignment) {
		return Effect.gen({ self: this }, function* () {
			const current = this.#assignment(a.id);
			if (
				!current ||
				current.status !== "running" ||
				!current.executing ||
				current.generation !== a.generation ||
				current.attempt !== a.attempt ||
				current.executorEpoch !== this.#ledger!.status().executorEpoch
			)
				throw new Error("Implementation execution authority is no longer current");
			const final = this.#implementationPass(a).captureB;
			if (final) {
				// A direct role command must not hand off obsolete B after this workspace becomes writable.
				const admitted = yield* this.#ledger!.command(
					{
						version: 1,
						authorityEpoch: this.#ledger!.status().authorityEpoch,
						commandId: `implementation-execution:${a.id}:${a.generation}:${a.attempt}:${final}`,
						workflow: a.workflow,
						command: { type: "recordImplementationExecution", assignment: a.id, generation: a.generation, attempt: a.attempt },
					},
					mintContext({ kind: "host", scope: "effects" }),
				);
				if (admitted.status !== "accepted") throw new Error(`Execution admission refused: ${admitted.reason}`);
			}
			const check = this.#config.ownedChecks!.checks[a.packet.profile]!;
			const previous = this.#workspaces.get(a.id);
			if (previous && !previous.sealed) return previous;
			const pass = this.#implementationPass(a);
			let source = previous?.source;
			if (!source) {
				if (pass.workspace) {
					const read = yield* this.#ledger!.artifact(scheduling, { read: pass.workspace! });
					if (!("content" in read)) throw new Error(`Restore exact workspace source ${pass.workspace}`);
					const receipt = (JSON.parse(read.content.toString()) as { source: SourceReceipt }).source;
					yield* this.#effects!.reconcile(receipt);
					source = receipt.source;
				} else
					source = yield* this.#effects!.perform({
						type: "resolve",
						project: this.#project(a.workflow),
						commit: pass.opening?.base ?? check.commit,
					});
			}
			const readOnly = yield* this.#conflictOriginals(pass, this.#project(a.workflow));
			const inputs = readOnly ? { ...source, readOnly } : source;
			this.#implementationAdmitted.add(a.id);
			let handle!: SandboxHandle;
			yield* Effect.gen({ self: this }, function* () {
				handle = yield* this.#sandboxes!.prepare(
					this.#scope(a),
					this.#profile(check, a.workflow),
					previous ? { source: inputs, after: previous.handle } : inputs,
				);
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.sync(() => {
						if (error instanceof SandboxInputRefusal && !previous) this.#implementationAdmitted.delete(a.id);
						throw error;
					});
				}),
			);
			const workspace = { handle, source, sealed: false };
			this.#workspaces.set(a.id, workspace);
			return workspace;
		});
	}
	#sealImplementation(a: RoleAssignment): Effect.Effect<SourceReceipt, unknown> {
		return Effect.gen({ self: this }, function* () {
			const workspace = this.#workspaces.get(a.id);
			if (!workspace) throw new Error("No current implementation workspace to capture");
			const capture = yield* this.#sandboxes!.seal(workspace.handle);
			const receipt = yield* this.#effects!.perform({ type: "retain", base: workspace.source, capture });
			yield* this.#effects!.reconcile(receipt);
			workspace.source = receipt.source;
			workspace.sealed = true;
			return receipt;
		});
	}
	#recordImplementationSource(
		a: RoleAssignment,
		kind: "audit" | "final" | "checkpoint" | "reproduction",
		source: SourceReceipt,
		verification?: CatalogEvidence,
	) {
		return Effect.gen({ self: this }, function* () {
			const text = JSON.stringify({ schema: 1, source, ...(verification ? { verification } : {}) });
			const reply = yield* this.#ledger!.command(
				{
					version: 1,
					authorityEpoch: this.#ledger!.status().authorityEpoch,
					commandId: `implementation-source:${a.id}:${kind}:${createHash("sha256").update(text).digest("hex")}`,
					workflow: a.workflow,
					command: { type: "recordImplementationSource", assignment: a.id, generation: a.generation, attempt: a.attempt, kind, text },
				},
				mintContext({ kind: "host", scope: "effects" }),
			);
			if (reply.status !== "accepted") throw new Error(`Source retention refused: ${reply.reason}`);
			return reply;
		});
	}
	/** Why a pass owner that stopped without handoff has no proof, from its latest retained checks rather than its own claim. */
	#unproven(a: RoleAssignment): Effect.Effect<string | undefined, unknown> {
		return Effect.gen({ self: this }, function* () {
			const ref = a.passRef ? this.#implementationPass(a).workspace : undefined;
			const read = ref ? yield* this.#ledger!.artifact(scheduling, { read: ref }) : undefined;
			const e =
				read && "content" in read ? (JSON.parse(read.content.toString()) as { verification?: CatalogEvidence }).verification : undefined;
			if (!e || e.verification.status === "needs_assessment") return;
			const gaps = e.results.filter((r) => r.status === "failed" || r.status === "unrun").map((r) => `${r.status} ${r.name}`);
			if (e.verification.status === "source_changed") gaps.push("source changed");
			return `verification_unproven: ${[...gaps, `cleanup ${e.cleanup.status}`].join("; ")}`.slice(0, 1900);
		});
	}
	#captureImplementation(a: RoleAssignment, kind: "audit" | "final" | "reproduction") {
		return Effect.gen({ self: this }, function* () {
			yield* this.#implementationWorkspace(a);
			const captured = yield* this.#sealImplementation(a);
			// Preserve progress even when the selected verifier is missing or its execution fails.
			yield* this.#recordImplementationSource(a, "checkpoint", captured);
			const selected = this.#implementationPass(a).configuration.verification;
			const entry = captured.source.entries.find((e) => e.path === selected.path && e.mode !== "120000");
			if (!entry) throw new Error(`Bootstrap the selected verification asset ${selected.path} as accepted source work before capture`);
			const digest = createHash("sha256").update(Buffer.from(entry.content, "base64")).digest("hex");
			const catalog = selectCatalog(captured.source, { ...selected, commit: captured.source.commit, digest, receipts: [] });
			const workspace = yield* this.#implementationWorkspace(a);
			const run = (argv: string[]) =>
				Effect.gen({ self: this }, function* () {
					const result = yield* this.#sandboxes!.execute(workspace.handle, {
						scope: this.#scope(a),
						argv,
						timeoutMs: this.#config.ownedChecks!.checks[a.packet.profile]!.timeoutMs,
						verifierRevision: digest,
					});
					yield* this.#diagnostic(a, this.#scope(a), workspace.source, result);
					return result;
				});
			const { results, cleanup } = yield* this.#catalogResults(a, catalog, run);
			const checked = yield* this.#sealImplementation(a);
			const verification: CatalogEvidence = {
				kind: "catalog-check",
				role: "implementer",
				catalog,
				results,
				cleanup,
				verification: {
					inputCommit: captured.source.commit,
					inputTree: captured.source.tree,
					resultTree: checked.source.tree,
					status:
						captured.source.tree !== checked.source.tree
							? "source_changed"
							: cleanup.status === "complete" &&
									requiredCatalogRows(catalog.selection).every((name) => results.some((r) => r.name === name && r.status === "completed"))
								? "needs_assessment"
								: "non-pass",
				},
			};
			return yield* this.#recordImplementationSource(a, kind, checked, verification);
		});
	}
	/** `a` null: host checks of prepared X, whose results are retained whole in the preparation record instead. */
	#catalogResults(a: RoleAssignment | null, catalog: SelectedCatalog, run: (argv: string[]) => Effect.Effect<ExecutionResult, unknown>) {
		return Effect.gen({ self: this }, function* () {
			const results: CatalogResult[] = [];
			for (const row of catalog.rows) {
				const result: CatalogResult = { name: row.name, status: row.kind === "human" ? "advisory" : "completed", steps: [] };
				if (row.gap) result.status = "invalid";
				else if (row.kind !== "human") {
					for (const command of row.journey?.steps ?? [row.run]) result.steps.push(yield* run(["sh", "-c", command]));
					if (row.journey) result.sanity = yield* run(["sh", "-c", row.journey.sanity]);
					const actual = [...result.steps, ...(result.sanity ? [result.sanity] : [])];
					if (actual.some((r) => r.exitCode === 126 || r.exitCode === 127)) result.status = "unrun";
					else if (actual.some((r) => r.exitCode !== 0 || r.timedOut)) result.status = "failed";
				}
				results.push(result);
			}
			if (a)
				yield* this.#retainDiagnostic(
					a.workflow,
					this.#scope(a),
					JSON.stringify({ schema: 1, kind: "catalog-results", catalog, results, cleanup: "pending", verification: "unaccepted" }),
				);
			const cleanup: CatalogEvidence["cleanup"] = { status: "complete", results: [] };
			for (const command of catalog.cleanup) cleanup.results.push(yield* run(["sh", "-c", command]));
			if (cleanup.results.some((r) => r.exitCode !== 0 || r.timedOut)) cleanup.status = "pending";
			return { results, cleanup };
		});
	}
	#quiesceImplementation(a: RoleAssignment) {
		return Effect.gen({ self: this }, function* () {
			return yield* Effect.gen({ self: this }, function* () {
				const workspace = this.#workspaces.get(a.id);
				if (workspace && !workspace.sealed) {
					const source = yield* this.#sealImplementation(a);
					yield* this.#recordImplementationSource(a, "checkpoint", source);
				}
				if (!workspace && this.#implementationAdmitted.has(a.id)) yield* this.#sandboxes!.stop({ scope: this.#scope(a) });
				yield* this.#command(this.#assignment(a.id)!, {
					type: "recordQuiescence",
					providerIdle: true,
					environment: workspace || this.#implementationAdmitted.has(a.id) ? "stopped" : "absent",
					effects: "reconciled",
				});
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.gen({ self: this }, function* () {
						yield* this.#command(this.#assignment(a.id)!, {
							type: "recordBlocker",
							reason: `implementation_quiescence_unconfirmed: ${error}`.slice(0, 1900),
						});
					});
				}),
			);
		});
	}
	#ownedCheck(a: RoleAssignment): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			const check = this.#config.ownedChecks!.checks[a.packet.profile]!;
			this.#ownedActive.add(a.id);
			// A fresh execution has not called prepare yet. Recovery never uses this local proof:
			// beforeResume reconciles the original scope and keeps uncertain journals quarantined.
			// Debt: a cancellation landing during trusted resolve fences prepare, finds no journal and stays quarantined.
			let environment: "absent" | "stopped" | undefined = "absent";
			return yield* Effect.gen({ self: this }, function* () {
				const base = yield* this.#effects!.perform({ type: "resolve", project: this.#project(a.workflow), commit: check.commit });
				if ("catalog" in check !== !!a.packet.verification)
					throw new Error("Catalog execution must be explicitly authorized; no operator-command fallback.");
				const catalog = a.packet.verification ? selectCatalog(base, a.packet.verification) : undefined;
				environment = undefined;
				const handle = yield* this.#sandboxes!.prepare(this.#scope(a), this.#profile(check, a.workflow), base);
				const run = (argv: string[]) =>
					Effect.gen({ self: this }, function* () {
						const execution = yield* this.#sandboxes!.execute(handle, {
							scope: this.#scope(a),
							argv,
							timeoutMs: check.timeoutMs,
							verifierRevision: catalog?.selection.digest ?? ("verifierRevision" in check ? check.verifierRevision : undefined),
						});
						yield* this.#diagnostic(a, this.#scope(a), base, execution);
						return execution;
					});
				let execution: ExecutionResult | undefined;
				const { results, cleanup } = catalog
					? yield* this.#catalogResults(a, catalog, run)
					: { results: [], cleanup: { status: "complete", results: [] } };
				if (!catalog && "argv" in check) execution = yield* run(check.argv);
				const capture = yield* this.#sandboxes!.seal(handle);
				environment = "stopped";
				const source = yield* this.#effects!.perform({ type: "retain", base, capture });
				yield* this.#effects!.reconcile(source);
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
					limits: {
						network: "ordinary bridge; reachable host/LAN/tailnet are not confined",
						macOS: "unrun",
						profile: this.#profile(check, a.workflow),
					},
					reviewWarning: source.configurationChanges.length
						? `REVIEW SOURCE CONFIGURATION CHANGES: ${source.configurationChanges.join(", ")}; never activated on host`
						: null,
				};
				const text = JSON.stringify(receipt);
				const reply = yield* this.#ledger!.command(
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
						yield* this.#ledger!.command(
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
						yield* this.#retainDiagnostic(
							a.workflow,
							this.#scope(a),
							JSON.stringify({ ...receipt, kind: "owned-check-diagnostic", observed: receipt.verification, verification: "unaccepted" }),
						);
						throw new Error(`Owned check receipt refused: ${reply.code}`);
					}
				}
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.gen({ self: this }, function* () {
						if (error instanceof SandboxInputRefusal) environment = "absent";
						const current = this.#assignment(a.id)!;
						yield* this.#command(current, {
							type: "recordBlocker",
							reason: `owned_check_blocked: ${current.blocker ? `${current.blocker}: ` : ""}${error}`.slice(0, 1900),
						});
						if (!environment) {
							return yield* Effect.gen({ self: this }, function* () {
								const result = yield* this.#sandboxes!.stop({ scope: this.#scope(a) });
								for (const diagnostic of result.executions)
									yield* this.#diagnostic(
										a,
										this.#scope(a),
										diagnostic.source ?? result.source,
										diagnostic.result,
										diagnostic.result ? undefined : diagnostic,
									);
								environment = "stopped";
							}).pipe(
								Effect.catchCause((cause) => {
									if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
									// Preserve executing capacity and quarantine until the original runtime is reconciled.
									return Effect.void;
								}),
							);
						}
					});
				}),
				Effect.ensuring(
					Effect.gen({ self: this }, function* () {
						this.#ownedActive.delete(a.id);
						if (environment)
							yield* this.#command(this.#assignment(a.id)!, {
								type: "recordQuiescence",
								providerIdle: true,
								environment,
								effects: "reconciled",
							});
					}).pipe(Effect.orDie),
				),
			);
		});
	}
	#diagnostic(
		a: RoleAssignment,
		scope: ExecutionScope,
		base: Source,
		execution?: ExecutionResult,
		interrupted?: unknown,
	): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
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
			yield* this.#retainDiagnostic(a.workflow, scope, text);
		});
	}
	#retainDiagnostic(workflow: string, scope: ExecutionScope, text: string): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			const reply = yield* this.#ledger!.command(
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
		});
	}
	#prepareInvestigation(a: RoleAssignment): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (a.investigationSource) return; // Exact retained bytes, never refetch a damaged historical citation.
			const input = a.packet.investigation!;
			const project = this.#project(a.workflow);
			if (input.repository !== project.id) throw new Error(`Investigation names ${input.repository}, not its project ${project.id}.`);
			const source = yield* this.#investigationEffects!.perform({ type: "resolve", project, commit: input.commit });
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
			const reply = yield* this.#ledger!.command(
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
		});
	}
	#stopExperiment(a: RoleAssignment): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			return yield* Effect.gen({ self: this }, function* () {
				if (!this.#experiments) throw new Error("experiment_capability_unavailable");
				yield* this.#experiments.stop(a, a.status === "canceling");
				yield* this.#command(a, { type: "recordQuiescence", providerIdle: true, environment: "stopped", effects: "reconciled" });
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.gen({ self: this }, function* () {
						yield* this.#command(a, { type: "recordBlocker", reason: `experiment_quarantined_stop_unconfirmed: ${error}`.slice(0, 1900) });
					});
				}),
			);
		});
	}
	/**
	 * Prepare and check current-target source for a handed-off pass (spec §9.4). Each attempt observes the canonical T,
	 * prepares X in Effects and checks actual X in Linux; Ledger retains one record per attempt before anything follows.
	 * Every exit leaves a visible result: a successor pass, an operational blocker or awaiting Watchdog.
	 */
	#prepareHandoff(
		taskId: number,
		assignmentId: string,
		from: number,
		prior: ExecutionScope | undefined,
		save: (scope: ExecutionScope) => Promise<unknown>,
		signal: AbortSignal,
	) {
		return Effect.gen({ self: this }, function* () {
			const owner = this.#assignment(assignmentId);
			if (!owner?.passRef) throw new Error("Missing sealed handoff owner");
			// Each preparation task settles once; a later retry's identical result is a new settlement, not a replay of this one.
			const block = (reason: string) =>
				Effect.gen({ self: this }, function* () {
					// After a cancellation with nothing left to reconcile, a refusal of work begun earlier is its expected end; the
					// cancellation reason stays the visible blocker.
					const h = this.#implementationPass(owner).handoff;
					if (h?.canceled && !unresolved(h.integrations?.at(-1))) return;
					const command = { type: "recordPreparationBlocker", reason: reason.slice(0, 1900) };
					const reply = yield* this.#command(this.#assignment(assignmentId)!, command, `preparation-task:${taskId}`);
					if (reply.status !== "accepted") throw new Error(`Preparation blockage retention failed: ${reply.code}`);
				});
			const check = this.#config.ownedChecks?.checks[owner.packet.profile];
			if (!check || !this.#effects || !this.#sandboxes)
				return yield* block("preparation_capability_unavailable: owned Effects/Sandboxes are not configured; Watchdog has not run");
			return yield* Effect.gen({ self: this }, function* () {
				// An interrupted earlier execution may have left a check runtime; it must stop before any new attempt runs.
				if (prior && prior.executorEpoch !== this.#ledger!.status().executorEpoch) yield* this.#stopPreparationScope(prior);
				for (;;) {
					const pass = this.#implementationPass(owner);
					const operation = pass.handoff?.integrations?.at(-1);
					if (integrated(pass) || (pass.handoff?.canceled && !unresolved(operation))) return;
					// An admitted or divergent operation is settled before anything else on this handoff (spec §9.3).
					if (unresolved(operation)) {
						const outcome = yield* this.#serialized(owner.workflow, () => this.#settleIntegration(owner, pass, operation!, block));
						if (outcome === "divergent" || outcome === "blocked") return;
						continue;
					}
					const refs = pass.handoff?.preparations ?? [];
					const ref = refs.length > from ? refs.at(-1) : undefined;
					const latest = ref ? yield* this.#preparationRecord(ref) : undefined;
					if (latest?.outcome === "operational") return;
					if (latest && ["conflict", "check-failure", "verifier-defect"].includes(latest.outcome))
						return yield* this.#returnToImplementation(owner, pass, latest, block);
					// One Watchdog round per checked X: an open one settles this task again when it submits.
					const rounds = this.#assignments().filter((r) => !!ref && r.watchdogReview?.preparation === ref && r.status !== "canceled");
					if (rounds.some((r) => r.status !== "submitted")) return;
					const done = rounds[0];
					const verdict = done ? watchdogVerdict(yield* this.#reportText(done)) : undefined;
					const counted = () =>
						`${completedReviews(this.#assignments(), owner.workflow, owner.slice).length} completed reviews, limit ${this.#reviewLimit(owner.workflow)}`;
					// A human direction on this stopped round returns it; otherwise only a rework verdict asks to.
					const direction = done && pass.handoff?.direction?.review === done.id ? pass.handoff.direction.revision : undefined;
					if (done && (direction || verdict?.verdict === "rework"))
						return yield* this.#returnToImplementation(owner, pass, latest!, block, done, direction);
					if (done && verdict?.verdict !== "pass")
						return yield* block(
							`needs_human: Watchdog ${done.id} ${verdict ? "requires human direction" : "submitted no bound verdict"} on prepared ${latest!.preparation!.result}; ${counted()}`,
						);
					yield* faultBarrier("before-target-observe", `preparation-observe:${pass.ref}:${refs.length}`);
					// A passing review integrates automatically when still current; otherwise it returns the observed target to prepare.
					const reviewed =
						latest && done
							? yield* this.#serialized(owner.workflow, () => this.#integrateReviewed(owner, pass, ref!, latest, done, check, block))
							: undefined;
					if (reviewed === "settled") return;
					if (reviewed === "again") continue;
					if (reviewed === "wait") {
						yield* this.#waitUntil(signal, () => {
							const frame = this.#frame()!;
							const passes = "implementationPasses" in frame ? (frame.implementationPasses as ImplementationPass[]) : [];
							return !serializing(passes, owner.workflow);
						});
						continue;
					}
					let observed = reviewed;
					if (!observed) {
						// An unbound proposal ref binds to the default branch Effects fetches now; a failed fetch blocks, never a stale T.
						const seen = yield* Effect.exit(
							this.#effects!.perform({ type: "observe", project: this.#project(owner.workflow), proposal: owner.workflow, initial: null }),
						);
						if (Exit.isFailure(seen)) {
							const error = Cause.squash(seen.cause);
							if (Cause.hasInterrupts(seen.cause) || !(error instanceof Error) || !error.message.startsWith("project_fetch_failed: "))
								return yield* Effect.failCause(seen.cause);
							return yield* block(error.message);
						}
						observed = seen.value;
					}
					const basis = this.#policyBasis(owner.workflow);
					if (!done && latest && latest.target.commit === observed.target.commit && latest.policy.binding === basis.binding) {
						if (!pass.configuration.watchdog)
							return yield* block(
								`awaiting_watchdog: prepared ${latest.preparation!.result} checked on current target ${observed.target.commit}; Watchdog capability unavailable: no Watchdog reviewer configured`,
							);
						// The launch carries this final pre-launch observation; Kernel binds the round to exactly this X/T and policy.
						const launched = yield* this.#ledger!.command(
							{
								version: 1,
								authorityEpoch: this.#ledger!.status().authorityEpoch,
								commandId: `watchdog-launch:${pass.ref}:${ref}`,
								workflow: owner.workflow,
								command: {
									type: "requestWatchdogReview",
									assignment: owner.id,
									generation: owner.generation,
									attempt: owner.attempt,
									preparation: ref,
									target: observed.target.commit,
								},
							},
							mintContext({ kind: "host", scope: "effects" }),
						);
						if (launched.status === "accepted") return;
						if (launched.code !== "stale_basis" || this.#policyBasis(owner.workflow).binding === basis.binding)
							return yield* block(`watchdog_launch_refused: ${launched.code}: ${launched.reason}`);
					}
					const record = yield* this.#preparationAttempt({ owner, pass, check, save }, refs.length + 1, observed, basis);
					const reply = yield* this.#ledger!.command(
						{
							version: 1,
							authorityEpoch: this.#ledger!.status().authorityEpoch,
							commandId: `preparation:${pass.ref}:${record.attempt}`,
							workflow: owner.workflow,
							command: {
								type: "recordPreparation",
								assignment: owner.id,
								generation: owner.generation,
								attempt: owner.attempt,
								text: JSON.stringify(record),
							},
						},
						mintContext({ kind: "host", scope: "effects" }),
					);
					// A policy adopted while this attempt ran supersedes its qualification: nothing was retained, so prepare again.
					// Each rerun needs another human adoption first, so the loop is paced by human policy changes.
					if (
						reply.status === "refused" &&
						reply.code === "stale_basis" &&
						record.policy.binding !== this.#policyBasis(owner.workflow).binding
					)
						continue;
					if (reply.status !== "accepted") throw new Error(`Preparation record refused: ${reply.code}: ${reply.reason}`);
				}
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.gen({ self: this }, function* () {
						return yield* block(`preparation_operational_error: ${error instanceof Error ? error.message : error}`);
					});
				}),
			);
		});
	}
	/** One proposal integrates at a time in this executor; Kernel independently refuses an unserialized admission. */
	#serialized<T>(workflow: string, run: () => Effect.Effect<T, unknown>): Effect.Effect<T, unknown> {
		return fromPromise(() => {
			const invoke = () => runPromise(run());
			const next = (this.#integrating.get(workflow) ?? Promise.resolve()).then(invoke, invoke);
			this.#integrating.set(
				workflow,
				next.then(
					() => {},
					() => {},
				),
			);
			return next;
		}).pipe(Effect.uninterruptible);
	}
	/**
	 * A completed passing review on current X/T stages its exact intent, takes current admission and leaves the dispatch
	 * to `#settleIntegration` (spec §9.3). No human grant or setting is consulted. A stale review returns the observed
	 * target so the same pass prepares again; the completed review stays counted. While another integration of the
	 * proposal is unresolved this one waits for it, never blocks on it.
	 */
	#integrateReviewed(
		owner: RoleAssignment,
		pass: ImplementationPass,
		preparation: string,
		record: PreparationRecord,
		review: RoleAssignment,
		check: OwnedChecks["checks"][string],
		block: (reason: string) => Effect.Effect<void, unknown>,
	): Effect.Effect<"settled" | "again" | "wait" | TargetObservation, unknown> {
		return Effect.gen({ self: this }, function* () {
			const observed = yield* this.#effects!.perform({
				type: "observe",
				project: this.#project(owner.workflow),
				proposal: owner.workflow,
				initial: check.commit,
			});
			const basis = this.#policyBasis(owner.workflow);
			const verdict = watchdogVerdict(yield* this.#reportText(review));
			const stale = reviewQualification({ pass, preparation, record, review, verdict, target: observed.target.commit, basis });
			const operation = pass.handoff!.integrations?.at(-1);
			if (stale || (operation?.preparation === preparation && operation.status === "stale")) return observed;
			const current = this.#assignment(owner.id)!;
			const command = (commandId: string, body: Record<string, unknown>) =>
				this.#ledger!.command(
					{
						version: 1,
						authorityEpoch: this.#ledger!.status().authorityEpoch,
						commandId,
						workflow: owner.workflow,
						command: { assignment: current.id, generation: current.generation, attempt: current.attempt, ...body },
					},
					mintContext({ kind: "host", scope: "effects" }),
				);
			const refused = (reply: { code: string; reason: string }) =>
				Effect.gen({ self: this }, function* () {
					if (reply.code === "ownership_conflict") return "wait" as const;
					yield* block(`integration_refused: ${reply.code}: ${reply.reason}`);
					return "settled" as const;
				});
			if (operation?.preparation !== preparation) {
				const X = record.preparation!;
				const T = observed.target;
				const message = `Render proposal integration\n\nproposal ${owner.workflow}\npass ${pass.ref}\nprepared ${X.result}\ntarget ${T.commit}\nreview ${review.id}\n`;
				const prepared = yield* this.#effects!.perform({ type: "read", project: this.#project(owner.workflow), commit: X.result });
				const R = yield* this.#effects!.perform({
					type: "squash",
					prepared,
					target: T,
					message,
				});
				const audit = pass.audit!;
				const intent = {
					schema: 1,
					kind: "proposal-integration",
					proposal: owner.workflow,
					ref: observed.ref,
					slice: pass.slice,
					contract: pass.contract,
					passRef: pass.ref,
					handoff: pass.handoff!.record,
					source: pass.handoff!.source,
					captureA: pass.captureA,
					audit: audit.record,
					reports: [audit.results.standards!.report, audit.results.contracts!.report],
					preparation,
					prepared: X.result,
					tree: X.tree,
					target: T.commit,
					review: review.id,
					report: review.report,
					result: { commit: R.commit, tree: R.tree, parent: T.commit, message },
					policy: basis,
					assignment: current.id,
					generation: current.generation,
					attempt: current.attempt,
					unresolved: [],
				};
				const staged = yield* command(`integration-stage:${pass.ref}:${preparation}`, {
					type: "stageOperation",
					text: JSON.stringify(intent),
				});
				return staged.status === "accepted" ? "again" : yield* refused(staged);
			}
			yield* faultBarrier("before-integration-admission", `integration:${pass.ref}`);
			const admitted = yield* command(`integration-admit:${operation.operation}:${operation.attempts.length + 1}`, {
				type: "admitEffect",
				operation: operation.operation,
			});
			if (admitted.status !== "accepted") return yield* refused(admitted);
			yield* faultBarrier("after-integration-admission", `integration:${pass.ref}`);
			return "again";
		});
	}
	/**
	 * Settles an admitted or divergent operation (spec §§9.1, 9.3). Only the executor epoch that holds the permit
	 * dispatches it, once; any other executor, or an uncertain dispatch, reconciles the canonical ref without rewriting
	 * it and records what it saw. Kernel derives the outcome; nothing is replayed or rolled back here.
	 */
	#settleIntegration(
		owner: RoleAssignment,
		pass: ImplementationPass,
		operation: Integration,
		block: (reason: string) => Effect.Effect<void, unknown>,
	): Effect.Effect<IntegrationOutcome | "blocked", unknown> {
		return Effect.gen({ self: this }, function* () {
			const attempt = operation.attempts.at(-1)!;
			const read = yield* this.#ledger!.artifact(scheduling, { read: operation.operation });
			if (!("content" in read)) {
				yield* block(`integration_operational_error: restore exact integration intent ${operation.operation}`);
				return "blocked";
			}
			const intent = JSON.parse(read.content.toString()) as IntegrationIntent;
			const epoch = this.#ledger!.status().executorEpoch;
			let seen: Omit<IntegrationObservation, "schema" | "operation" | "attempt">;
			let failure: string | undefined;
			if (operation.status === "admitted" && attempt.executorEpoch === epoch) {
				yield* Effect.gen({ self: this }, function* () {
					yield* faultBarrier("before-integration-cas", `integration:${pass.ref}`);
					const project = this.#project(owner.workflow);
					const result = yield* this.#effects!.perform({ type: "read", project, commit: intent.result.commit });
					const dispatched = yield* this.#effects!.perform({
						type: "integrate",
						project,
						proposal: owner.workflow,
						expected: intent.target,
						result,
						attempt: attempt.id,
					});
					const { dispatch, ...observed } = dispatched;
					seen = { mode: "dispatch", dispatch, ...observed };
					if (dispatch === "refused") failure = "canonical CAS refused";
				}).pipe(
					Effect.catchCause((cause) => {
						if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
						const error = Cause.squash(cause);
						return Effect.sync(() => {
							failure = error instanceof Error ? error.message : String(error);
						});
					}),
				);
			}
			seen ??= {
				mode: "reconcile",
				dispatch: null,
				...(yield* this.#effects!.reconcile({ type: "integration", project: this.#project(owner.workflow), proposal: owner.workflow })),
			};
			const current = this.#assignment(owner.id)!;
			const reply = yield* this.#ledger!.command(
				{
					version: 1,
					authorityEpoch: this.#ledger!.status().authorityEpoch,
					commandId: `integration-observe:${attempt.id}:${attempt.observations.length}:${seen.mode}:${epoch}`,
					workflow: owner.workflow,
					command: {
						type: "recordIntegration",
						assignment: current.id,
						generation: current.generation,
						attempt: current.attempt,
						operation: operation.operation,
						text: JSON.stringify({ schema: 1, operation: operation.operation, attempt: attempt.id, ...seen }),
					},
				},
				mintContext({ kind: "host", scope: "effects" }),
			);
			if (reply.status !== "accepted") {
				yield* block(`integration_observation_refused: ${reply.code}: ${reply.reason}`);
				return "blocked";
			}
			yield* faultBarrier("after-integration-qualification", `integration:${pass.ref}`);
			const outcome = reply.result.outcome as IntegrationOutcome;
			if (outcome === "applied") this.#schedulePublication(owner.workflow);
			// This executor's own dispatch left T unchanged: a visible operational blocker, never an automatic hot retry.
			if (outcome === "unapplied" && failure) {
				yield* block(`integration_operational_error: ${failure}`.slice(0, 1900));
				return "blocked";
			}
			return outcome;
		});
	}
	#publications(): { workflow: string; publication: PublicationView }[] {
		const frame = this.#frame();
		const workflows = frame && "workflows" in frame ? (frame.workflows as { workflow: string; publication: PublicationView | null }[]) : [];
		return workflows.filter((w): w is { workflow: string; publication: PublicationView } => !!w.publication?.canonical);
	}
	/**
	 * Proposal publication runs beside local work, never in front of it (spec §§9.2–9.3): integration and dependents
	 * never wait on it, and an unreachable forge or an unknown outcome only schedules another read-only pass later.
	 */
	#schedulePublication(workflow: string): void {
		if (!this.#config.forge || !this.#effects) return;
		if (this.#publishing.has(workflow)) {
			this.#publishAgain.add(workflow);
			return;
		}
		this.#publishing.add(workflow);
		const ledger = this.#ledger;
		void runPromise(this.#publish(workflow))
			.catch(() => true)
			.then((retry) => {
				this.#publishing.delete(workflow);
				if (ledger !== this.#ledger || ledger?.status().hostMode !== "active") return;
				if (this.#publishAgain.delete(workflow)) this.#schedulePublication(workflow);
				else if (retry) setTimeout(() => this.#schedulePublication(workflow), this.#config.forge!.retryMs ?? 30000).unref();
			});
	}
	/** Each step reads current Ledger state; Kernel derives payloads and decides what every observation means. Returns whether to retry. */
	#publish(workflow: string): Effect.Effect<boolean, unknown> {
		return Effect.gen({ self: this }, function* () {
			const owner = this.#assignments().find((a) =>
				(this.#frame() as { implementationPasses?: ImplementationPass[] }).implementationPasses?.some(
					(p) => p.workflow === workflow && p.assignment === a.id && integrated(p),
				),
			);
			if (!owner || !this.#config.ownedChecks?.checks[owner.packet.profile]) return false;
			const project = this.#project(workflow);
			const effects = mintContext({ kind: "host", scope: "effects" });
			const send = (command: Record<string, unknown>) =>
				Effect.gen({ self: this }, function* () {
					const ledger = this.#ledger!;
					const reply = yield* ledger.command(
						{
							version: 1,
							authorityEpoch: ledger.status().authorityEpoch,
							commandId: `forge:${workflow}:${ledger.status().sequence}:${command.type}`,
							workflow,
							command,
						},
						effects,
					);
					if (reply.status !== "accepted") throw new Error(`publication_refused: ${reply.code}: ${reply.reason}`);
					return reply.result;
				});
			const record = (o: Omit<ForgeObservation, "schema">) =>
				send({ type: "recordForgeObservation", text: JSON.stringify({ schema: 1, ...o }) });
			const observe = (operation: string | null) =>
				Effect.gen({ self: this }, function* () {
					const seen = yield* this.#effects!.reconcile({ type: "publication", project, proposal: workflow });
					yield* record({ operation, attempt: null, mode: "reconcile", outcome: null, reason: null, created: null, ...seen });
				});
			const dispatch = (op: ForgeOperation) =>
				Effect.gen({ self: this }, function* () {
					const attempt = (yield* send({ type: "admitForgeOperation", operation: op.operation })).forgeAttempt as string;
					const read = yield* this.#ledger!.artifact(scheduling, { read: op.operation });
					if (!("content" in read)) throw new Error(`Restore exact forge intent ${op.operation}`);
					const intent = JSON.parse(read.content.toString()) as Record<string, string>;
					const common = { project, proposal: workflow, attempt };
					let result!: ForgeDispatch;
					yield* Effect.gen({ self: this }, function* () {
						result = yield* this.#effects!.perform(
							op.kind === "publish-source"
								? { type: "publish", ...common, commit: intent.canonical!, expected: intent.expected ?? null }
								: op.kind === "create-proposal"
									? { type: "createProposal", ...common, title: intent.title!, body: intent.body! }
									: op.kind === "mark-ready"
										? { type: "markReady", ...common, pr: intent.pr! }
										: { type: "updateSummary", ...common, pr: intent.pr!, summary: intent.summary! },
						);
					}).pipe(
						Effect.catchCause((cause) => {
							if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
							const error = Cause.squash(cause);
							return Effect.sync(() => {
								result = { outcome: "unknown", reason: String(error).slice(0, 500), created: null, head: null };
							});
						}),
					);
					yield* record({
						operation: op.operation,
						attempt,
						mode: "dispatch",
						proposals: null,
						capabilities: null,
						observedAt: new Date().toISOString(),
						...result,
					});
				});
			const current = () => this.#publications().find((w) => w.workflow === workflow)?.publication;
			if (current()?.main) return false;
			yield* observe(null);
			for (let step = 0; step < 16; step++) {
				const p = current();
				if (!p || p.divergence || p.main) return false;
				const recovered = p.operations.find((o) => o.status === "admitted");
				if (recovered) {
					yield* observe(recovered.operation);
					continue;
				}
				const publish = p.operations.findLast((o) => o.kind === "publish-source");
				if (publish?.status === "unknown") {
					yield* observe(publish.operation);
					if (current()?.operations.find((o) => o.operation === publish.operation)?.status === "unknown") return true;
					continue;
				}
				if (p.published !== p.canonical) {
					if (p.unsupported.includes("guardedSourceUpdate")) return false;
					if (publish?.status === "planned") yield* dispatch(publish);
					else yield* send({ type: "stageForgeOperation", kind: "publish-source" });
					continue;
				}
				const create = p.operations.find((o) => o.kind === "create-proposal");
				if (!p.association) {
					if (!create) {
						if (p.unsupported.includes("draftProposalPR")) return false;
						yield* send({ type: "stageForgeOperation", kind: "create-proposal" });
					} else if (create.reissue || (create.status === "planned" && create.checked)) yield* dispatch(create);
					else if (create.status === "planned" || create.status === "unknown") {
						// Under sticky risk this only refreshes the listed candidates the human resolves from; Kernel never associates.
						yield* observe(create.operation);
						if (!current()?.association) return true;
					} else return false;
					continue;
				}
				if (p.risk && !p.risk.resolved) return false;
				const summary = p.operations.findLast((o) => o.kind === "update-summary" && o.status !== "superseded");
				if (summary?.status === "planned") yield* dispatch(summary);
				else if (p.summaryStale) yield* send({ type: "stageForgeOperation", kind: "update-summary" });
				else if (p.readiness.eligible && !p.unsupported.includes("markProposalReady")) {
					// Ready promotion (spec §9.3 R2-A008): reobserve the PR before admission and after dispatch; an unknown outcome
					// only reconciles, and only a complete observation still draft lets a fresh, re-checked stage follow.
					const ready = p.operations.findLast((o) => o.kind === "mark-ready" && o.canonical === p.canonical);
					const status = () => current()?.operations.find((o) => o.operation === ready!.operation);
					if (!ready || ready.status === "unapplied") yield* send({ type: "stageForgeOperation", kind: "mark-ready" });
					else if (ready.status === "planned" && ready.checked) {
						yield* dispatch(ready);
						yield* observe(ready.operation);
					} else if (ready.status === "planned" || ready.status === "unknown") {
						yield* observe(ready.operation);
						const after = status();
						if (after?.status === ready.status && !after.checked) return true;
					}
					// Only the human merges main; keep reading the associated PR until that merge is observed.
					else return true;
				}
				// Only the human merges main; keep reading the associated PR until that merge is observed.
				else return true;
			}
			return false;
		});
	}
	/** The workflow's current policy basis; Ledger verifies its exact retained bytes when a record names it. */
	#policyBasis(workflow: string): PolicyBasis {
		const frame = this.#frame()!;
		const basis = "policy" in frame ? policyBasis(frame.policy as PolicyState, workflow) : undefined;
		if (!basis) throw new Error("Current policy is unavailable.");
		return basis;
	}
	#preparationRecord(ref: string): Effect.Effect<PreparationRecord, unknown> {
		return Effect.gen({ self: this }, function* () {
			const read = yield* this.#ledger!.artifact(scheduling, { read: ref });
			if (!("content" in read)) throw new Error(`Restore exact preparation record ${ref}`);
			return JSON.parse(read.content.toString()) as PreparationRecord;
		});
	}
	#handoffSource(pass: ImplementationPass): Effect.Effect<SourceReceipt, unknown> {
		return Effect.gen({ self: this }, function* () {
			const read = yield* this.#ledger!.artifact(scheduling, { read: pass.handoff!.source });
			if (!("content" in read)) throw new Error(`Restore exact sealed handoff source ${pass.handoff!.source}`);
			return (JSON.parse(read.content.toString()) as { source: SourceReceipt }).source;
		});
	}
	/** One attempt against one observed target. Expected outcomes are records; only unrecordable failures throw. */
	#preparationAttempt(
		job: PreparationJob,
		attempt: number,
		observed: TargetObservation,
		basis: PolicyBasis,
	): Effect.Effect<PreparationRecord, unknown> {
		return Effect.gen({ self: this }, function* () {
			const { pass } = job;
			const record: PreparationRecord = {
				schema: 1,
				passRef: pass.ref,
				handoff: pass.handoff!.record,
				source: pass.handoff!.source,
				attempt,
				target: { proposal: observed.proposal, ref: observed.ref, commit: observed.target.commit },
				outcome: "operational",
				reason: null,
				preparation: null,
				checks: null,
				policy: basis,
			};
			const prepared = yield* Effect.exit(
				Effect.gen({ self: this }, function* () {
					const sealed = yield* this.#handoffSource(pass);
					const base = yield* this.#effects!.perform({
						type: "resolve",
						project: this.#project(job.owner.workflow),
						commit: preparationBase(pass),
					});
					return yield* this.#effects!.perform({ type: "prepare", base, source: sealed.source, target: observed.target });
				}),
			);
			if (Exit.isFailure(prepared)) {
				if (Cause.hasInterrupts(prepared.cause)) return yield* Effect.failCause(prepared.cause);
				const error = Cause.squash(prepared.cause);
				return {
					...record,
					reason: `preparation_operational_error: ${error instanceof Error ? error.message : error}`.slice(0, PREPARATION_REASON_BYTES),
				};
			}
			const receipt = prepared.value;
			record.preparation = {
				kind: receipt.kind,
				algorithm: receipt.algorithm,
				profile: receipt.profile,
				git: receipt.git,
				identity: receipt.identity,
				base: receipt.base.commit,
				source: receipt.source.commit,
				target: receipt.target.commit,
				result: receipt.result.commit,
				tree: receipt.result.tree,
				conflicts: receipt.conflicts,
				exitCode: receipt.exitCode,
				stdout: receipt.stdout,
				stderr: receipt.stderr,
			};
			if (receipt.kind === "conflict") return { ...record, outcome: "conflict" };
			const checked = yield* Effect.exit(this.#checkPrepared(job, attempt, receipt.result, record.policy.minimumEvidenceRank));
			if (Exit.isFailure(checked)) {
				if (Cause.hasInterrupts(checked.cause)) return yield* Effect.failCause(checked.cause);
				const error = Cause.squash(checked.cause);
				if (error instanceof VerifierDefect)
					return {
						...record,
						outcome: "verifier-defect",
						reason: `prepared_verifier_defect: ${error.message}`.slice(0, PREPARATION_REASON_BYTES),
					};
				return {
					...record,
					reason: `prepared_check_operational_error: ${error instanceof Error ? error.message : error}`.slice(0, PREPARATION_REASON_BYTES),
				};
			}
			record.checks = checked.value;
			const status = record.checks.verification.status;
			if (status === "passed") return { ...record, outcome: "checked" };
			if (status === "failed") return { ...record, outcome: "check-failure" };
			return { ...record, reason: `prepared_check_non_pass: ${status}` };
		});
	}
	/** The pass's frozen selection, read from X's own verifier bytes, run against X in a fresh Linux workspace. */
	#checkPrepared(
		{ owner, pass, check, save }: PreparationJob,
		attempt: number,
		x: Source,
		minimum: string | null,
	): Effect.Effect<PreparedChecks, unknown> {
		return Effect.gen({ self: this }, function* () {
			const selected = pass.configuration.verification;
			const entry = x.entries.find((e) => e.path === selected.path && e.mode !== "120000");
			if (!entry) throw new VerifierDefect(`Prepared source has no selected verifier ${selected.path}`);
			const digest = createHash("sha256").update(Buffer.from(entry.content, "base64")).digest("hex");
			// Everything here is read from X's own bytes before anything runs, so a refusal is a definition to repair, not an outage.
			let catalog: SelectedCatalog;
			try {
				catalog = selectCatalog(x, { ...selected, commit: x.commit, digest, receipts: [] });
			} catch (error) {
				throw new VerifierDefect(error instanceof Error ? error.message : String(error));
			}
			const required = requiredCatalogRows(catalog.selection);
			// X's behavioral evidence must reach the minimum rank of the policy this attempt records; Kernel accepts only the current one.
			for (const name of required) {
				const gap = rowDefinitionGap(
					catalog.rows.find((r) => r.name === name),
					catalog.ranks,
					catalog.selection.behavioralRows.includes(name) ? minimum : undefined,
				);
				if (gap) throw new VerifierDefect(`Required row ${name}: ${gap}`);
			}
			const scope: ExecutionScope = {
				assignment: owner.id,
				generation: owner.generation,
				// A refused record retains nothing and its attempt number runs again; each try gets its own fresh runtime.
				attempt: `${owner.attempt}:preparation:${attempt}:${this.#ledger!.status().sequence}`,
				executorEpoch: this.#ledger!.status().executorEpoch,
			};
			yield* fromPromise(() => save(scope));
			const key = JSON.stringify(scope);
			this.#preparing.add(key);
			return yield* Effect.gen({ self: this }, function* () {
				const handle = yield* this.#sandboxes!.prepare(scope, this.#profile(check, owner.workflow), x);
				return yield* Effect.gen({ self: this }, function* () {
					yield* faultBarrier("before-prepared-check", `prepared-check:${pass.ref}:${attempt}`);
					const run = (argv: string[]) =>
						this.#sandboxes!.execute(handle, { scope, argv, timeoutMs: check.timeoutMs, verifierRevision: digest });
					const { results, cleanup } = yield* this.#catalogResults(null, catalog, run);
					const capture = yield* this.#sandboxes!.seal(handle);
					const resultTree = treeOid(capture.entries, x.objectFormat);
					const rows = results.filter((r) => required.includes(r.name));
					const runs = (r: CatalogResult) => [...r.steps, ...(r.sanity ? [r.sanity] : [])];
					const failed = rows
						.filter((r) => r.status === "failed")
						.map((r) => ({ name: r.name, exitCode: runs(r).find((s) => s.exitCode !== 0)?.exitCode as number }));
					// A timeout, unrun row or incomplete cleanup is operational, never evidence that X needs repair.
					let status: PreparedChecks["verification"]["status"] = "passed";
					if (resultTree !== x.tree) status = "source_changed";
					else if (cleanup.status !== "complete" || rows.some((r) => r.status === "unrun" || runs(r).some((s) => s.timedOut)))
						status = "non-pass";
					else if (failed.length) status = "failed";
					else if (
						!catalog.rows
							.filter((row) => required.includes(row.name))
							.every((row) =>
								rowExecuted(
									row,
									results.find((r) => r.name === row.name),
									digest,
								),
							)
					)
						status = "non-pass";
					return {
						verifierRevision: digest,
						scope,
						catalog,
						results,
						cleanup,
						verification: { status, inputCommit: x.commit, inputTree: x.tree, resultTree },
						failed: status === "failed" ? failed : [],
					};
				}).pipe(
					Effect.catchCause((cause) => {
						if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
						const error = Cause.squash(cause);
						return Effect.gen({ self: this }, function* () {
							yield* this.#stopPreparationScope(scope);
							throw error;
						});
					}),
				);
			}).pipe(
				Effect.ensuring(
					Effect.sync(() => {
						this.#preparing.delete(key);
					}),
				),
			);
		});
	}
	#stopPreparationScope(scope: ExecutionScope): Effect.Effect<"absent" | "stopped", unknown> {
		return Effect.gen({ self: this }, function* () {
			return yield* Effect.gen({ self: this }, function* () {
				yield* this.#sandboxes!.stop({ scope });
				return "stopped" as const;
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.sync(() => {
						// No journal means create was never admitted for this scope; anything else is unconfirmed quiescence.
						if ((error as NodeJS.ErrnoException).code !== "ENOENT")
							throw new Error(`prepared_check_quiescence_unconfirmed: ${error instanceof Error ? error.message : error}`);
						return "absent" as const;
					});
				}),
			);
		});
	}
	/** Only a recorded validated conflict or real X check failure authorizes the return; Kernel applies cap and authority. */
	#returnToImplementation(
		owner: RoleAssignment,
		pass: ImplementationPass,
		record: PreparationRecord,
		block: (reason: string) => Effect.Effect<void, unknown>,
		review?: RoleAssignment,
		direction?: string,
	) {
		return Effect.gen({ self: this }, function* () {
			const sealed = yield* this.#handoffSource(pass);
			const prepared = record.preparation!;
			// The recorded base is the pass's target-lineage T0 that Kernel bound when it accepted this record.
			const lineage = {
				repository: sealed.source.repository,
				source: pass.handoff!.source,
				sourceCommit: sealed.source.commit,
				baseCommit: prepared.base,
				targetCommit: record.target.commit,
			};
			let observation: Record<string, unknown>;
			if (review)
				observation = {
					cause: direction ? "human-direction" : "watchdog-rework",
					...lineage,
					preparedCommit: prepared.result,
					review: review.id,
					report: review.report,
					...(direction ? { direction } : {}),
				};
			else if (record.outcome === "conflict")
				observation = {
					cause: "preparation-conflict",
					...lineage,
					algorithm: prepared.algorithm,
					resultTree: prepared.tree,
					conflicts: prepared.conflicts,
				};
			else if (record.outcome === "verifier-defect")
				observation = { cause: "prepared-verifier-defect", ...lineage, preparedCommit: prepared.result, defect: record.reason };
			else
				observation = {
					cause: "prepared-check-failure",
					...lineage,
					preparedCommit: prepared.result,
					verifierRevision: record.checks!.verifierRevision,
					failed: record.checks!.failed,
				};
			const text = JSON.stringify({ schema: 1, ...observation });
			const reply = yield* this.#ledger!.command(
				{
					version: 1,
					authorityEpoch: this.#ledger!.status().authorityEpoch,
					commandId: `preparation-return:${pass.ref}:${record.attempt}${review ? `:${review.id}` : ""}${direction ? ":directed" : ""}`,
					workflow: owner.workflow,
					command: { type: "openSuccessorPass", assignment: owner.id, generation: owner.generation, attempt: owner.attempt, text },
				},
				mintContext({ kind: "host", scope: "effects" }),
			);
			if (reply.status !== "accepted") {
				const current = this.#implementationPass(owner);
				// A later pass means this return already committed; anything else stays visible on this pass.
				if (!latestPass(this.#passes(), current)) return;
				yield* block(`preparation_return_refused: ${reply.code}: ${reply.reason}`);
			}
		});
	}
	#reportText(a: RoleAssignment): Effect.Effect<string, unknown> {
		return Effect.gen({ self: this }, function* () {
			const read = yield* this.#ledger!.artifact(scheduling, { read: a.report! });
			if (!("content" in read)) throw new Error(`Restore exact Watchdog report ${a.report}`);
			return read.content.toString();
		});
	}
	#reviewLimit(workflow: string): number {
		const frame = this.#frame()!;
		const policy = "policy" in frame ? (frame.policy as PolicyState) : initialPolicy();
		return policy.revisions[bindingFor(policy, workflow).policy]!.completedReviewLimit;
	}
	/**
	 * The Watchdog's own run of X's selected rows in a fresh Linux scratch copy of exact X (spec §6.2). Nothing it does
	 * reaches retained source; a changed tree is recorded as `source_changed`, never passing evidence.
	 */
	#reviewChecks(a: RoleAssignment): Effect.Effect<string | undefined, unknown> {
		return Effect.gen({ self: this }, function* () {
			const binding = a.watchdogReview!;
			const pass = this.#passes().find((p) => p.ref === binding.passRef);
			const owner = pass && this.#assignment(pass.assignment);
			const check = owner && this.#config.ownedChecks?.checks[owner.packet.profile];
			if (!pass || !check || !this.#effects || !this.#sandboxes)
				return "watchdog_check_capability_unavailable: owned Effects/Sandboxes are not configured";
			const scope = this.#scope(a);
			return yield* Effect.gen({ self: this }, function* () {
				const x = yield* this.#effects!.perform({ type: "read", project: this.#project(a.workflow), commit: binding.prepared });
				if (x.tree !== binding.tree) throw new Error("Prepared X differs from the reviewed tree");
				const catalog = selectCatalog(x, reviewSelection(pass, binding));
				const handle = yield* this.#sandboxes!.prepare(scope, this.#profile(check, a.workflow), x);
				const evidence = yield* Effect.gen({ self: this }, function* (): Effect.gen.Return<
					CatalogEvidence & { scope: ExecutionScope },
					unknown
				> {
					yield* faultBarrier("before-review-check", `review-check:${binding.passRef}`);
					const run = (argv: string[]) =>
						this.#sandboxes!.execute(handle, { scope, argv, timeoutMs: check.timeoutMs, verifierRevision: binding.verifier });
					const { results, cleanup } = yield* this.#catalogResults(a, catalog, run);
					const capture = yield* this.#sandboxes!.seal(handle);
					const resultTree = treeOid(capture.entries, x.objectFormat);
					const required = requiredCatalogRows(catalog.selection);
					const rows = results.filter((r) => required.includes(r.name));
					let status = "needs_assessment";
					if (resultTree !== x.tree) status = "source_changed";
					else if (cleanup.status !== "complete" || rows.some((r) => r.status === "unrun")) status = "non-pass";
					else if (rows.some((r) => r.status === "failed")) status = "failed";
					return {
						kind: "catalog-check",
						role: "watchdog",
						scope,
						catalog,
						results,
						verification: { status, inputCommit: x.commit, inputTree: x.tree, resultTree },
						cleanup,
					};
				}).pipe(
					Effect.catchCause((cause) => {
						if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
						const error = Cause.squash(cause);
						return Effect.gen({ self: this }, function* () {
							yield* this.#stopPreparationScope(scope);
							throw error;
						});
					}),
				);
				const reply = yield* this.#ledger!.command(
					{
						version: 1,
						authorityEpoch: this.#ledger!.status().authorityEpoch,
						commandId: `watchdog-checks:${a.id}:${a.attempt}:${a.executionOrdinal}`,
						workflow: a.workflow,
						command: {
							type: "recordReviewChecks",
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
							text: JSON.stringify({ schema: 1, source: x, evidence }),
						},
					},
					mintContext({ kind: "host", scope: "effects" }),
				);
				if (reply.status !== "accepted") throw new Error(`Review checks refused: ${reply.code}: ${reply.reason}`);
				return undefined;
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.sync(() => {
						return `watchdog_checks_unavailable: ${error instanceof Error ? error.message : error}`.slice(0, 1900);
					});
				}),
			);
		});
	}
	#passes(): ImplementationPass[] {
		const frame = this.#frame()!;
		return "implementationPasses" in frame ? (frame.implementationPasses as ImplementationPass[]) : [];
	}
	/** A return commits before its base is materialized; an unresolvable base blocks visibly before any writer turn. */
	#openingBlocker(a: RoleAssignment): Effect.Effect<string | undefined, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (!a.passRef || a.packet.role !== "implementer") return undefined;
			const pass = this.#implementationPass(a);
			if (!pass.opening || pass.workspace) return undefined;
			return yield* Effect.gen({ self: this }, function* () {
				const project = this.#project(a.workflow);
				yield* this.#effects!.perform({ type: "resolve", project, commit: pass.opening!.base });
				yield* this.#conflictOriginals(pass, project);
				return undefined;
			}).pipe(
				Effect.catchCause((cause) => {
					if (Cause.hasInterrupts(cause)) return Effect.failCause(cause);
					const error = Cause.squash(cause);
					return Effect.sync(() => {
						return `implementation_opening_source_unavailable: ${pass.opening!.base}: ${error}`.slice(0, 1900);
					});
				}),
			);
		});
	}
	/** A conflict pass's read-only original B, T0 and T1 (spec §9.4), mounted beside its writable T1 workspace. */
	#conflictOriginals(pass: ImplementationPass, project: ProjectFacts): Effect.Effect<Record<string, Source> | undefined, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (pass.cause !== "preparation-conflict" || !pass.opening) return undefined;
			const read = (ref: string) =>
				Effect.gen({ self: this }, function* () {
					const value = yield* this.#ledger!.artifact(scheduling, { read: ref });
					if (!("content" in value)) throw new Error(`Restore exact conflict input ${ref}`);
					return JSON.parse(value.content.toString());
				});
			const observation = (yield* read(pass.opening.observation)) as { source: string; baseCommit: string; targetCommit: string };
			const sealed = ((yield* read(observation.source)) as { source: SourceReceipt }).source;
			yield* this.#effects!.reconcile(sealed);
			const resolve = (commit: string) => this.#effects!.perform({ type: "resolve", project, commit });
			return {
				implementation: sealed.source,
				base: yield* resolve(observation.baseCommit),
				target: yield* resolve(observation.targetCommit),
			};
		});
	}
	#configurationBlocker(a: RoleAssignment): string | undefined {
		if (a.packet.experiment && !this.#experiments) return "experiment_capability_unavailable";
		if (a.passRef) {
			const check = this.#config.ownedChecks?.checks[a.packet.profile];
			if (!check || !this.#sandboxes || !this.#effects) return "implementation_source_or_verifier_capability_unavailable";
			const selected = this.#implementationPass(a).configuration.verification;
			if (this.#projectOf(a.workflow).id !== selected.repository || check.commit !== selected.commit)
				return "implementation_source_configuration_differs";
			// Until intended-output exclusions are explicit, capture every non-Git file. Caches may exceed bounds; never silently drop deliverables.
			if (JSON.stringify(check.profile.exclusions) !== '[".git"]') return "implementation_exclusion_profile_conflict";
		}
		if (a.packet.investigation && !this.#investigationEffects && !a.investigationSource)
			return "investigation_source_capability_unavailable";
		if (a.watchdogReview && !a.watchdogReview.checks && (!this.#sandboxes || !this.#effects))
			return "watchdog_check_capability_unavailable";
		if (a.packet.execution === "linux-writer" && !a.passRef && !a.packet.experiment && this.#config.ownedChecks)
			return Object.hasOwn(this.#config.ownedChecks.checks, a.packet.profile) ? undefined : "owned_check_profile_unavailable";
		if (!this.#config.apiKey) return "native_provider_configuration_missing";
		if (a.packet.execution !== "read-only" && !a.passRef && !a.packet.experiment) return "sandbox_capability_unavailable";
		if (this.#config.provider && this.#config.provider.id !== "anthropic") return "native_provider_required";
		const packets = [
			a.packet,
			...(a.passRef
				? [
						...Object.values(this.#implementationPass(a).configuration.reviewers),
						...(this.#implementationPass(a).configuration.watchdog ? [this.#implementationPass(a).configuration.watchdog!] : []),
					].map(auditReviewerPacket)
				: []),
		];
		for (const packet of packets) {
			if (this.#config.families?.[packet.model] !== packet.family || packet.requiredFamily !== packet.family)
				return "required_model_family_unavailable";
			if (!this.#models.getModel(packet.provider, packet.model)) return "required_model_unavailable";
		}
		return undefined;
	}
	/** `occurrence` distinguishes a command that may legitimately repeat with identical text in a later settlement. */
	#command(a: RoleAssignment, command: Record<string, unknown>, occurrence?: string) {
		return Effect.gen({ self: this }, function* () {
			const reply = yield* this.#ledger!.command(
				{
					version: 1,
					authorityEpoch: this.#ledger!.status().authorityEpoch,
					commandId: `engine:${a.id}:${a.generation}:${a.executionOrdinal}:${a.status}:${command.type}:${createHash("sha256").update(JSON.stringify(command)).digest("hex").slice(0, 24)}${occurrence ? `:${occurrence}` : ""}`,
					workflow: a.workflow,
					command: { assignment: a.id, generation: a.generation, attempt: a.attempt, ...command },
				},
				scheduling,
			);
			return reply;
		});
	}
	#identity(api: ToolExecutionApi, toolName: string) {
		return Effect.gen({ self: this }, function* () {
			const binding = yield* fromPromise(() => api.snapshot(RoleBinding, api.conversationId, ctx));
			const a = binding ? this.#assignment(binding.assignment) : undefined;
			const task = yield* fromPromise(() => api.getTask(api.taskId, ctx));
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
			const entry = yield* fromPromise(() => api.commit((tx) => tx.entry(invocation.assistant), ctx));
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
		});
	}
	#toolCommand(
		api: ToolExecutionApi,
		toolName: string,
		command: JsonObject,
	): Effect.Effect<CommandReply | { status: "refused"; code: string }, unknown> {
		return Effect.gen({ self: this }, function* () {
			const identity = yield* this.#identity(api, toolName);
			if (identity.status === "refused") {
				if (identity.code === "stale_assignment" && command.type === "submitRoleResult") yield* this.#quarantine(api, command);
				return identity;
			}
			const a = identity.a;
			if (command.type === "submitRoleResult" && a.packet.experiment) {
				const sealed = yield* Effect.exit(this.#experiments!.seal(a));
				if (Exit.isFailure(sealed)) {
					const error = Cause.squash(sealed.cause);
					yield* this.#command(a, { type: "recordBlocker", reason: `experiment_seal_blocked: ${error}`.slice(0, 1900) });
					return { status: "refused", code: "experiment_seal_blocked" };
				}
			}
			const commandId = `role:${createHash("sha256")
				.update(JSON.stringify([a.workflow, api.conversationId, a.id, a.generation, a.attempt, api.taskId, api.callId]))
				.digest("hex")}`;
			const envelope = yield* fromPromise(() =>
				api.memo(
					"render.envelope",
					{ version: 1, authorityEpoch: this.#ledger!.status().authorityEpoch, commandId, workflow: a.workflow, command },
					ctx,
				),
			);
			const reply = yield* this.#ledger!.command(envelope, identity.context);
			if (
				reply.status === "refused" &&
				(reply.code === "unauthorized" || reply.code === "stale_assignment") &&
				command.type === "submitRoleResult"
			)
				yield* this.#quarantine(api, command);
			return reply;
		});
	}
	#quarantine(api: ToolExecutionApi, command: JsonObject): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			const binding = yield* fromPromise(() => api.snapshot(RoleBinding, api.conversationId, ctx));
			const a = binding ? this.#assignment(binding.assignment) : undefined;
			if (!a || !binding || typeof command.text !== "string") return;
			yield* this.#ledger!.command(
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
		});
	}
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}

export function runtimeOptions(onReport: (error: unknown, info: ReportInfo) => void): RenderRuntimeOptions {
	return new Engine().options(onReport);
}
