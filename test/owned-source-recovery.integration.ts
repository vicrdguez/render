// Failure oracles authored before recovery/diagnostic implementation.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { PolicyState } from "../src/kernel/policy.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { Sandboxes } from "../src/sandboxes/sandboxes.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { git, sourceFixture } from "./support/source.ts";

test("quarantine reconciliation retries the original runtime without reopening execute or workspace reuse", async () => {
	const f = await sourceFixture();
	const path = process.env.PATH;
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		const handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
		await Effect.runPromise(
			f.sandboxes.execute(handle, { scope: f.scope, argv: ["sh", "-c", "printf diagnostic; exit 7"], timeoutMs: 10000 }),
		);
		process.env.PATH = "/no-runtime-available";
		await assert.rejects(Effect.runPromise(f.sandboxes.stop(handle)), /quarant/i);
		process.env.PATH = path;
		const reopened = new Sandboxes({ root: join(f.root, "sandboxes"), authorize: () => false });
		const stopped = await Effect.runPromise(reopened.stop(handle));
		assert.equal(stopped.runtime, handle.runtime);
		assert.equal(stopped.running, false);
		await assert.rejects(
			Effect.runPromise(reopened.execute(handle, { scope: f.scope, argv: ["true"], timeoutMs: 1000 })),
			/closed|seal|scope/i,
		);
		await assert.rejects(Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base)), /reuse|exist/i);
		const capture = await Effect.runPromise(reopened.seal(handle));
		assert.equal(capture.freeze.runtime, handle.runtime);
		assert.equal(capture.entries.find((e) => e.path === "crlf")?.content, Buffer.from("literal\r\nbytes\r\n").toString("base64"));
	} finally {
		process.env.PATH = path;
		await f.close();
	}
});

test("failed collection retains actual command diagnostics in history without a source pass", async () => {
	const source = await sourceFixture();
	const config = {
		root: join(source.root, "owned"),
		checks: {
			"revision:4": {
				commit: source.commit,
				profile: source.profile,
				argv: ["sh", "-c", "printf 'actual diagnostic\\r\\n'; printf 'failure detail' >&2; mkfifo pipe; exit 7"],
				timeoutMs: 10000,
				verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }), { remote: source.repo, defaultBranch: "fixture", checkImage: source.profile.image });
	try {
		assert.equal(
			(await f.command({ type: "assignTask", slice: "failed:check", delivery: true, packet: packet({ execution: "linux-writer" }) }))
				.status,
			"accepted",
		);
		const deadline = Date.now() + 20000;
		let assignment: RoleAssignment;
		for (;;) {
			const snapshot = f.ledger.snapshot(admin);
			assert.ok("assignments" in snapshot);
			assignment = (snapshot.assignments as RoleAssignment[])[0]!;
			if (assignment.status === "blocked" && !assignment.executing) break;
			assert.ok(Date.now() < deadline, JSON.stringify(assignment));
			await setTimeout(20);
		}
		assert.equal(assignment.report, null, "unsupported source never acquires a verification report");
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in exported);
		const diagnostics = Object.entries(exported.content).flatMap(([ref, bytes]) => {
			try {
				const value = JSON.parse(Buffer.from(bytes, "base64").toString());
				return value.kind === "owned-check-diagnostic" ? [{ ref, value }] : [];
			} catch {
				return [];
			}
		});
		assert.ok(diagnostics.length > 0, "actual command diagnostics must survive failed source collection");
		const diagnostic = diagnostics.find(({ value }) => value.execution?.exitCode === 7)!;
		assert.ok(diagnostic, "actual exit result retained before rooting");
		assert.equal(diagnostic.value.execution.stdout, "actual diagnostic\r\n");
		assert.equal(diagnostic.value.execution.stderr, "failure detail");
		assert.equal(diagnostic.value.execution.platform.os, "linux");
		assert.equal(diagnostic.value.verifierRevision, source.commit);
		assert.equal(diagnostic.value.verification, "unaccepted");
		await f.reopen(new Engine({ ownedChecks: config }));
		const read = await Effect.runPromise(f.ledger.artifact(admin, { read: diagnostic.ref }));
		assert.ok("content" in read);
		assert.deepEqual(JSON.parse(read.content.toString()), diagnostic.value);
	} finally {
		await f.close();
		await source.close();
	}
});

