// Unsafe controls: each applies one intended wrong behavior to a temporary copy of the source and requires the
// targeted check to fail on an assertion. A control that fails on import, syntax or setup does not count, and every
// targeted check must pass on the unmutated copy first.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;

type Edit = { file: string; find: string; replace: string };
// `expect` is the assertion message the intended wrong behavior must produce; any other failure is not detection.
type Control = { name: string; edits: Edit[]; test: string; pattern: string; behavior: string; expect: RegExp };

const CONTROLS: Control[] = [
	{
		name: "owned-hidden-base",
		behavior: "collector trusts a worker ignore to drop accepted base source",
		test: "test/owned-source-controls.test.ts",
		pattern: "worker ignore",
		expect: /worker ignores must not hide accepted literal source/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: "const relative = `${prefix}${name}`;",
				replace: 'const relative = `${prefix}${name}`; if (egress && relative === "ignored") continue;',
			},
		],
	},
	{
		name: "owned-follow-symlink",
		behavior: "collector follows a worker symlink into host bytes",
		test: "test/owned-source-controls.test.ts",
		pattern: "symlink stays",
		expect: /collector must retain symlink text, never host target bytes/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: 'content = await readlink(path, { encoding: "buffer" });',
				replace: 'content = egress && relative === "host-link" ? await readFile(path) : await readlink(path, { encoding: "buffer" });',
			},
		],
	},
	{
		name: "owned-early-reuse",
		behavior: "prepare returns an already-live workspace",
		test: "test/owned-source-controls.test.ts",
		pattern: "workspace never reused",
		expect: /live workspace must not be reused before confirmed quiescence/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: 'if (this.#preparations.has(id) || this.#fenced.has(id)) return Promise.reject(new Error("Sandbox workspace reuse is forbidden."));',
				replace: "if (this.#preparations.has(id)) return this.#preparations.get(id)!;",
			},
		],
	},
	{
		name: "owned-possibly-created-absent",
		behavior: "Engine classifies a preparation failure after create was issued as a pre-allocation refusal",
		test: "test/owned-source-recovery.test.ts",
		pattern: "possibly created",
		expect: /a possibly created runtime must not be recorded absent/,
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: 'if (error instanceof SandboxInputRefusal) environment = "absent";',
				replace: 'if (error instanceof SandboxInputRefusal || /Docker create failed/.test(String(error))) environment = "absent";',
			},
		],
	},
	{
		name: "owned-host-fallback",
		behavior: "executor runs the actual coding command on the host",
		test: "test/owned-source-controls.test.ts",
		pattern: "fall back",
		expect: /host-shell fallback exposes an owned host-only canary/,
		edits: [
			{
				file: "src/sandboxes/sandboxes.ts",
				find: 'if (this.#fenced.has(handle.id)) throw new Error("Sandbox sealed/closed to execute.");',
				replace:
					'return new Promise(resolve => execFile(call.argv[0]!, call.argv.slice(1), {encoding: "utf8"}, (error, stdout, stderr) => resolve({argv: call.argv, exitCode: error ? 1 : 0, stdout, stderr, platform: {os: "linux", cpu: "unknown"}, image: "host", timedOut: false})));',
			},
		],
	},
	{
		name: "offhost-backup-state-unvalidated",
		expect: /backup-schema semantics must be validated beyond checksums/,
		behavior: "a checksummed package with an unsupported retained backup schema is imported",
		edits: [
			{
				file: "src/ledger/recovery.ts",
				find: 'check(meta.backup === undefined || validBackup(meta.backup, meta.sequence), "backup state");',
				replace: "void 0;",
			},
		],
		test: "test/recovery-packages.test.ts",
		pattern: "checksummed but semantically",
	},
	{
		name: "offhost-copy-only",
		expect: /copy-only must not advance protected cutoff/,
		behavior: "a successful copy without a durable verified receipt establishes protection",
		edits: [
			{
				file: "src/ledger/offhost.ts",
				find: "assertReceipt(receipt, manifest);",
				replace: "// unsafe: accept a copy without verification",
			},
		],
		test: "test/offhost-protection.test.ts",
		pattern: "configured/local-copy",
	},
	{
		name: "offhost-local-copy",
		expect: /copy-only must not advance protected cutoff/,
		behavior: "a completed local package establishes protection despite failed transfer verification",
		edits: [
			{
				file: "src/ledger/backup.ts",
				find: "await transferPackage(local.path, this.#destination);",
				replace: "try { await transferPackage(local.path, this.#destination); } catch {}",
			},
		],
		test: "test/offhost-protection.test.ts",
		pattern: "configured/local-copy",
	},
	{
		name: "repair-empty-cursor-key",
		expect: /repaired cursors must use a fresh private secret/,
		behavior: "repair omits key rotation and restored history signs with the public empty fallback",
		edits: [{ file: "src/ledger/ledger.ts", find: "meta.historyCursorKey = randomUUID();", replace: "delete meta.historyCursorKey;" }],
		test: "test/recovery-packages.test.ts",
		pattern: "history scope, secret exclusion",
	},
	{
		name: "restricted-role-resume",
		expect: /restricted recovery must skip both Engine resume hooks/,
		behavior: "restricted startup calls Engine resume hooks and resumes retained tasks",
		edits: [{ file: "src/ledger/startup.ts", find: "if (!restricted) {", replace: "if (true) {" }],
		test: "test/recovery-role-work.test.ts",
		pattern: "role work explicitly",
	},
	{
		name: "package-origin-ignored",
		expect: /package-origin fence must reject backed-up credentials/,
		behavior: "package verifiers revive when startup ignores the offline marker",
		edits: [
			{
				file: "src/ledger/startup.ts",
				find: 'const restricted = recovery !== undefined && recovery.mode !== "active";',
				replace:
					'await harness.commit(async tx => Object.assign(await tx.doc(Recovery), { mode: "active", restoreRequired: false }), ctx);\n\t\trecovery = await harness.snapshot(Recovery, ctx);\n\t\tconst restricted = recovery !== undefined && recovery.mode !== "active";',
			},
		],
		test: "test/recovery-packages.test.ts",
		pattern: "package-origin-auth-fence",
	},
	{
		name: "missing-restored-receipt-is-unsent",
		expect: /missing restored receipt must retain uncertainty/,
		behavior: "a missing post-cutoff receipt is treated as ordinary not-found",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'if (this.#recovery?.mode === "recovery-reconciling")',
				replace: "if (false)",
			},
		],
		test: "test/recovery-packages.test.ts",
		pattern: "package-origin-auth-fence",
	},
	{
		name: "blocked-slot-release",
		expect: /capacity_exhausted/,
		behavior: "a human-blocked but still executing Attempt releases its slot",
		edits: [{ file: "src/kernel/roles.ts", find: "a.blocker = c.reason;", replace: "a.blocker = c.reason; a.executing = false;" }],
		test: "test/cancellation-capacity.test.ts",
		pattern: "R05",
	},
	{
		name: "inherited-role-tools",
		expect: /role must not inherit broad tools/,
		behavior: "role configuration inherits broad coding tools from the host",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "import { anthropicProvider }",
				replace: 'import { CodingTools } from "@earendil-works/pi-durable/tools";\nimport { anthropicProvider }',
			},
			{
				file: "src/engine/runtime.ts",
				find: "registry.install(this.#roles);",
				replace: "registry.install(this.#roles); registry.install(CodingTools);",
			},
			{ file: "src/engine/runtime.ts", find: "extensions: [this.#roles],", replace: "extensions: [this.#roles, CodingTools]," },
			{ file: "src/engine/runtime.ts", find: "tools: this.#roles.tools ?? [],", replace: "tools: null," },
			{ file: "src/engine/runtime.ts", find: "modelTools: this.#roles.tools ?? [],", replace: "modelTools: null," },
		],
		test: "test/role-capability-refusal.test.ts",
		pattern: "R03 explicit",
	},
	{
		name: "tool-owned-role-child",
		expect: /role did not settle within 5s/,
		behavior: "accepted child runs under the submitting tool instead of a workflow-owned task",
		edits: [
			{
				file: "src/engine/runtime.ts",
				find: "return tx.createTask(\n\t\t\t\t\t\tthis.#run,",
				replace: "if (a.parent) return 0;\n\t\t\t\t\treturn tx.createTask(\n\t\t\t\t\t\tthis.#run,",
			},
			{
				file: "src/engine/runtime.ts",
				find: "const reply = await this.#ledger!.command(envelope, identity.context);",
				replace:
					'const reply = await this.#ledger!.command(envelope, identity.context);\n\t\tif (command.type === "requestRole" && reply.status === "accepted") await api.createTask(this.#run, { assignment: reply.result.assignment as string }, { ownership: { kind: "task", taskId: api.taskId } }, ctx);',
			},
		],
		test: "test/workflow-task-survival.test.ts",
		pattern: "R01/R07",
	},
	{
		name: "latest-only-export",
		expect: /export must retain superseded identities, not latest only/,
		behavior: "export drops every superseded revision",
		edits: [
			{
				file: "src/ledger/history.ts",
				find: "const included = records;",
				replace: "const included = records.filter((r) => !records.some((newer) => newer.supersedes.includes(r.ref)));",
			},
		],
		test: "test/history-cutoff-export.test.ts",
		pattern: "exact separate identities",
	},
	{
		name: "history-cutoff-drift",
		expect: /history cutoff must not drift/,
		behavior: "continuing a traversal silently advances its cutoff",
		edits: [
			{
				file: "src/ledger/history.ts",
				find: "cutoff: state.cutoff,\n\t\tscope: state.scope,\n\t\trecords:",
				replace: "cutoff: state.cutoff + (state.offset > 0 ? 1 : 0),\n\t\tscope: state.scope,\n\t\trecords:",
			},
		],
		test: "test/history-cutoff-export.test.ts",
		pattern: "exact separate identities",
	},
	{
		name: "principal-forgery-header",
		expect: /enrollDevice: \{"status":"accepted"/,
		behavior: "a request header raises a device to the local-admin route",
		edits: [
			{
				file: "src/ledger/http.ts",
				find: "const context = ledger.authenticate(req.headers.authorization);",
				replace:
					'const context = req.headers["x-render-route"] === "local-admin" ? mintContext({ kind: "human", human: "human:owner", route: "local-admin" }) : ledger.authenticate(req.headers.authorization);',
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-04/B1-05/B1-06",
	},
	{
		name: "principal-forgery-matrix",
		expect: /(enrollDevice|revokeDevice) accepted from forbidden/,
		behavior: "the Kernel admits any human to the local-admin family",
		edits: [
			{
				file: "src/kernel/kernel.ts",
				find: '"local-admin": (p) => p.kind === "human" && p.route === "local-admin",',
				replace: '"local-admin": (p) => p.kind === "human",',
			},
		],
		test: "test/kernel-authority-schedules.test.ts",
		pattern: "^V1",
	},
	{
		name: "stale-write-acceptance",
		expect: /a stale save must be refused/,
		behavior: "a save is accepted against a stale expected revision",
		edits: [{ file: "src/kernel/kernel.ts", find: "if (c.expected !== current) {", replace: "if (false) {" }],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B2-01/B2-02",
	},
	{
		name: "dedup-before-auth",
		expect: /a revoked device's retry must not disclose the receipt/,
		behavior: "receipt deduplication runs before the current credential is checked",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "device === undefined || device.revokedAtSequence !== null || !verifies",
				replace: "device === undefined || !verifies",
			},
			{
				file: "src/ledger/ledger.ts",
				find: "\t\tif (!this.#current(principal)) return UNAUTHORIZED;\n\t\tconst env = parseEnvelope(raw);",
				replace: "\t\tconst env = parseEnvelope(raw);",
			},
			{
				file: "src/ledger/ledger.ts",
				find: '\t\tlet current = principal;\n\t\tif (principal.kind === "human" && principal.route === "device") {',
				replace:
					// biome-ignore lint/suspicious/noTemplateCurlyInString: this is mutated source text, not a template.
					'\t\tconst early = await tx.doc(Receipt, `${namespaceOf(principal)} ${env.commandId}`, null);\n\t\tif (early.exists && early.fingerprint === env.fingerprint) return { duplicate: true as const, body: plain(early.body) as ReceiptBody };\n\t\tlet current = principal;\n\t\tif (principal.kind === "human" && principal.route === "device") {',
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-11",
	},
	{
		name: "dedup-ignores-payload",
		expect: /a changed payload under a used ID must conflict/,
		behavior: "a reused command ID with a changed payload returns the original receipt",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "if (receipt.fingerprint !== env.fingerprint || !readable(receipt.body, current)) throw new Abort(CONFLICT);",
				replace: "if (!readable(receipt.body, current)) throw new Abort(CONFLICT);",
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-10",
	},
	{
		name: "device-bound-dedup",
		expect: /a second device's retry must return the original receipt/,
		behavior: "command IDs are namespaced by device, so a second device's retry executes again",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: '\tif (principal.kind === "human") return principal.human;',
				replace:
					// biome-ignore lint/suspicious/noTemplateCurlyInString: this is mutated source text, not a template.
					'\tif (principal.kind === "human") return `${principal.human}:${principal.route === "device" ? principal.device : "admin"}`;',
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B1-09",
	},
	{
		name: "lock-after-open",
		expect: /must be refused by the owner lock[\s\S]*store_unreadable/,
		behavior: "the owner lock is taken after the store is opened",
		edits: [
			{
				file: "src/ledger/startup.ts",
				find: '\tconst lock = acquireOwnerLock(join(options.data, "owner.lock"));',
				replace: "\tlet lock = { release: () => undefined };",
			},
			{
				file: "src/ledger/startup.ts",
				find: '\t\tconst fresh = identifyStore(path) === "new";',
				replace: '\t\tconst fresh = identifyStore(path) === "new";\n\t\tlock = acquireOwnerLock(join(options.data, "owner.lock"));',
			},
		],
		test: "test/persistence-startup.test.ts",
		pattern: "B4-01/B4-02",
	},
	{
		name: "weakened-synchronous",
		expect: /ready must report the required persistence readback/,
		behavior: "the host runs with synchronous=NORMAL and skips readback validation",
		edits: [
			{
				file: "src/ledger/startup.ts",
				find: 'await adapter.exec("PRAGMA synchronous = FULL");',
				replace: 'await adapter.exec("PRAGMA synchronous = NORMAL");',
			},
			{ file: "src/ledger/startup.ts", find: "if (mismatched.length > 0)", replace: "if (false)" },
		],
		test: "test/persistence-startup.test.ts",
		pattern: "B4-03/B4-09/B4-10",
	},
	{
		name: "latest-only-history",
		expect: /exact bytes of revision:\d+ after restart/,
		behavior: "an older revision ref resolves to the newest bytes of its document",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: '\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcase "document.advance": {',
				replace:
					'\t\t\t\t\tif (write.parent !== null) Object.assign(await tx.doc(RevisionLocation, write.parent, null), { entry: entry.id });\n\t\t\t\t\tbreak;\n\t\t\t\t}\n\t\t\t\tcase "document.advance": {',
			},
			{ file: "src/ledger/ledger.ts", find: "if (data.revision !== ref || !intact(", replace: "if (!intact(" },
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "B2-01/B2-02",
	},
	{
		name: "substitute-corrupt-bytes",
		expect: /a corrupt revision must be refused, not served/,
		behavior: "a corrupt revision read is answered with other retained bytes",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: "\t\t\tif (data.revision !== ref || !intact(data.text, data.digest, data.byteLength))\n\t\t\t\treturn {",
				replace: "\t\t\tif (false)\n\t\t\t\treturn {",
			},
		],
		test: "test/sqlite-command-atomicity.test.ts",
		pattern: "tampered stored bytes",
	},
	{
		name: "revoked-stream-stays-open",
		expect: /expected an end frame after revocation/,
		behavior: "revocation does not close the revoked device's observation stream",
		edits: [
			{
				file: "src/ledger/ledger.ts",
				find: 'for (const o of this.#observers) if (o.device === outcome.device.device) this.#endObserver(o, "credential_revoked");',
				replace: "void 0;",
			},
		],
		test: "test/two-client-reattach.test.ts",
		pattern: "B2-03 race",
	},
	{
		name: "kernel-mutates-input",
		expect: /Kernel mutated its inputs/,
		behavior: "the Kernel changes the state it was given while deciding",
		edits: [
			{
				file: "src/kernel/kernel.ts",
				find: '\t\tcase "revokeDevice": {\n\t\t\tif (state.device === null)',
				replace:
					'\t\tcase "revokeDevice": {\n\t\t\tif (state.device !== null) (state.device as { revoked: boolean }).revoked = true;\n\t\t\tif (state.device === null)',
			},
		],
		test: "test/kernel-authority-schedules.test.ts",
		pattern: "^V1",
	},
	{
		name: "slow-consumer-kept",
		expect: /the stalled stream must have been disconnected by the host/,
		behavior: "a stalled observer is never disconnected",
		edits: [{ file: "src/ledger/http.ts", find: "if (++pending > MAX_PENDING_FRAMES) {", replace: "if (false) {" }],
		test: "test/two-client-reattach.test.ts",
		pattern: "B3-05",
	},
];

