// Sandboxes is the only coding-tool executor. Docker is mandatory; no host-shell fallback.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, chown, lstat, mkdir, open, readdir, readFile, readlink, rename, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { fromPromise, runPromise } from "../effect.ts";
import { blobOid, type LiteralEntry, type Source, treeOid, validateEntries } from "../effects/source.ts";
import type { ExecutionResult } from "../kernel/evidence-schema.ts";
import { validatePath } from "../kernel/source-path.ts";
import { faultBarrier } from "../ledger/barrier.ts";

export type ExecutionScope = { assignment: string; generation: number; attempt: string; executorEpoch: string };
export type LinuxProfile = { image: string; exclusions: string[]; maxBytes: number; maxEntries: number; maxCommands?: number };
type Inputs = Source & { readOnly?: Record<string, Source> };
export type SandboxHandle = { id: string; runtime: string; scope: ExecutionScope };
export type PreparationInputs = Inputs | { source: Source; after: SandboxHandle };
export type { ExecutionResult } from "../kernel/evidence-schema.ts";
export type ExecutionDiagnostic = {
	id: string;
	scope: ExecutionScope;
	argv: string[];
	timeoutMs: number;
	result?: ExecutionResult;
	/** Resolved from the owning workspace journal on recovery, not inferred from the latest handle. */
	source?: Source;
};
export type Capture = { entries: LiteralEntry[]; exclusions: string[]; freeze: { scope: ExecutionScope; runtime: string; running: false } };
type StopResult = {
	running: false;
	runtime: string;
	handle: SandboxHandle;
	source: Source;
	executions: ExecutionDiagnostic[];
	quarantine?: string;
};
type State = {
	// A continuation gets a new workspace identity, never a new authority scope.
	predecessor?: string;
	scopeStopped?: boolean;
	handle: SandboxHandle;
	phase: "preparing" | "running" | "sealing" | "stopped" | "sealed" | "quarantined";
	profile: LinuxProfile;
	source: Source;
	cpu: string;
	// Only an explicit durable false proves create was never admitted; older journals remain uncertain.
	createIssued?: boolean;
	capture?: Capture;
	reason?: string;
};

// This prepare invocation refused its inputs before attempting allocation. This is not
// evidence about an earlier invocation or a recovered scope with an uncertain journal.
export class SandboxInputRefusal extends Error {}

