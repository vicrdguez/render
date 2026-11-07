// CI20 at real process cuts (V3): the host is SIGKILLed after an integration admission but before its CAS, and after
// the CAS but before its SQL observation. A fresh executor epoch must never adopt the old permit: it reconciles the
// canonical ref read-only, and records exactly one qualification.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { Engine, type OwnedChecks } from "../src/engine/runtime.ts";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { proposalRef, sha } from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

async function cut(barrier: "before-integration-cas" | "after-integration-cas") {
	const child = spawn(process.execPath, [new URL("./support/integration-crash-worker.ts", import.meta.url).pathname, barrier], {
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
	let recovered: Awaited<ReturnType<typeof openLedger>> | undefined;
	try {
		const deadline = Date.now() + 180000;
		while (!output.includes('"event":"barrier"')) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(Date.now() < deadline, `${barrier} missing: ${output} ${stderr}`);
			await delay(20);
		}
		setup = JSON.parse(output.split("\n").find((line) => line.includes('"event":"data"'))!);
		const store = join(setup!.config.root, "effects", sha("owned"), "source.git");
		const ref = () =>
			git(store, ["rev-parse", proposalRef("workflow:2")])
				.toString()
				.trim();
		const before = ref();
		const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		child.kill("SIGKILL");
		await died;
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
		recovered = await openLedger({
			data: setup!.data,
			runtime: (report) =>
				new Engine({
					ownedChecks: setup!.config,
					provider: provider.provider,
					apiKey: "fixture",
					families: { "claude-sonnet-4-6": "claude" },
				}).options(report),
			onFatal: () => {},
		});
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
			const read = await recovered!.ledger.artifact(admin, { read: id });
			assert.ok("content" in read);
			return JSON.parse(read.content.toString()) as { mode: string; observed: { commit: string } };
		};
		if (barrier === "before-integration-cas") {
			assert.notEqual(before, R, "the host died before any canonical-ref change");
			const [old, fresh, ...more] = operation!.attempts;
			assert.equal(more.length, 0);
			assert.notEqual(old!.executorEpoch, epoch, "the first permit belonged to the dead executor");
			assert.equal(old!.outcome, "unapplied", "the old permit was reconciled from T, never adopted or dispatched");
			assert.equal((await observation(old!.observations[0]!)).mode, "reconcile");
			assert.equal(fresh!.executorEpoch, epoch, "a fresh current admission under the recovering epoch");
			assert.equal(fresh!.outcome, "applied");
			assert.equal((await observation(fresh!.observations[0]!)).mode, "dispatch");
		} else {
			assert.equal(before, R, "the CAS committed before the host died");
			assert.equal(operation!.attempts.length, 1, "no second admission or CAS");
			assert.equal(operation!.attempts[0]!.outcome, "applied");
			const seen = await observation(operation!.qualification!);
			assert.equal(seen.mode, "reconcile", "qualified from read-only reconciliation, never inferred");
			assert.equal(seen.observed.commit, R);
		}
		assert.deepEqual(
			roles.filter((role) => role !== "coordinator"),
			[],
			"recovery reruns no implementation, Audit or Watchdog role",
		);
	} finally {
		if (child.exitCode === null) child.kill("SIGKILL");
		await recovered?.close();
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

for (const barrier of ["before-integration-cas", "after-integration-cas"] as const)
	test(`CI20 SIGKILL ${barrier}: recovery reconciles the canonical ref and qualifies exactly once`, async () => {
		for (let iteration = 0; iteration < Number(process.env.RENDER_V3_REPETITIONS ?? 1); iteration++) await cut(barrier);
	});