async function copy(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "render-control-"));
	await cp(join(ROOT, "src"), join(dir, "src"), { recursive: true });
	await cp(join(ROOT, "test"), join(dir, "test"), { recursive: true });
	for (const f of ["package.json", "tsconfig.json"]) await cp(join(ROOT, f), join(dir, f));
	await symlink(join(ROOT, "node_modules"), join(dir, "node_modules"));
	return dir;
}

function run(dir: string, control: Control): { code: number | null; output: string } {
	const r = spawnSync(process.execPath, ["--test", `--test-name-pattern=${control.pattern}`, control.test], {
		cwd: dir,
		encoding: "utf8",
		timeout: 300_000,
	});
	return { code: r.status, output: `${r.stdout}\n${r.stderr}` };
}

const SETUP_FAILURE = /ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError|Cannot find module/;

const results: Record<string, unknown>[] = [];
let undetected = 0;
const only = process.argv[2];
for (const control of CONTROLS.filter((c) => only === undefined || c.name === only)) {
	const dir = await copy();
	try {
		const baseline = run(dir, control);
		const baselinePassed = baseline.code === 0 && /ℹ pass [1-9]/.test(baseline.output);
		for (const edit of control.edits) {
			const path = join(dir, edit.file);
			const source = await readFile(path, "utf8");
			const occurrences = source.split(edit.find).length - 1;
			if (occurrences !== 1) throw new Error(`${control.name}: expected exactly one match in ${edit.file}, found ${occurrences}`);
			await writeFile(path, source.replace(edit.find, edit.replace));
		}
		const mutated = run(dir, control);
		const failed = mutated.code !== 0;
		const intended = failed && control.expect.test(mutated.output) && !SETUP_FAILURE.test(mutated.output);
		const detected = baselinePassed && intended;
		if (!detected) undetected++;
		const assertion = /AssertionError[^\n]*\n?[^\n]*/.exec(mutated.output)?.[0]?.trim().slice(0, 300) ?? null;
		results.push({
			control: control.name,
			behavior: control.behavior,
			check: `${control.test} :: ${control.pattern}`,
			baselinePassed,
			detected,
			// A failure that is not the intended assertion is reported, never counted as detection.
			failedOtherwise: failed && !intended,
			assertion,
		});
		process.stdout.write(`${JSON.stringify(results.at(-1))}\n`);
		if (!detected && process.env.RENDER_CONTROLS_VERBOSE) process.stderr.write(mutated.output);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
process.stdout.write(`${JSON.stringify({ controls: results.length, detected: results.length - undetected, undetected })}\n`);
process.exit(undetected === 0 ? 0 : 1);