for (const trigger of ["absent image", "absent commit", "gitlink", "base exclusion", "invalid profile"] as const)
	test(`${trigger} refusal releases capacity, survives reopen and cancellation releases writer ownership`, async () => {
		const source = await sourceFixture();
		let commit = source.commit;
		if (trigger === "absent commit") commit = "0".repeat(40);
		if (trigger === "gitlink") {
			const tree = git(source.repo, ["mktree"], `160000 commit ${source.commit}\tsubmodule\n`).toString().trim();
			commit = git(source.repo, ["commit-tree", tree], "Gitlink refusal\n").toString().trim();
		}
		const profile = { ...source.profile };
		if (trigger === "absent image") profile.image = `sha256:${"0".repeat(64)}`;
		if (trigger === "base exclusion") profile.exclusions = [".git", "crlf"];
		if (trigger === "invalid profile") profile.maxEntries = 0;
		const reason = {
			"absent image": /image.*failed/i,
			"absent commit": /git|commit|object/i,
			gitlink: /gitlink/i,
			"base exclusion": /conflicts with accepted base/i,
			"invalid profile": /unsupported Linux profile/i,
		}[trigger];
		const config = {
			root: join(source.root, "owned"),
			checks: {
				"revision:4": {
					commit,
					profile,
					argv: ["true"],
					timeoutMs: 10000,
					verifierRevision: source.commit,
				},
			},
		};
		const f = await roleFixture(new Engine({ ownedChecks: config }), { remote: source.repo, defaultBranch: "fixture", checkImage: source.profile.image });
		const snapshot = () => {
			const value = f.ledger.snapshot(admin);
			assert.ok("assignments" in value);
			return (value.assignments as RoleAssignment[])[0]!;
		};
		try {
			assert.equal(
				(
					await f.command({
						type: "assignTask",
						slice: "prepare:failure",
						delivery: true,
						packet: packet({ execution: "linux-writer" }),
					})
				).status,
				"accepted",
			);
			const deadline = Date.now() + 10000;
			while (snapshot().status !== "blocked" || snapshot().executing) {
				assert.ok(Date.now() < deadline, JSON.stringify(snapshot()));
				await setTimeout(20);
			}
			assert.match(snapshot().blocker!, reason);
			assert.equal(snapshot().report, null);
			await f.reopen(new Engine({ ownedChecks: config }));
			assert.equal(snapshot().executing, false);
			assert.equal(snapshot().status, "blocked");
			assert.match(snapshot().blocker!, reason);
			const a = snapshot();
			assert.equal(
				(
					await f.command(
						{
							type: "cancelWork",
							assignment: a.id,
							generation: a.generation,
							attempt: a.attempt,
						},
						admin,
					)
				).status,
				"accepted",
			);
			while (snapshot().status !== "canceled") {
				assert.ok(Date.now() < deadline, JSON.stringify(snapshot()));
				await setTimeout(20);
			}
			assert.equal(snapshot().executing, false);
			assert.equal(
				(
					await f.command({
						type: "assignTask",
						slice: "prepare:failure",
						delivery: true,
						packet: packet({ execution: "linux-writer" }),
					})
				).status,
				"accepted",
				"a canceled writer must not keep Slice ownership",
			);
		} finally {
			await f.close();
			await source.close();
		}
	});

