// C3: a host killed after Ledger accepted a message, before or just after Engine submitted it, delivers it exactly
// once after restart. Failure cases: the message is lost, or a resubmission places it twice.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";

for (const barrier of ["before-message-submission", "after-message-submission"])
	test(`C3 chat delivery SIGKILL ${barrier}`, { timeout: 40_000 }, async () => {
		const data = await mkdtemp(join(tmpdir(), "render-chat-crash-"));
		const children: ReturnType<typeof spawn>[] = [];
		const run = (mode: string) => {
			const child = spawn(process.execPath, ["test/support/chat-crash-worker.ts", data, mode, "c3-message"], {
				cwd: new URL("../", import.meta.url),
				env: { ...process.env, RENDER_CHAT_BARRIER: barrier },
				stdio: ["ignore", "pipe", "pipe"],
			});
			children.push(child);
			return child;
		};
		try {
			const first = run("crash");
			let output = "";
			let errors = "";
			first.stdout.on("data", (chunk) => {
				output += String(chunk);
			});
			first.stderr.on("data", (chunk) => {
				errors += String(chunk);
			});
			for (let i = 0; i < 2000 && !output.includes('"event":"barrier"'); i++) {
				assert.equal(first.exitCode, null, errors);
				await setTimeout(10);
			}
			assert.match(output, /"event":"barrier"/, errors);
			first.kill("SIGKILL");
			await new Promise((resolve) => first.once("exit", resolve));
			const next = run("recover");
			let recovered = "";
			next.stdout.on("data", (chunk) => {
				recovered += String(chunk);
			});
			next.stderr.on("data", (chunk) => {
				errors += String(chunk);
			});
			assert.equal(await new Promise((resolve) => next.once("exit", resolve)), 0, errors);
			const value = JSON.parse(recovered.trim().split("\n").at(-1)!);
			assert.deepEqual(value, { placed: 1, submissions: 0 });
		} finally {
			for (const child of children)
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGKILL");
					await new Promise((resolve) => child.once("exit", resolve));
				}
			await rm(data, { recursive: true, force: true });
		}
	});
