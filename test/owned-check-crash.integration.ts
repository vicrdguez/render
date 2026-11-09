// Real host/runtime/source barriers; expected outcomes precede product additions.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { admin } from "./support/roles.ts";
import { sourceFixture } from "./support/source.ts";

for (const barrier of ["after-sandbox-stop", "before-source-root", "after-source-root", "before-commit", "after-commit"])
	test(`owned-source crash ${barrier}: durable diagnostics, exact receipt or explicit blocked recovery`, async () => {
		const source = await sourceFixture();
		const config = {
			root: join(source.root, "owned"),
			repositories: { owned: source.repo },
			checks: {
				"revision:3": {
					repository: "owned",
					commit: source.commit,
					profile: source.profile,
					argv: ["sh", "-c", "printf 'before root\\r\\n'; printf 'literal result\\r\\n' > result"],
					timeoutMs: 10000,
					verifierRevision: source.commit,
				},
			},
		};
		const child = spawn(process.execPath, [new URL("./support/owned-check-worker.ts", import.meta.url).pathname, JSON.stringify(config)], {
			env: {
				...process.env,
				RENDER_FAULT_BARRIER: barrier,
				RENDER_FAULT_COMMAND: barrier.endsWith("commit") ? "owned-check:assignment:4:1" : "owned-source",
			},
			stdio: ["ignore", "pipe", "pipe", "ipc"],
		});
		let data: string | undefined;
		let output = "";
		let stderr = "";
		child.stdout!.on("data", (b) => {
			output += b;
		});
		child.stderr!.on("data", (b) => {
			stderr += b;
		});
		try {
			const deadline = Date.now() + 20000;
			while (!output.includes('"event":"barrier"')) {
				assert.equal(child.exitCode, null, stderr);
				assert.ok(Date.now() < deadline, `owned barrier missing: ${output} ${stderr}`);
				await delay(10);
			}
			data = JSON.parse(output.split("\n").find((line) => line.includes('"event":"data"'))!).data;
			const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
			child.kill("SIGKILL");
			await died;
			const recovered = await Effect.runPromise(
				openLedger({
					data: data!,
					runtime: (report) => new Engine({ ownedChecks: config }).options(report),
					onFatal: () => {},
				}),
			);
			try {
				const snapshot = recovered.ledger.snapshot(admin);
				assert.ok("assignments" in snapshot);
				const assignment = (snapshot.assignments as RoleAssignment[])[0]!;
				assert.equal(assignment.executing, false, "confirmed whole-container stop releases capacity, never a timeout alone");
				assert.equal(assignment.status, barrier === "after-commit" ? "submitted" : "blocked");
				const history = await Effect.runPromise(recovered.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
				assert.ok("manifest" in history);
				assert.equal(history.manifest.complete, true);
				const documents = Object.values(history.content).flatMap((bytes) => {
					try {
						return [JSON.parse(Buffer.from(bytes, "base64").toString())];
					} catch {
						return [];
					}
				});
				assert.ok(
					documents.some((d) => d.kind === "owned-check-diagnostic" && d.execution?.stdout === "before root\r\n"),
					"exact pre-root diagnostics survive process death",
				);
				if (barrier === "after-commit") {
					const receipt = documents.find((d) => d.kind === "owned-check");
					assert.ok(receipt);
					assert.equal(receipt.source.base.commit, source.commit);
					assert.equal(receipt.verification.status, "source_changed");
					assert.equal(receipt.source.freeze.running, false);
				} else assert.equal(assignment.report, null, "no accepted source claim before durable SQL reference");
			} finally {
				await Effect.runPromise(recovered.close());
			}
		} finally {
			if (child.exitCode === null && child.signalCode === null) {
				const exit = new Promise<void>((resolve) => child.once("exit", () => resolve()));
				child.kill("SIGKILL");
				await exit;
			}
			if (!data) {
				const line = output.split("\n").find((line) => line.includes('"event":"data"'));
				if (line) data = JSON.parse(line).data;
			}
			if (data) await rm(data, { recursive: true, force: true });
			await source.close();
		}
	});
