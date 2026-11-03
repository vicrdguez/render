// Sandboxes is the only coding-tool executor. Docker is mandatory; no host-shell fallback.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, chown, lstat, mkdir, open, readdir, readFile, readlink, rename, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { blobOid, type LiteralEntry, type Source, treeOid, validateEntries, validatePath } from "../effects/source.ts";
import { faultBarrier } from "../ledger/barrier.ts";

export type ExecutionScope = { assignment: string; generation: number; attempt: string; executorEpoch: string };
export type LinuxProfile = { image: string; exclusions: string[]; maxBytes: number; maxEntries: number; maxCommands?: number };
type Inputs = Source & { readOnly?: Record<string, Source> };
export type SandboxHandle = { id: string; runtime: string; scope: ExecutionScope };
export type ExecutionResult = {
	argv: string[];
	exitCode: number | null;
	stdout: string;
	stderr: string;
	platform: { os: "linux"; cpu: string };
	image: string;
	timedOut: boolean;
	verifierRevision?: string;
};
export type ExecutionDiagnostic = { id: string; scope: ExecutionScope; argv: string[]; timeoutMs: number; result?: ExecutionResult };
export type Capture = { entries: LiteralEntry[]; exclusions: string[]; freeze: { scope: ExecutionScope; runtime: string; running: false } };
type State = {
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
	readonly #seals = new Map<string, Promise<Capture>>();
	readonly #preparations = new Map<string, Promise<SandboxHandle>>();
	readonly #allocated = new Set<string>();
	constructor(options: { root: string; authorize: (scope: ExecutionScope) => boolean }) {
		this.#root = options.root;
		this.#authorize = options.authorize;
	}
	prepare(scope: ExecutionScope, profile: LinuxProfile, source: Inputs): Promise<SandboxHandle> {
		const id = identity(scope);
		if (this.#preparations.has(id) || this.#fenced.has(id)) return Promise.reject(new Error("Sandbox workspace reuse is forbidden."));
		const pending = this.#prepare(structuredClone(scope), structuredClone(profile), structuredClone(source));
		this.#preparations.set(id, pending);
		// Invalid profile/input creates no workspace and can be corrected before any environment is admitted.
		void pending.catch(() => {
			if (!this.#allocated.has(id)) this.#preparations.delete(id);
		});
		return pending;
	}
	async #prepare(scope: ExecutionScope, profile: LinuxProfile, source: Inputs): Promise<SandboxHandle> {
		try {
			if (!this.#authorize(scope)) throw new Error("Sandbox scope is fenced/unauthorized.");
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
		} catch (error) {
			throw new SandboxInputRefusal(error instanceof Error ? error.message : String(error), { cause: error });
		}
		const id = identity(scope);
		await mkdir(this.#root, { recursive: true, mode: 0o700 });
		const dir = join(this.#root, id);
		try {
			await mkdir(dir, { mode: 0o700 });
		} catch {
			throw new Error("Sandbox already exists; workspace reuse is forbidden, reconcile original runtime/quarantine.");
		}
		this.#allocated.add(id);
		const handle = {
			id,
			scope: structuredClone(scope),
			runtime: `render-owned-${createHash("sha256").update(this.#root).digest("hex").slice(0, 16)}-${id.slice(0, 32)}`,
		};
		const state: State = { handle, phase: "preparing", profile: structuredClone(profile), source, cpu: "unknown", createIssued: false };
		await this.#save(state);
		try {
			const image = JSON.parse(await docker(["image", "inspect", profile.image]))[0];
			if (image.Os !== "linux") throw new Error("Unsupported platform; macOS checks remain unrun.");
			state.cpu = image.Architecture;
			const uid = process.getuid?.() || 1000;
			const gid = process.getgid?.() || 1000;
			const workspace = join(dir, "workspace");
			await mkdir(workspace, { mode: 0o755 });
			await materialize(workspace, source);
			const mounts: string[] = [];
			for (const [name, input] of Object.entries(source.readOnly ?? {})) {
				const path = join(dir, "candidates", name);
				await mkdir(path, { recursive: true, mode: 0o755 });
				await materialize(path, input);
				const verified = await collect(path, input.objectFormat, profile, false);
				if (treeOid(verified.entries, input.objectFormat) !== input.tree) throw new Error("Read-only candidate materialization mismatch.");
				mounts.push("--mount", `type=bind,src=${path},dst=/candidates/${name},readonly`);
			}
			// Match the trusted host uid, not root. Root-host installations explicitly transfer the private workspace.
			if (process.getuid?.() === 0) await ownTree(workspace, uid, gid);
			const verify = await collect(workspace, source.objectFormat, profile, false);
			if (treeOid(verify.entries, source.objectFormat) !== source.tree) throw new Error("Materialized literal manifest mismatch.");
			if (this.#fenced.has(id) || !this.#authorize(scope)) throw new Error("Sandbox scope fenced before create.");
			const env: string[] = [];
			for (const item of image.Config?.Env ?? []) {
				const key = String(item).split("=")[0]!;
				if (!["PATH", "HOME", "LANG"].includes(key)) env.push("--env", `${key}=`);
			}
			// Persist possible creation before dispatch, so a lost response can never be mistaken for absence.
			state.createIssued = true;
			await this.#save(state);
			const runtime = (
				await docker([
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
					"setInterval(()=>{}, 1000)",
				])
			).trim();
			handle.runtime = runtime;
			await this.#save(state); // durable runtime identity before start
			if (this.#fenced.has(id) || !this.#authorize(scope)) throw new Error("Sandbox scope fenced before start.");
			await docker(["start", runtime]);
			state.phase = "running";
			await this.#save(state);
			return structuredClone(handle);
		} catch (error) {
			state.phase = "quarantined";
			state.reason = String(error);
			await this.#save(state);
			throw error;
		}
	}
	async execute(
		handle: SandboxHandle,
		call: { scope: ExecutionScope; argv: string[]; timeoutMs: number; verifierRevision?: string },
	): Promise<ExecutionResult> {
		if (this.#fenced.has(handle.id)) throw new Error("Sandbox sealed/closed to execute.");
		const state = await this.#load(handle);
		if (this.#fenced.has(handle.id) || state.phase !== "running") throw new Error("Sandbox sealed/closed to execute.");
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
			(await readdir(join(this.#root, handle.id))).filter((name) => /^execution-[0-9a-f-]+\.json$/.test(name)).length >=
				state.profile.maxCommands
		)
			throw new Error("Preregistered experiment command budget exhausted; new round required.");
		const observed = await this.#inspect(state);
		if (!observed.State.Running) throw new Error("Sandbox is not running.");
		if (this.#fenced.has(handle.id) || !this.#authorize(call.scope)) throw new Error("Sandbox sealed/fenced before admission.");
		const diagnostic: ExecutionDiagnostic = { id: randomUUID(), scope: handle.scope, argv: [...call.argv], timeoutMs: call.timeoutMs };
		await this.#saveJson(handle.id, `execution-${diagnostic.id}.json`, diagnostic);
		if (this.#fenced.has(handle.id) || !this.#authorize(call.scope)) throw new Error("Sandbox fenced before execution admission.");
		const result = await new Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
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
		});
		const execution: ExecutionResult = {
			...result,
			verifierRevision: call.verifierRevision,
			argv: [...call.argv],
			platform: { os: "linux", cpu: state.cpu },
			image: state.profile.image,
		};
		await this.#saveJson(handle.id, `execution-${diagnostic.id}.json`, { ...diagnostic, result: execution });
		if (result.timedOut || result.exitCode === null) {
			// Killing docker exec's client is not proof that its process died. Stop the whole environment.
			await this.stop(handle);
			throw new Error("Sandbox command timed out/output bound failed; whole environment stopped, no pass claimed.");
		}
		return execution;
	}
	seal(handle: SandboxHandle): Promise<Capture> {
		this.#fenced.add(handle.id); // synchronous fence, before any await
		const current = this.#seals.get(handle.id);
		if (current) return current;
		const pending = this.#seal(handle);
		this.#seals.set(handle.id, pending);
		void pending.catch(() => this.#seals.delete(handle.id));
		return pending;
	}
	async #seal(handle: SandboxHandle): Promise<Capture> {
		let state = await this.#load(handle);
		if (state.phase === "quarantined") throw new Error(`Sandbox quarantined: ${state.reason}`);
		if (state.phase === "sealed" && state.capture) return state.capture;
		try {
			state.phase = "sealing";
			await this.#save(state);
			await this.stop(handle);
			state = await this.#load(handle);
			await faultBarrier("after-sandbox-stop", "owned-source");
			const before = await this.#inspect(state);
			if (before.State.Running) throw new Error("Whole-container quiescence unconfirmed.");
			const collected = await collect(join(this.#root, handle.id, "workspace"), state.source.objectFormat, state.profile, true);
			const after = await this.#inspect(state);
			if (after.State.Running || before.State.StartedAt !== after.State.StartedAt) throw new Error("Runtime restarted during capture.");
			const capture: Capture = { ...collected, freeze: { scope: handle.scope, runtime: handle.runtime, running: false } };
			state.phase = "sealed";
			state.capture = capture;
			await this.#save(state);
			return capture;
		} catch (error) {
			state.phase = "quarantined";
			state.reason = String(error);
			await this.#save(state);
			throw error;
		}
	}
	async stop(
		handle: SandboxHandle | { scope: ExecutionScope },
	): Promise<{ running: false; runtime: string; source: Source; executions: ExecutionDiagnostic[]; quarantine?: string }> {
		const id = "id" in handle ? handle.id : identity(handle.scope);
		this.#fenced.add(id);
		await this.#preparations.get(id)?.catch(() => {});
		const state = await this.#load("id" in handle ? handle : { id, scope: handle.scope });
		// Retry only containment of the exact journaled runtime. A quarantine is never permission to restart it.
		try {
			// Preparation has settled under the synchronous fence. A never-issued create needs no runtime inspection.
			if (state.createIssued !== false) {
				await this.#inspect(state);
				try {
					await docker(["stop", "--time", "1", state.handle.runtime], 10000);
				} catch {
					await docker(["kill", state.handle.runtime], 10000);
				}
				const observed = await this.#inspect(state);
				if (observed.State.Running || observed.State.Restarting || observed.State.Paused)
					throw new Error("Whole-container not-running confirmation failed.");
			}
			if (state.phase !== "sealed") {
				state.phase = "stopped";
				await this.#save(state);
			}
			const executions: ExecutionDiagnostic[] = [];
			for (const name of (await readdir(join(this.#root, id))).filter((name) => /^execution-[0-9a-f-]+\.json$/.test(name)).sort())
				executions.push(JSON.parse(await readFile(join(this.#root, id, name), "utf8")) as ExecutionDiagnostic);
			return { running: false, runtime: state.handle.runtime, source: state.source, executions, quarantine: state.reason };
		} catch (error) {
			state.phase = "quarantined";
			state.reason = String(error);
			await this.#save(state);
			throw new Error(`Sandbox quarantine: ${String(error)}`);
		}
	}
	async #inspect(state: State) {
		const observed = JSON.parse(await docker(["inspect", state.handle.runtime]))[0];
		if (observed.Id !== state.handle.runtime || observed.Config.Labels["render.owned"] !== state.handle.id)
			throw new Error("Runtime identity inspection mismatch.");
		return observed;
	}
	async #load(handle: { id: string; scope: ExecutionScope; runtime?: string }): Promise<State> {
		if (identity(handle.scope) !== handle.id) throw new Error("Sandbox handle scope mismatch.");
		const state = JSON.parse(await readFile(join(this.#root, handle.id, "state.json"), "utf8")) as State;
		if (JSON.stringify(state.handle.scope) !== JSON.stringify(handle.scope) || (handle.runtime && state.handle.runtime !== handle.runtime))
			throw new Error("Sandbox runtime identity mismatch.");
		return state;
	}
	async #save(state: State): Promise<void> {
		await this.#saveJson(state.handle.id, "state.json", state);
	}
	async #saveJson(id: string, name: string, value: unknown): Promise<void> {
		const dir = join(this.#root, id);
		const path = join(dir, `write-${randomUUID()}.tmp`);
		const file = await open(path, "wx", 0o600);
		try {
			await file.writeFile(JSON.stringify(value));
			await file.sync();
		} finally {
			await file.close();
		}
		await rename(path, join(dir, name));
		for (const path of [dir, this.#root]) {
			const directory = await open(path, "r");
			try {
				await directory.sync();
			} finally {
				await directory.close();
			}
		}
	}
}
function identity(scope: ExecutionScope): string {
	return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}
function docker(args: string[], timeout = 30000): Promise<string> {
	return new Promise((resolve, reject) =>
		execFile("docker", args, { timeout, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout, stderr) =>
			error ? reject(new Error(`Docker ${args[0]} failed: ${stderr}`)) : resolve(stdout),
		),
	);
}
async function materialize(root: string, source: Source): Promise<void> {
	for (const entry of source.entries) {
		const path = join(root, entry.path);
		await mkdir(dirname(path), { recursive: true, mode: 0o755 });
		const content = Buffer.from(entry.content, "base64");
		if (entry.mode === "120000") await symlink(content.toString("utf8"), path);
		else {
			await writeFile(path, content, { flag: "wx", mode: entry.mode === "100755" ? 0o755 : 0o644 });
			await chmod(path, entry.mode === "100755" ? 0o755 : 0o644);
		}
	}
}
async function ownTree(path: string, uid: number, gid: number): Promise<void> {
	const info = await lstat(path);
	if (info.isSymbolicLink()) return;
	await chown(path, uid, gid);
	if (info.isDirectory()) for (const entry of await readdir(path)) await ownTree(join(path, entry), uid, gid);
}
async function collect(
	root: string,
	format: Source["objectFormat"],
	profile: LinuxProfile,
	egress: boolean,
): Promise<{ entries: LiteralEntry[]; exclusions: string[] }> {
	const entries: LiteralEntry[] = [];
	const exclusions: string[] = [];
	let count = 0;
	let bytes = 0;
	async function walk(dir: string, prefix: string) {
		const names = await readdir(dir, { encoding: "buffer" });
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
			const before = await lstat(path);
			if (before.isDirectory()) {
				await walk(path, `${relative}/`);
				continue;
			}
			let content: Buffer;
			let mode: LiteralEntry["mode"];
			if (before.isSymbolicLink()) {
				content = await readlink(path, { encoding: "buffer" });
				mode = "120000";
			} else if (before.isFile()) {
				if (before.mode & 0o7000 || ((before.mode & 0o111) !== 0 && (before.mode & 0o111) !== 0o111))
					throw new Error(`Unsupported file mode: ${relative}`);
				if (bytes + before.size > profile.maxBytes) throw new Error("Collection bytes bound exceeded.");
				const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
				try {
					const checked = await file.stat();
					if (!checked.isFile() || checked.ino !== before.ino || checked.dev !== before.dev || checked.size !== before.size)
						throw new Error("Collection regular file changed.");
					content = await file.readFile();
					const after = await file.stat();
					if (
						after.size !== checked.size ||
						after.mtimeMs !== checked.mtimeMs ||
						after.ctimeMs !== checked.ctimeMs ||
						content.length !== checked.size
					)
						throw new Error("Collection file changed during read.");
				} finally {
					await file.close();
				}
				mode = before.mode & 0o111 ? "100755" : "100644";
			} else throw new Error(`Unsupported special file; require regular file or symlink: ${relative}`);
			bytes += content.length;
			if (bytes > profile.maxBytes) throw new Error("Collection bytes bound exceeded.");
			entries.push({ path: relative, mode, oid: blobOid(format, content), content: content.toString("base64") });
		}
	}
	await walk(root, "");
	entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
	validateEntries(entries, format, profile.maxBytes, profile.maxEntries);
	return { entries, exclusions };
}