export class Sandboxes {
	readonly #root: string;
	readonly #authorize: (scope: ExecutionScope) => boolean;
	readonly #fenced = new Set<string>();
	readonly #stoppedScopes = new Set<string>();
	readonly #seals = new Map<string, Promise<Capture>>();
	readonly #preparations = new Map<string, Promise<SandboxHandle>>();
	readonly #allocated = new Set<string>();
	constructor(options: { root: string; authorize: (scope: ExecutionScope) => boolean }) {
		this.#root = options.root;
		this.#authorize = options.authorize;
	}
	/** Admits and caches preparation immediately. The Effect observes that same preparation, rather than allocating again. */
	prepareEffect(scope: ExecutionScope, profile: LinuxProfile, inputs: PreparationInputs): Effect.Effect<SandboxHandle, unknown> {
		const pending = this.prepare(scope, profile, inputs);
		return fromPromise(() => pending).pipe(Effect.uninterruptible);
	}
	prepare(scope: ExecutionScope, profile: LinuxProfile, inputs: PreparationInputs): Promise<SandboxHandle> {
		const source = "source" in inputs ? inputs.source : inputs;
		const after = "after" in inputs ? inputs.after : undefined;
		const id = identity(scope, after?.id);
		if (this.#stoppedScopes.has(identity(scope)))
			return Promise.reject(new Error("Sandbox scope is stopped/fenced; workspace reuse is forbidden."));
		if (this.#preparations.has(id) || this.#fenced.has(id)) return Promise.reject(new Error("Sandbox workspace reuse is forbidden."));
		const pending = runPromise(
			this.#prepare(structuredClone(scope), structuredClone(profile), structuredClone(source), structuredClone(after)),
		);
		this.#preparations.set(id, pending);
		// Invalid profile/input creates no workspace and can be corrected before any environment is admitted.
		void pending.catch(() => {
			if (!this.#allocated.has(id)) this.#preparations.delete(id);
		});
		return pending;
	}
	#prepare(scope: ExecutionScope, profile: LinuxProfile, source: Inputs, after?: SandboxHandle): Effect.Effect<SandboxHandle, unknown> {
		return Effect.gen({ self: this }, function* () {
			yield* Effect.gen({ self: this }, function* () {
				if (!this.#authorize(scope) || this.#stoppedScopes.has(identity(scope))) throw new Error("Sandbox scope is fenced/unauthorized.");
				if (after) {
					if (JSON.stringify(scope) !== JSON.stringify(after.scope)) throw new Error("Predecessor authority scope differs.");
					const previous = yield* this.#load(after);
					const initial = yield* this.#load({ id: identity(scope), scope });
					if (initial.scopeStopped) throw new Error("Sandbox scope is stopped/fenced.");
					if (previous.phase !== "sealed" || !previous.capture) throw new Error("Fresh preparation requires a sealed predecessor.");
					if (JSON.stringify(profile) !== JSON.stringify(previous.profile))
						throw new Error("Continuation must retain its collection profile.");
					if (
						source.repository !== previous.source.repository ||
						source.objectFormat !== previous.source.objectFormat ||
						source.tree !== treeOid(previous.capture.entries, previous.source.objectFormat)
					)
						throw new Error("Continuation requires the exact captured source, not older or replacement bytes.");
				}
				if (
					Object.keys(profile).some((key) => !["image", "exclusions", "maxBytes", "maxEntries", "maxCommands"].includes(key)) ||
					(profile.maxCommands !== undefined &&
						(!Number.isSafeInteger(profile.maxCommands) || profile.maxCommands < 1 || profile.maxCommands > 32)) ||
					!/^sha256:[0-9a-f]{64}$/.test(profile.image) ||
					!Number.isSafeInteger(profile.maxBytes) ||
					profile.maxBytes < 1 ||
					profile.maxBytes > 64 * 1024 * 1024 ||
					!Number.isSafeInteger(profile.maxEntries) ||
					profile.maxEntries < 1 ||
					profile.maxEntries > 10000
				)
					throw new Error("Forbidden/unsupported Linux profile; require immutable local image and bounded limits.");
				if (
					!Array.isArray(profile.exclusions) ||
					profile.exclusions[0] !== ".git" ||
					new Set(profile.exclusions).size !== profile.exclusions.length
				)
					throw new Error("Collection profile must explicitly exclude .git exactly once.");
				for (const path of profile.exclusions.slice(1)) validatePath(path);
				if (Object.keys(source.readOnly ?? {}).length > 4) throw new Error("Too many read-only candidates.");
				for (const [name, input] of Object.entries(source.readOnly ?? {})) {
					if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) throw new Error("Invalid candidate mount name.");
					validateEntries(input.entries, input.objectFormat, profile.maxBytes, profile.maxEntries);
					if (treeOid(input.entries, input.objectFormat) !== input.tree)
						throw new Error("Read-only candidate source differs from retained tree.");
				}
				validateEntries(source.entries, source.objectFormat, profile.maxBytes, profile.maxEntries);
				if (treeOid(source.entries, source.objectFormat) !== source.tree)
					throw new Error("Ingress source manifest differs from resolved tree.");
				for (const entry of source.entries)
					if (profile.exclusions.some((p) => entry.path === p || entry.path.startsWith(`${p}/`)))
						throw new Error(`Exclusion profile conflicts with accepted base: ${entry.path}`);
			}).pipe(
				Effect.catchCause((cause) => {
					const error = Cause.squash(cause);
					return Effect.fail(new SandboxInputRefusal(error instanceof Error ? error.message : String(error), { cause: error }));
				}),
			);
			const id = identity(scope, after?.id);
			yield* fromPromise(() => mkdir(this.#root, { recursive: true, mode: 0o700 }));
			const dir = join(this.#root, id);
			yield* fromPromise(() => mkdir(dir, { mode: 0o700 })).pipe(
				Effect.mapError(() => new Error("Sandbox already exists; workspace reuse is forbidden, reconcile original runtime/quarantine.")),
			);
			this.#allocated.add(id);
			const handle = {
				id,
				scope: structuredClone(scope),
				runtime: `render-owned-${createHash("sha256").update(this.#root).digest("hex").slice(0, 16)}-${id.slice(0, 32)}`,
			};
			const state: State = {
				...(after ? { predecessor: after.id } : {}),
				handle,
				phase: "preparing",
				profile: structuredClone(profile),
				source,
				cpu: "unknown",
				createIssued: false,
			};
			yield* this.#save(state);
			return yield* Effect.gen({ self: this }, function* () {
				const image = JSON.parse(yield* fromPromise(() => docker(["image", "inspect", profile.image])))[0];
				if (image.Os !== "linux") throw new Error("Unsupported platform; macOS checks remain unrun.");
				state.cpu = image.Architecture;
				const uid = process.getuid?.() || 1000;
				const gid = process.getgid?.() || 1000;
				const workspace = join(dir, "workspace");
				yield* fromPromise(() => mkdir(workspace, { mode: 0o755 }));
				yield* materialize(workspace, source);
				const mounts: string[] = [];
				for (const [name, input] of Object.entries(source.readOnly ?? {})) {
					const path = join(dir, "candidates", name);
					yield* fromPromise(() => mkdir(path, { recursive: true, mode: 0o755 }));
					yield* materialize(path, input);
					const verified = yield* collect(path, input.objectFormat, profile, false);
					if (treeOid(verified.entries, input.objectFormat) !== input.tree)
						throw new Error("Read-only candidate materialization mismatch.");
					mounts.push("--mount", `type=bind,src=${path},dst=/candidates/${name},readonly`);
				}
				// Match the trusted host uid, not root. Root-host installations explicitly transfer the private workspace.
				if (process.getuid?.() === 0) yield* ownTree(workspace, uid, gid);
				const verify = yield* collect(workspace, source.objectFormat, profile, false);
				if (treeOid(verify.entries, source.objectFormat) !== source.tree) throw new Error("Materialized literal manifest mismatch.");
				if (this.#fenced.has(id) || this.#stoppedScopes.has(identity(scope)) || !this.#authorize(scope))
					throw new Error("Sandbox scope fenced before create.");
				const env: string[] = [];
				for (const item of image.Config?.Env ?? []) {
					const key = String(item).split("=")[0]!;
					if (!["PATH", "HOME", "LANG"].includes(key)) env.push("--env", `${key}=`);
				}
				// Persist possible creation before dispatch, so a lost response can never be mistaken for absence.
				state.createIssued = true;
				yield* this.#save(state);
				const runtime = (yield* fromPromise(() =>
					docker([
						"create",
						"--pull=never",
						"--name",
						handle.runtime,
						"--label",
						`render.owned=${id}`,
						"--restart=no",
						"--read-only",
						"--user",
						`${uid}:${gid}`,
						"--cap-drop=ALL",
						"--security-opt",
						"no-new-privileges",
						"--pids-limit",
						"128",
						"--memory",
						"256m",
						"--cpus",
						"1",
						"--network",
						"bridge",
						"--tmpfs",
						"/tmp:rw,noexec,nosuid,size=67108864",
						"--mount",
						`type=bind,src=${workspace},dst=/workspace`,
						...mounts,
						"--workdir",
						"/workspace",
						...env,
						"--env",
						"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
						"--env",
						"HOME=/tmp",
						"--env",
						"LANG=C.UTF-8",
						"--entrypoint",
						"/usr/bin/env",
						profile.image,
						"-i",
						"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
						"HOME=/tmp",
						"LANG=C.UTF-8",
						"node",
						"-e",
						// PID 1 must handle TERM; otherwise every clean capture waits for Docker's forced-kill timeout.
						"process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{}, 1000)",
					]),
				)).trim();
				handle.runtime = runtime;
				yield* this.#save(state); // durable runtime identity before start
				if (this.#fenced.has(id) || this.#stoppedScopes.has(identity(scope)) || !this.#authorize(scope))
					throw new Error("Sandbox scope fenced before start.");
				yield* fromPromise(() => docker(["start", runtime]));
				state.phase = "running";
				yield* this.#save(state);
				return structuredClone(handle);
			}).pipe(
				Effect.catchCause((cause) =>
					Effect.gen({ self: this }, function* () {
						state.phase = "quarantined";
						state.reason = String(Cause.squash(cause));
						yield* this.#save(state);
						return yield* Effect.failCause(cause);
					}),
				),
			);
		});
	}
	execute(
		handle: SandboxHandle,
		call: { scope: ExecutionScope; argv: string[]; timeoutMs: number; verifierRevision?: string },
	): Promise<ExecutionResult> {
		return runPromise(this.executeEffect(handle, call));
	}
	executeEffect(
		handle: SandboxHandle,
		call: { scope: ExecutionScope; argv: string[]; timeoutMs: number; verifierRevision?: string },
	): Effect.Effect<ExecutionResult, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (this.#fenced.has(handle.id) || this.#stoppedScopes.has(identity(handle.scope)))
				throw new Error("Sandbox sealed/closed to execute.");
			const state = yield* this.#load(handle);
			const root = identity(handle.scope);
			const initial = handle.id === root ? state : yield* this.#load({ id: root, scope: handle.scope });
			if (initial.scopeStopped) throw new Error("Sandbox scope is stopped/fenced.");
			if (this.#fenced.has(handle.id) || this.#stoppedScopes.has(root) || state.phase !== "running")
				throw new Error("Sandbox sealed/closed to execute.");
			if (JSON.stringify(handle.scope) !== JSON.stringify(call.scope) || !this.#authorize(call.scope))
				throw new Error("Sandbox scope fenced/unauthorized.");
			if (
				!Array.isArray(call.argv) ||
				!call.argv.length ||
				call.argv.some((x) => typeof x !== "string" || x.includes("\0")) ||
				!Number.isSafeInteger(call.timeoutMs) ||
				call.timeoutMs < 1 ||
				call.timeoutMs > 300000
			)
				throw new Error("Invalid bounded sandbox command.");
			if (
				state.profile.maxCommands !== undefined &&
				(yield* fromPromise(() => readdir(join(this.#root, handle.id)))).filter((name) => /^execution-[0-9a-f-]+\.json$/.test(name))
					.length >= state.profile.maxCommands
			)
				throw new Error("Preregistered experiment command budget exhausted; new round required.");
			const observed = yield* this.#inspect(state);
			if (!observed.State.Running) throw new Error("Sandbox is not running.");
			if (this.#fenced.has(handle.id) || this.#stoppedScopes.has(identity(handle.scope)) || !this.#authorize(call.scope))
				throw new Error("Sandbox sealed/fenced before admission.");
			const diagnostic: ExecutionDiagnostic = { id: randomUUID(), scope: handle.scope, argv: [...call.argv], timeoutMs: call.timeoutMs };
			yield* this.#saveJson(handle.id, `execution-${diagnostic.id}.json`, diagnostic);
			if (this.#fenced.has(handle.id) || this.#stoppedScopes.has(identity(handle.scope)) || !this.#authorize(call.scope))
				throw new Error("Sandbox fenced before execution admission.");
			const result = yield* fromPromise(
				() =>
					new Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
						execFile(
							"docker",
							[
								"exec",
								handle.runtime,
								"/usr/bin/env",
								"-i",
								"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
								"HOME=/tmp",
								"LANG=C.UTF-8",
								...call.argv,
							],
							{ encoding: "utf8", maxBuffer: 1024 * 1024, timeout: call.timeoutMs },
							(error, stdout, stderr) => {
								resolve({
									exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
									stdout,
									stderr,
									timedOut: !!error?.killed,
								});
							},
						);
					}),
			);
			const execution: ExecutionResult = {
				...result,
				verifierRevision: call.verifierRevision,
				argv: [...call.argv],
				platform: { os: "linux", cpu: state.cpu },
				image: state.profile.image,
			};
			yield* this.#saveJson(handle.id, `execution-${diagnostic.id}.json`, { ...diagnostic, result: execution });
			if (result.timedOut || result.exitCode === null) {
				// Killing docker exec's client is not proof that its process died. Stop the whole environment.
				yield* this.stopEffect(handle);
				throw new Error("Sandbox command timed out/output bound failed; whole environment stopped, no pass claimed.");
			}
			return execution;
		}).pipe(Effect.uninterruptible);
	}
	/** Fences immediately and observes the cached seal, including when the Effect is evaluated more than once. */
	sealEffect(handle: SandboxHandle): Effect.Effect<Capture, unknown> {
		const pending = this.seal(handle);
		return fromPromise(() => pending).pipe(Effect.uninterruptible);
	}
	seal(handle: SandboxHandle): Promise<Capture> {
		this.#fenced.add(handle.id); // synchronous fence, before any await
		const current = this.#seals.get(handle.id);
		if (current) return current;
		const pending = runPromise(this.#seal(handle));
		this.#seals.set(handle.id, pending);
		void pending.catch(() => this.#seals.delete(handle.id));
		return pending;
	}
	#seal(handle: SandboxHandle): Effect.Effect<Capture, unknown> {
		return Effect.gen({ self: this }, function* () {
			let state = yield* this.#load(handle);
			if (state.phase === "quarantined") throw new Error(`Sandbox quarantined: ${state.reason}`);
			if (state.phase === "sealed" && state.capture) return state.capture;
			return yield* Effect.gen({ self: this }, function* () {
				state.phase = "sealing";
				yield* this.#save(state);
				yield* this.stopEffect(handle);
				state = yield* this.#load(handle);
				yield* fromPromise(() => faultBarrier("after-sandbox-stop", "owned-source"));
				const before = yield* this.#inspect(state);
				if (before.State.Running) throw new Error("Whole-container quiescence unconfirmed.");
				const collected = yield* collect(join(this.#root, handle.id, "workspace"), state.source.objectFormat, state.profile, true);
				const after = yield* this.#inspect(state);
				if (after.State.Running || before.State.StartedAt !== after.State.StartedAt) throw new Error("Runtime restarted during capture.");
				const capture: Capture = { ...collected, freeze: { scope: handle.scope, runtime: handle.runtime, running: false } };
				state.phase = "sealed";
				state.capture = capture;
				yield* this.#save(state);
				return capture;
			}).pipe(
				Effect.catchCause((cause) =>
					Effect.gen({ self: this }, function* () {
						state.phase = "quarantined";
						state.reason = String(Cause.squash(cause));
						yield* this.#save(state);
						return yield* Effect.failCause(cause);
					}),
				),
			);
		});
	}
	async stop(handle: SandboxHandle | { scope: ExecutionScope }): Promise<StopResult> {
		return runPromise(this.stopEffect(handle));
	}
	/** Fences admission immediately. Evaluate the Effect to stop and confirm the journaled runtimes. */
	stopEffect(handle: SandboxHandle | { scope: ExecutionScope }): Effect.Effect<StopResult, unknown> {
		if (!("id" in handle)) {
			this.#stoppedScopes.add(identity(handle.scope));
			return this.#stopScope(handle.scope).pipe(Effect.uninterruptible);
		}
		this.#fenced.add(handle.id);
		return this.#stop(handle).pipe(Effect.uninterruptible);
	}
	#stop(handle: SandboxHandle): Effect.Effect<StopResult, unknown> {
		return Effect.gen({ self: this }, function* () {
			const id = handle.id;
			yield* fromPromise(() => this.#preparations.get(id)?.catch(() => {}) ?? Promise.resolve());
			const state = yield* this.#load(handle);
			// Retry only containment of the exact journaled runtime. A quarantine is never permission to restart it.
			return yield* Effect.gen({ self: this }, function* () {
				// Preparation has settled under the synchronous fence. A never-issued create needs no runtime inspection.
				if (state.createIssued !== false) {
					yield* this.#inspect(state);
					yield* fromPromise(() => docker(["stop", "--time", "1", state.handle.runtime], 10000)).pipe(
						Effect.catch(() => fromPromise(() => docker(["kill", state.handle.runtime], 10000))),
					);
					const observed = yield* this.#inspect(state);
					if (observed.State.Running || observed.State.Restarting || observed.State.Paused)
						throw new Error("Whole-container not-running confirmation failed.");
				}
				if (state.phase !== "sealed") {
					state.phase = "stopped";
					yield* this.#save(state);
				}
				const executions: ExecutionDiagnostic[] = [];
				for (const name of (yield* fromPromise(() => readdir(join(this.#root, id))))
					.filter((name) => /^execution-[0-9a-f-]+\.json$/.test(name))
					.sort())
					executions.push({
						...JSON.parse(yield* fromPromise(() => readFile(join(this.#root, id, name), "utf8"))),
						source: state.source,
					} as ExecutionDiagnostic);
				return {
					running: false as const,
					runtime: state.handle.runtime,
					handle: structuredClone(state.handle),
					source: state.source,
					executions,
					quarantine: state.reason,
				};
			}).pipe(
				Effect.catchCause((cause) =>
					Effect.gen({ self: this }, function* () {
						const error = Cause.squash(cause);
						state.phase = "quarantined";
						state.reason = String(error);
						yield* this.#save(state);
						return yield* Effect.fail(new Error(`Sandbox quarantine: ${String(error)}`));
					}),
				),
			);
		});
	}
	#stopScope(scope: ExecutionScope): Effect.Effect<StopResult, unknown> {
		return Effect.gen({ self: this }, function* () {
			const root = identity(scope);
			yield* fromPromise(() => this.#preparations.get(root)?.catch(() => {}) ?? Promise.resolve());
			const initial = yield* this.#load({ id: root, scope });
			initial.scopeStopped = true;
			yield* this.#save(initial);
			let id = root;
			const executions: ExecutionDiagnostic[] = [];
			const failures: unknown[] = [];
			let last: StopResult | undefined;
			for (;;) {
				yield* fromPromise(() => this.#preparations.get(id)?.catch(() => {}) ?? Promise.resolve());
				const workspace = yield* Effect.exit(
					Effect.gen({ self: this }, function* () {
						const state = yield* this.#load({ id, scope });
						return yield* this.stopEffect(state.handle);
					}),
				);
				if (Exit.isFailure(workspace)) failures.push(Cause.squash(workspace.cause));
				else {
					last = workspace.value;
					executions.push(...last.executions);
				}
				// The next workspace name is deterministic; no separately committed index can lose it.
				const next = identity(scope, id);
				yield* fromPromise(() => this.#preparations.get(next)?.catch(() => {}) ?? Promise.resolve());
				const found = yield* Effect.exit(fromPromise(() => lstat(join(this.#root, next))));
				if (Exit.isFailure(found)) {
					const error = Cause.squash(found.cause);
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") failures.push(error);
					if (failures.length) throw new AggregateError(failures, `Sandbox scope stop incomplete: ${failures.map(String).join("; ")}`);
					if (!last) throw new Error("Sandbox scope stop found no runtime journal.");
					return { ...last, executions };
				}
				id = next;
			}
		});
	}
	#inspect(state: State) {
		return Effect.gen({ self: this }, function* () {
			const observed = JSON.parse(yield* fromPromise(() => docker(["inspect", state.handle.runtime])))[0];
			if (observed.Id !== state.handle.runtime || observed.Config.Labels["render.owned"] !== state.handle.id)
				throw new Error("Runtime identity inspection mismatch.");
			return observed;
		});
	}
	#load(handle: { id: string; scope: ExecutionScope; runtime?: string }): Effect.Effect<State, unknown> {
		return Effect.gen({ self: this }, function* () {
			if (!/^[0-9a-f]{64}$/.test(handle.id)) throw new Error("Sandbox handle identity mismatch.");
			const state = JSON.parse(yield* fromPromise(() => readFile(join(this.#root, handle.id, "state.json"), "utf8"))) as State;
			if (
				identity(handle.scope, state.predecessor) !== handle.id ||
				state.handle.id !== handle.id ||
				JSON.stringify(state.handle.scope) !== JSON.stringify(handle.scope) ||
				(handle.runtime && state.handle.runtime !== handle.runtime)
			)
				throw new Error("Sandbox runtime identity mismatch.");
			return state;
		});
	}
	#save(state: State): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			yield* this.#saveJson(state.handle.id, "state.json", state);
		});
	}
	#saveJson(id: string, name: string, value: unknown): Effect.Effect<void, unknown> {
		return Effect.gen({ self: this }, function* () {
			const dir = join(this.#root, id);
			const path = join(dir, `write-${randomUUID()}.tmp`);
			const file = yield* fromPromise(() => open(path, "wx", 0o600));
			const written = yield* Effect.exit(
				Effect.gen(function* () {
					yield* fromPromise(() => file.writeFile(JSON.stringify(value)));
					yield* fromPromise(() => file.sync());
				}),
			);
			yield* fromPromise(() => file.close());
			yield* written;
			yield* fromPromise(() => rename(path, join(dir, name)));
			for (const path of [dir, this.#root]) {
				const directory = yield* fromPromise(() => open(path, "r"));
				const synced = yield* Effect.exit(fromPromise(() => directory.sync()));
				yield* fromPromise(() => directory.close());
				yield* synced;
			}
		});
	}
}
function identity(scope: ExecutionScope, predecessor?: string): string {
	return createHash("sha256")
		.update(predecessor ? JSON.stringify([scope, predecessor]) : JSON.stringify(scope))
		.digest("hex");
}
function docker(args: string[], timeout = 30000): Promise<string> {
	return new Promise((resolve, reject) =>
		execFile("docker", args, { timeout, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) =>
			error ? reject(new Error(`Docker ${args[0]} failed: ${stderr}`)) : resolve(stdout),
		),
	);
}
function materialize(root: string, source: Source): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		for (const entry of source.entries) {
			const path = join(root, entry.path);
			yield* fromPromise(() => mkdir(dirname(path), { recursive: true, mode: 0o755 }));
			const content = Buffer.from(entry.content, "base64");
			if (entry.mode === "120000") yield* fromPromise(() => symlink(content.toString("utf8"), path));
			else {
				yield* fromPromise(() => writeFile(path, content, { flag: "wx", mode: entry.mode === "100755" ? 0o755 : 0o644 }));
				yield* fromPromise(() => chmod(path, entry.mode === "100755" ? 0o755 : 0o644));
			}
		}
	});
}
function ownTree(path: string, uid: number, gid: number): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		const info = yield* fromPromise(() => lstat(path));
		if (info.isSymbolicLink()) return;
		yield* fromPromise(() => chown(path, uid, gid));
		if (info.isDirectory()) for (const entry of yield* fromPromise(() => readdir(path))) yield* ownTree(join(path, entry), uid, gid);
	});
}
function collect(
	root: string,
	format: Source["objectFormat"],
	profile: LinuxProfile,
	egress: boolean,
): Effect.Effect<{ entries: LiteralEntry[]; exclusions: string[] }, unknown> {
	return Effect.gen(function* () {
		const entries: LiteralEntry[] = [];
		const exclusions: string[] = [];
		let count = 0;
		let bytes = 0;
		function walk(dir: string, prefix: string): Effect.Effect<void, unknown> {
			return Effect.gen(function* () {
				const names = yield* fromPromise(() => readdir(dir, { encoding: "buffer" }));
				for (const raw of names) {
					const name = raw.toString("utf8");
					if (!Buffer.from(name).equals(raw)) throw new Error("Unsupported source filename representation.");
					const relative = `${prefix}${name}`;
					if (egress && profile.exclusions.includes(relative)) {
						exclusions.push(relative);
						continue;
					}
					validatePath(relative);
					if (++count > profile.maxEntries) throw new Error("Collection entries bound exceeded.");
					const path = join(dir, name);
					const before = yield* fromPromise(() => lstat(path));
					if (before.isDirectory()) {
						yield* walk(path, `${relative}/`);
						continue;
					}
					let content: Buffer;
					let mode: LiteralEntry["mode"];
					if (before.isSymbolicLink()) {
						content = yield* fromPromise(() => readlink(path, { encoding: "buffer" }));
						mode = "120000";
					} else if (before.isFile()) {
						if (before.mode & 0o7000 || ((before.mode & 0o111) !== 0 && (before.mode & 0o111) !== 0o111))
							throw new Error(`Unsupported file mode: ${relative}`);
						if (bytes + before.size > profile.maxBytes) throw new Error("Collection bytes bound exceeded.");
						const file = yield* fromPromise(() => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK));
						const read = yield* Effect.exit(
							Effect.gen(function* () {
								const checked = yield* fromPromise(() => file.stat());
								if (!checked.isFile() || checked.ino !== before.ino || checked.dev !== before.dev || checked.size !== before.size)
									throw new Error("Collection regular file changed.");
								const content = yield* fromPromise(() => file.readFile());
								const after = yield* fromPromise(() => file.stat());
								if (
									after.size !== checked.size ||
									after.mtimeMs !== checked.mtimeMs ||
									after.ctimeMs !== checked.ctimeMs ||
									content.length !== checked.size
								)
									throw new Error("Collection file changed during read.");
								return content;
							}),
						);
						yield* fromPromise(() => file.close());
						content = yield* read;
						mode = before.mode & 0o111 ? "100755" : "100644";
					} else throw new Error(`Unsupported special file; require regular file or symlink: ${relative}`);
					bytes += content.length;
					if (bytes > profile.maxBytes) throw new Error("Collection bytes bound exceeded.");
					entries.push({ path: relative, mode, oid: blobOid(format, content), content: content.toString("base64") });
				}
			});
		}
		yield* walk(root, "");
		entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
		validateEntries(entries, format, profile.maxBytes, profile.maxEntries);
		return { entries, exclusions };
	});
}