test("possibly created runtime is never recorded absent: capacity and writer ownership stay held", async () => {
	const source = await sourceFixture();
	// Controlled fault at the runtime boundary: the container really exists, but Render never learns its identity.
	const tools = join(source.root, "tools");
	await mkdir(tools);
	const docker = execFileSync("sh", ["-c", "command -v docker"], { encoding: "utf8" }).trim();
	await writeFile(
		join(tools, "docker"),
		`#!/bin/sh\nif [ "$1" = create ]; then "${docker}" "$@" >/dev/null 2>&1; echo 'lost create response' >&2; exit 1; fi\nexec "${docker}" "$@"\n`,
		{ mode: 0o755 },
	);
	const path = process.env.PATH;
	process.env.PATH = `${tools}:${path}`;
	const config = {
		root: join(source.root, "owned"),
		checks: {
			"revision:4": {
				commit: source.commit,
				profile: source.profile,
				argv: ["true"],
				timeoutMs: 10000,
				verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }), { remote: source.repo, defaultBranch: "fixture", checkImage: source.profile.image });
	const snapshot = () => {
		const value = f.ledger.snapshot(admin);
		assert.ok("assignments" in value);
		return (value.assignments as RoleAssignment[])[0]!;
	};
	const assign = () =>
		f.command({ type: "assignTask", slice: "possibly:created", delivery: true, packet: packet({ execution: "linux-writer" }) });
	const held = "a possibly created runtime must not be recorded absent";
	try {
		assert.equal((await assign()).status, "accepted");
		const deadline = Date.now() + 20000;
		while (snapshot().status !== "blocked") {
			assert.ok(Date.now() < deadline, JSON.stringify(snapshot()));
			await setTimeout(20);
		}
		assert.match(snapshot().blocker!, /Docker create failed: lost create response/);
		// Quiescence commits right after the blocker when absence is wrongly inferred; let that happen before judging.
		const settled = Date.now() + 1000;
		while (Date.now() < settled) {
			assert.equal(snapshot().executing, true, held);
			await setTimeout(20);
		}
		const sandboxes = join(config.root, "sandboxes");
		const [id] = await readdir(sandboxes);
		const { handle } = JSON.parse(await readFile(join(sandboxes, id!, "state.json"), "utf8"));
		const created = execFileSync(docker, ["ps", "-aq", "--filter", `name=^${handle.runtime}$`], { encoding: "utf8" }).trim();
		assert.notEqual(created, "", "the fault must leave an actual runtime behind");

		const a = snapshot();
		assert.equal(
			(await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin)).status,
			"accepted",
		);
		while (snapshot().blocker !== "owned_check_quarantined_stop_unconfirmed") {
			assert.ok(Date.now() < deadline, JSON.stringify(snapshot()));
			await setTimeout(20);
		}
		assert.equal(snapshot().status, "canceling");
		assert.equal(snapshot().executing, true, held);

		await f.reopen(new Engine({ ownedChecks: config }));
		assert.equal(snapshot().status, "canceling");
		assert.equal(snapshot().executing, true, held);
		const replacement = await assign();
		assert.ok(replacement.status === "refused" && replacement.code === "ownership_conflict", JSON.stringify(replacement));
		assert.equal(
			execFileSync(docker, ["ps", "-aq", "--filter", `name=^${handle.runtime}$`], { encoding: "utf8" }).trim(),
			created,
			"recovery must not remove the uncertain runtime to manufacture quiescence",
		);
	} finally {
		process.env.PATH = path;
		await f.close();
		await source.close();
	}
});

async function slowCheck(after = "") {
	const source = await sourceFixture();
	const config = {
		root: join(source.root, "owned"),
		checks: {
			"revision:4": {
				commit: source.commit,
				profile: { ...source.profile, exclusions: [".git", ".command-started"] },
				argv: ["sh", "-c", `touch .command-started; sleep 2; ${after}`],
				timeoutMs: 20000,
				verifierRevision: source.commit,
			},
		},
	};
	const f = await roleFixture(new Engine({ ownedChecks: config }), { remote: source.repo, defaultBranch: "fixture", checkImage: source.profile.image });
	const assignments = () => {
		const value = f.ledger.snapshot(admin);
		assert.ok("assignments" in value);
		return value.assignments as RoleAssignment[];
	};
	const until = async (check: () => boolean | Promise<boolean>) => {
		const deadline = Date.now() + 30000;
		while (!(await check())) {
			assert.ok(Date.now() < deadline, JSON.stringify(assignments()));
			await setTimeout(20);
		}
	};
	// Observed from the command itself. Cancellation before this point has its own tracked behavior.
	const commandStarted = () =>
		until(async () => {
			const sandboxes = join(config.root, "sandboxes");
			const started = await Promise.all(
				(await readdir(sandboxes).catch(() => [])).map((id) =>
					access(join(sandboxes, id, "workspace", ".command-started")).then(
						() => true,
						() => false,
					),
				),
			);
			return started.includes(true);
		});
	return { f, assignments, until, commandStarted, source };
}

