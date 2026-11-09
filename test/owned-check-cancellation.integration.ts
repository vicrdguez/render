import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { sourceFixture } from "./support/source.ts";

test("cancellation fences authority but retains the already admitted source effect as quarantine", async () => {
	const f = await sourceFixture();
	const config = {
		root: join(f.root, "owned"),
		repositories: { owned: f.repo },
		checks: {
			"revision:3": {
				repository: "owned",
				commit: f.commit,
				profile: f.profile,
				argv: ["sh", "-c", "printf 'admitted effect' > result"],
				timeoutMs: 10000,
				verifierRevision: f.commit,
			},
		},
	};
	const child = spawn(process.execPath, [new URL("./support/owned-check-worker.ts", import.meta.url).pathname, JSON.stringify(config)], {
		env: { ...process.env, RENDER_FAULT_BARRIER: "after-source-root", RENDER_FAULT_COMMAND: "owned-source" },
		stdio: ["ignore", "pipe", "pipe", "ipc"],
	});
	let output = "";
	let stderr = "";
	child.stdout!.on("data", (b) => {
		output += b;
	});
	child.stderr!.on("data", (b) => {
		stderr += b;
	});
	async function until(predicate: () => boolean) {
		const deadline = Date.now() + 20000;
		while (!predicate()) {
			assert.equal(child.signalCode, null, stderr);
			assert.ok(Date.now() < deadline, output + stderr);
			await setTimeout(10);
		}
	}
	try {
		await until(() => output.includes('"event":"barrier"'));
		child.send("cancel");
		await until(() => output.includes('"event":"canceled"'));
		const canceled = JSON.parse(output.split("\n").find((line) => line.includes('"event":"canceled"'))!);
		assert.equal(canceled.result.status, "accepted");
		child.send("snapshot");
		await until(() => output.includes('"event":"snapshot"'));
		const before = JSON.parse(output.split("\n").find((line) => line.includes('"event":"snapshot"'))!);
		assert.equal(before.snapshot.assignments[0].generation, 2);
		assert.equal(before.snapshot.assignments[0].executing, true, "admitted source work prevents early capacity release");
		assert.equal(before.snapshot.assignments[0].status, "canceling");
		child.kill("SIGUSR2"); // controlled barrier release, never a product cancellation mechanism
		let after = before;
		const deadline = Date.now() + 20000;
		while (after.snapshot.assignments[0].executing) {
			const count = output.split('"event":"snapshot"').length;
			child.send("snapshot");
			await until(() => output.split('"event":"snapshot"').length > count);
			after = JSON.parse(
				output
					.trim()
					.split("\n")
					.filter((line) => line.includes('"event":"snapshot"'))
					.at(-1)!,
			);
			assert.ok(Date.now() < deadline, output + stderr);
			await setTimeout(10);
		}
		assert.equal(after.snapshot.assignments[0].status, "canceled");
		assert.equal(after.snapshot.assignments[0].report, null, "fenced generation never inherits an accepted pass");
		const documents = Object.values(after.history.content as Record<string, string>).flatMap((bytes) => {
			try {
				return [JSON.parse(Buffer.from(bytes, "base64").toString())];
			} catch {
				return [];
			}
		});
		const quarantine = documents.find((d) => d.type === "recordRecoveryState");
		assert.ok(quarantine, "already admitted exact source evidence must not be erased by cancellation");
		const receipt = JSON.parse(quarantine.text);
		assert.equal(receipt.scope.generation, 1);
		assert.equal(receipt.source.base.commit, f.commit);
		assert.equal(receipt.source.freeze.running, false);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
			child.kill("SIGKILL");
			await died;
		}
		const line = output.split("\n").find((line) => line.includes('"event":"data"'));
		if (line) await rm(JSON.parse(line).data, { recursive: true, force: true });
		await f.close();
	}
});
