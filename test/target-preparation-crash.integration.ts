// TP14 at a real process cut: the host dies while Linux checks of prepared X are running.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import * as Effect from "effect/Effect";
import { Engine, type OwnedChecks } from "../src/engine/runtime.ts";
import type { ImplementationPass, RoleAssignment } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { admin } from "./support/roles.ts";

const running = (id: string) => {
	try {
		return execFileSync("docker", ["inspect", "--format", "{{.State.Running}}", id], { encoding: "utf8" }).trim() === "true";
	} catch {
		return false; // removed
	}
};

test("TP14 SIGKILL while prepared X checks run: recovery stops the old runtime and records the attempt once", async () => {
	const child = spawn(process.execPath, [new URL("./support/target-preparation-crash-worker.ts", import.meta.url).pathname], {
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
		const deadline = Date.now() + 120000;
		while (!output.includes('"event":"barrier"')) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(Date.now() < deadline, `prepared-check barrier missing: ${output} ${stderr}`);
			await delay(20);
		}
		setup = JSON.parse(output.split("\n").find((line) => line.includes('"event":"data"'))!);
		const sandboxes = join(setup!.config.root, "sandboxes");
		const journals: { epoch: string; runtime: string }[] = [];
		for (const id of await readdir(sandboxes)) {
			const state = JSON.parse(await readFile(join(sandboxes, id, "state.json"), "utf8"));
			runtimes.push(state.handle.runtime);
			if (String(state.handle.scope.attempt).includes(":preparation:"))
				journals.push({ epoch: state.handle.scope.executorEpoch, runtime: state.handle.runtime });
		}
		assert.equal(journals.length, 1, "one prepared-X check workspace exists at the cut");
		const old = journals[0]!;
		assert.ok(running(old.runtime), "its runtime is running when the host dies");
		const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
		child.kill("SIGKILL");
		await died;
		recovered = await Effect.runPromise(
			openLedger({
				data: setup!.data,
				runtime: (report) => new Engine({ ownedChecks: setup!.config }).options(report),
				onFatal: () => {},
			}),
		);
		const passes = () => (recovered!.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		const until = Date.now() + 120000;
		while (!/^awaiting_watchdog/.test(passes()[0]?.handoff?.blocker ?? "")) {
			assert.ok(Date.now() < until, `recovered preparation: ${JSON.stringify(passes()[0]?.handoff)}`);
			await delay(50);
		}
		assert.equal(running(old.runtime), false, "the interrupted check runtime was stopped, not abandoned");
		for (const id of await readdir(sandboxes))
			runtimes.push(JSON.parse(await readFile(join(sandboxes, id, "state.json"), "utf8")).handle.runtime);
		const [p1, ...others] = passes();
		assert.equal(others.length, 0, "no successor pass");
		assert.equal(p1!.handoff!.preparations?.length, 1, "the interrupted attempt is recorded once");
		const read = await Effect.runPromise(recovered.ledger.artifact(admin, { read: p1!.handoff!.preparations![0]! }));
		assert.ok("content" in read);
		const record = JSON.parse(read.content.toString()) as {
			attempt: number;
			outcome: string;
			checks: { scope: { executorEpoch: string } };
		};
		assert.equal(record.attempt, 1);
		assert.equal(record.outcome, "checked");
		assert.notEqual(record.checks.scope.executorEpoch, old.epoch, "results come from the recovering executor's own runtime");
		const assignments = (recovered.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
		assert.equal(assignments.filter((a) => a.packet.role === "watchdog").length, 0);
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