test("policy adoption during an owned command holds capacity until stop and refuses the old-basis pass", async () => {
	const { f, assignments, until, commandStarted, source } = await slowCheck("printf 'late filter\n' >> .gitattributes");
	try {
		const assign = () =>
			f.command({ type: "assignTask", slice: "policy:owned", delivery: true, packet: packet({ execution: "linux-writer" }) });
		assert.equal((await assign()).status, "accepted");
		await commandStarted();
		const frame = f.ledger.snapshot(admin) as unknown as { policy: PolicyState };
		const published = await Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "owned-policy",
					command: {
						type: "changePolicy",
						expectedRevision: "policy:initial",
						policy: { completedReviewLimit: 3, reviewerDiversity: "different-family", minimumEvidenceRank: "process" },
					},
				},
				admin,
			),
		);
		assert.ok(published.status === "accepted", JSON.stringify(published));
		const binding = frame.policy.bindings["workflow:3"]!.revision;
		assert.equal(
			(await f.command({ type: "adoptPolicy", revision: published.result.policy, expectedBinding: binding }, admin)).status,
			"accepted",
		);
		assert.equal(assignments()[0]!.status, "blocked");
		assert.equal(assignments()[0]!.executing, true, "adoption must not release capacity before confirmed stop");
		assert.equal((await assign()).status, "refused");

		await until(() => !assignments()[0]!.executing);
		assert.equal(assignments()[0]!.status, "blocked");
		assert.equal(assignments()[0]!.report, null, "a pass receipt must not land on the superseded policy basis");
		assert.match(assignments()[0]!.blocker!, /policy_refresh_required.*stale_assignment/);
		const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in exported);
		const collected = Object.values(exported.content).flatMap((bytes) => {
			try {
				const value = JSON.parse(Buffer.from(bytes, "base64").toString());
				return value.kind === "owned-check-diagnostic" && value.source ? [value] : [];
			} catch {
				return [];
			}
		});
		assert.equal(collected.length, 1, "collected evidence must survive the refused receipt");
		assert.equal(collected[0].verification, "unaccepted");
		assert.equal(collected[0].observed.status, "source_changed");
		assert.equal(collected[0].source.source.tree, collected[0].observed.resultTree);
		assert.match(collected[0].reviewWarning, /REVIEW SOURCE CONFIGURATION CHANGES: \.gitattributes/);
		const a = assignments()[0]!;
		assert.equal(
			(await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin)).status,
			"accepted",
		);
		await until(() => assignments()[0]!.status === "canceled");
		assert.equal((await assign()).status, "accepted");
		await until(() => assignments()[1]!.report !== null);
		assert.notEqual(assignments()[1]!.policyBinding, binding);
	} finally {
		await f.close();
		await source.close();
	}
});

test("canceled owned check replacement runs in its own workspace and retains its own receipt", async () => {
	const { f, assignments, until, commandStarted, source } = await slowCheck();
	try {
		assert.equal(
			(await f.command({ type: "assignTask", slice: "replace:owned", delivery: true, packet: packet({ execution: "linux-writer" }) }))
				.status,
			"accepted",
		);
		await commandStarted();
		const a = assignments()[0]!;
		assert.equal(
			(await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin)).status,
			"accepted",
		);
		const predecessor = assignments()[0]!;
		const early = await f.command({
			type: "replaceTask",
			assignment: predecessor.id,
			generation: predecessor.generation,
			attempt: predecessor.attempt,
			packet: packet({ execution: "linux-writer" }),
		});
		assert.ok(predecessor.executing && early.status === "refused" && early.code === "quiescence_unconfirmed", JSON.stringify(early));
		await until(() => assignments()[0]!.status === "canceled");
		assert.equal(assignments()[0]!.report, null);
		const replacement = await f.command({
			type: "replaceTask",
			assignment: predecessor.id,
			generation: predecessor.generation,
			attempt: predecessor.attempt,
			packet: packet({ execution: "linux-writer" }),
		});
		assert.equal(replacement.status, "accepted", JSON.stringify(replacement));
		await until(() => assignments()[1]!.report !== null && !assignments()[1]!.executing);
		const fresh = assignments()[1]!;
		assert.equal(fresh.predecessor, predecessor.id);
		const read = await Effect.runPromise(f.ledger.artifact(admin, { read: fresh.report! }));
		assert.ok("content" in read);
		const receipt = JSON.parse(read.content.toString());
		assert.equal(receipt.kind, "owned-check");
		assert.equal(receipt.scope.assignment, fresh.id);
		assert.equal(receipt.verification.status, "passed");
		await until(() => assignments()[1]!.runtimeTaskCaptured === true);
	} finally {
		await f.close();
		await source.close();
	}
});
