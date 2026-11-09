// WR17 at a real process cut: the host dies while a Watchdog's own Linux checks of exact X run. Recovery must stop
// that runtime, resume the same round (no new round, no count), rerun its checks under the recovering executor and
// record them once. The resumed verdict is scripted fixture data.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine, type OwnedChecks } from "../src/engine/runtime.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { admin, claudeFixture } from "./support/roles.ts";

const running = (id: string) => {
	try {
		return execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", id], { encoding: "utf8" }).trim() === "true";
	} catch {
		return false; // removed
	}
};

test("WR17 SIGKILL while a Watchdog's own checks run: recovery stops the runtime and the same round records its checks once", async () => {
	const child = spawn(process.execPath, [new URL("./support/watchdog-crash-worker.ts", import.meta.url).pathname], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	let stderr = "";
	child.stdout!.on("data", (b) => {
		output += b;
	});
	child.stderr!.on("data", (b) => {
		stderr += b;
	});
	let setup: { data: string; root: string; config: OwnedChecks } | undefined;
	const runtimes: string[] = [];
	let recovered: Effect.Success<ReturnType<typeof openLedger>> | undefined;
	try {
		const deadline = Date.now() + 180000;
		while (!output.includes('"event":"barrier"')) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(Date.now() < deadline, `review-check barrier missing: ${output} ${stderr}`);
			await delay(20);
		}
		setup = JSON.parse(output.split("\n").find((line) => line.includes('"event":"data"'))!);
		const sandboxes = join(setup!.config.root, "sandboxes");
		const live: { epoch: string; runtime: string; assignment: string }[] = [];
		for (const id of await readdir(sandboxes)) {
			const state = JSON.parse(await readFile(join(sandboxes, id, "state.json"), "utf8"));
			runtimes.push(state.handle.runtime);
			if (running(state.handle.runtime))
				live.push({ epoch: state.handle.scope.executorEpoch, runtime: state.handle.runtime, assignment: state.handle.scope.assignment });
		}
		assert.equal(live.length, 1, "only the Watchdog's check runtime is running at the cut");
		const old = live[0]!;
		const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		child.kill("SIGKILL");
		await died;
		const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		const prompts: { assignment: string; checks?: string }[] = [];
		provider.setResponses(
			Array.from({ length: 4 }, () => (transcript: { messages: { role: string; sections?: Record<string, string | null> }[] }) => {
				const live = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])!.sections!["role-packet"]!;
				const prompt = JSON.parse(live.slice(live.indexOf("{"), live.lastIndexOf("}") + 1));
				const b = prompt.watchdogReview;
				assert.ok(b, "only the resumed Watchdog round asks the provider");
				prompts.push({ assignment: prompt.assignment, checks: b.checks });
				return fauxAssistantMessage(
					fauxToolCall("submit_role_result", {
						text: JSON.stringify({
							schema: 1,
							verdict: "pass",
							passRef: b.passRef,
							handoff: b.handoff,
							source: b.source,
							prepared: b.prepared,
							target: b.target,
						}),
						supports: [],
						verification: { outcome: "pass", rank: "tests", reason: "Own checks on exact X passed" },
					}),
					{ stopReason: "toolUse" },
				);
			}),
		);
		recovered = await Effect.runPromise(
			openLedger({
				data: setup!.data,
				runtime: (report) =>
					new Engine({
						ownedChecks: setup!.config,
						provider: provider.provider,
						...claudeFixture,
					}).options(report),
				onFatal: () => {},
			}),
		);
		const passes = () => (recovered!.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const watchdogs = () =>
			((recovered!.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[]).filter((a) => a.packet.role === "watchdog");
		assert.deepEqual(
			watchdogs().map((w) => w.id),
			[old.assignment],
			"the running check belonged to the one launched round",
		);
		const until = Date.now() + 180000;
		const qualified = () => passes()[0]?.handoff?.integrations?.at(-1)?.status === "qualified";
		while (!qualified() && !/^(awaiting_|needs_human|watchdog_|integration_)/.test(passes()[0]?.handoff?.blocker ?? "")) {
			assert.ok(Date.now() < until, `recovered review: ${JSON.stringify([passes()[0]?.handoff, watchdogs()])}`);
			await delay(50);
		}
		assert.ok(qualified(), `the recovered passing round integrates: ${passes()[0]?.handoff?.blocker}`);
		assert.equal(running(old.runtime), false, "the interrupted check runtime was stopped, not abandoned");
		for (const id of await readdir(sandboxes))
			runtimes.push(JSON.parse(await readFile(join(sandboxes, id, "state.json"), "utf8")).handle.runtime);
		const [w, ...others] = watchdogs();
		assert.equal(others.length, 0, "an interruption opens no new round");
		assert.equal(w!.id, old.assignment);
		assert.equal(w!.status, "submitted");
		const read = await Effect.runPromise(recovered.ledger.artifact(admin, { read: w!.watchdogReview!.checks! }));
		assert.ok("content" in read);
		const checks = JSON.parse(read.content.toString()) as {
			evidence: { scope: { executorEpoch: string }; verification: { status: string } };
		};
		assert.notEqual(checks.evidence.scope.executorEpoch, old.epoch, "checks come from the recovering executor's own runtime");
		assert.equal(checks.evidence.verification.status, "needs_assessment");
		assert.ok(prompts.every((p) => p.assignment === w!.id && p.checks === w!.watchdogReview!.checks));
		assert.equal(passes().length, 1, "no successor pass");
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
		if (recovered) await Effect.runPromise(recovered.close());
		for (const runtime of new Set(runtimes)) {
			try {
				execFileSync("docker", ["rm", "-f", runtime], { stdio: "ignore" });
			} catch {
				/* already removed */
			}
		}
		if (setup) {
			await rm(setup.data, { recursive: true, force: true });
			await rm(setup.root, { recursive: true, force: true });
		}
	}
});
