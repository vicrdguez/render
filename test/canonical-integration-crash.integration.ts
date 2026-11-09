// CI20 at real process cuts (V3): the host is SIGKILLed before and after admission, before and after the CAS, after
// the durable readback, and after the SQL observation that qualifies. after-integration-cas is also the cut before the
// readback, and after-integration-readback the cut before SQL qualification: nothing runs between them. A fresh executor
// epoch never adopts the old permit: it reconciles the canonical ref after a durability barrier and records exactly one
// qualification.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { access, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine, type OwnedChecks } from "../src/engine/runtime.ts";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { faultBarrier } from "../src/ledger/barrier.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { proposalRef } from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Cut = {
	barrier: Parameters<typeof faultBarrier>[0];
	/** Engine cuts are keyed by the pass, Effects cuts by the proposal. */
	key: string;
	/** Whether the canonical ref already reads R when the host dies. */
	moved: boolean;
	/** How recovery reaches the one qualification. */
	recovery: "fresh-admission" | "reconcile-then-fresh" | "reconcile" | "already-qualified";
	/** The killed host's Git also left a canonical-ref lock behind. */
	staleLock?: true;
};
const PASS = "integration:pass:workflow:2:value:1";
const PROPOSAL = "integration:workflow:2";
const CUTS: Cut[] = [
	{ barrier: "before-integration-admission", key: PASS, moved: false, recovery: "fresh-admission" },
	{ barrier: "after-integration-admission", key: PASS, moved: false, recovery: "reconcile-then-fresh", staleLock: true },
	{ barrier: "before-integration-cas", key: PASS, moved: false, recovery: "reconcile-then-fresh" },
	{ barrier: "after-integration-cas", key: PROPOSAL, moved: true, recovery: "reconcile" },
	{ barrier: "after-integration-readback", key: PROPOSAL, moved: true, recovery: "reconcile" },
	{ barrier: "after-integration-qualification", key: PASS, moved: true, recovery: "already-qualified" },
];

async function cut({ barrier, key, moved, recovery, staleLock }: Cut) {
	const child = spawn(process.execPath, [new URL("./support/integration-crash-worker.ts", import.meta.url).pathname, barrier, key], {
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
	let recovered: Effect.Success<ReturnType<typeof openLedger>> | undefined;
	try {
		const deadline = Date.now() + 180000;
		while (!output.includes('"event":"barrier"')) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(Date.now() < deadline, `${barrier} missing: ${output} ${stderr}`);
			await delay(20);
		}
		setup = JSON.parse(output.split("\n").find((line) => line.includes('"event":"data"'))!);
		const store = join(setup!.config.root, "effects", "projects", "project:2.git");
		const ref = () =>
			git(store, ["rev-parse", proposalRef("workflow:2")])
				.toString()
				.trim();
		const before = ref();
		const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		child.kill("SIGKILL");
		await died;
		const lock = join(store, `${proposalRef("workflow:2")}.lock`);
		if (staleLock) await writeFile(lock, `${before}\n`);
		const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
		// The fixture's paused coordinator may resume; no delivery or review role may run again.
		const roles: string[] = [];
		provider.setResponses(
			Array.from({ length: 8 }, () => (transcript: { messages: { role: string; sections?: Record<string, string | null> }[] }) => {
				const live = transcript.messages.findLast((m) => m.role === "system" && m.sections?.["role-packet"])?.sections?.["role-packet"];
				roles.push(live ? JSON.parse(live.slice(live.indexOf("{"), live.lastIndexOf("}") + 1)).packet.role : "unknown");
				return fauxAssistantMessage("paused");
			}),
		);
		recovered = await Effect.runPromise(
			openLedger({
				data: setup!.data,
				runtime: (report) =>
					new Engine({
						ownedChecks: setup!.config,
						provider: provider.provider,
						apiKey: "fixture",
						families: { "claude-sonnet-4-6": "claude" },
					}).options(report),
				onFatal: () => {},
			}),
		);
		const epoch = recovered.ledger.status().executorEpoch;
		const pass = () => ((recovered!.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[])[0]!;
		const until = Date.now() + 120000;
		while (pass().handoff?.integrations?.at(-1)?.status !== "qualified") {
			assert.doesNotMatch(pass().handoff?.blocker ?? "", /^integration_/, JSON.stringify(pass().handoff));
			assert.ok(Date.now() < until, `recovered integration: ${JSON.stringify(pass().handoff)}`);
			await delay(50);
		}
		const [operation, ...others] = pass().handoff!.integrations!;
		assert.equal(others.length, 0, "one operation");
		const R = operation!.result;
		assert.equal(ref(), R, "the canonical ref is exactly R");
		const observation = async (id: string) => {
			const read = await Effect.runPromise(recovered!.ledger.artifact(admin, { read: id }));
			assert.ok("content" in read);
			return JSON.parse(read.content.toString()) as { mode: string; observed: { commit: string } };
		};
		assert.equal(before === R, moved, moved ? "the CAS committed before the host died" : "the host died before any canonical-ref change");
		const attempts = operation!.attempts;
		const seen = async (attempt: (typeof attempts)[number]) => (await observation(attempt.observations[0]!)).mode;
		if (recovery === "fresh-admission" || recovery === "reconcile-then-fresh") {
			const [old, fresh, ...more] = recovery === "fresh-admission" ? [undefined, ...attempts] : attempts;
			assert.equal(more.length, 0);
			if (old) {
				assert.notEqual(old.executorEpoch, epoch, "the first permit belonged to the dead executor");
				assert.equal(old.outcome, "unapplied", "the old permit was reconciled from T, never adopted or dispatched");
				assert.equal(await seen(old), "reconcile");
			}
			assert.equal(fresh!.executorEpoch, epoch, "a fresh current admission under the recovering epoch");
			assert.equal(fresh!.outcome, "applied");
			assert.equal(await seen(fresh!), "dispatch");
		} else {
			assert.equal(attempts.length, 1, "no second admission or CAS");
			assert.notEqual(attempts[0]!.executorEpoch, epoch);
			assert.equal(attempts[0]!.outcome, "applied");
			const qualified = await observation(operation!.qualification!);
			assert.equal(qualified.observed.commit, R);
			assert.equal(
				qualified.mode,
				recovery === "reconcile" ? "reconcile" : "dispatch",
				recovery === "reconcile"
					? "qualified from reconciliation after a durability barrier, never inferred"
					: "qualified before the host died",
			);
		}
		if (staleLock) await assert.rejects(access(lock), "the dead host's ref lock was removed before classification");
		assert.deepEqual(
			roles.filter((role) => role !== "coordinator"),
			[],
			"recovery reruns no implementation, Audit or Watchdog role",
		);
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
		if (recovered) await Effect.runPromise(recovered.close());
		if (setup) {
			const sandboxes = join(setup.config.root, "sandboxes");
			for (const id of await readdir(sandboxes).catch(() => [])) {
				try {
					const runtime = JSON.parse(await readFile(join(sandboxes, id, "state.json"), "utf8")).handle.runtime;
					execFileSync("docker", ["rm", "-f", runtime], { stdio: "ignore" });
				} catch {
					/* already removed */
				}
			}
			await rm(setup.data, { recursive: true, force: true });
			await rm(setup.root, { recursive: true, force: true });
		}
	}
}

for (const c of CUTS)
	test(`CI20 SIGKILL ${c.barrier}${c.staleLock ? " leaving a ref lock" : ""}: recovery qualifies exactly once`, async () => {
		await cut(c);
	});
