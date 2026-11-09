// V3: process interruption at each provider. Unsafe replay must never start charged work again.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { webHttpFixture as fixture } from "./support/web-http.ts";

for (const provider of ["exa", "tavily"])
	test(`B2 V3 SIGKILL at ${provider} does not replay either charged observation`, { timeout: 20000 }, async () => {
		let reached = false;
		const http = await fixture(async (path) => {
			if (path.startsWith(`/${provider}`)) {
				reached = true;
				await new Promise(() => {});
			}
			return { status: 402, body: { error: "Credits are exhausted", tag: "NO_MORE_CREDITS" } };
		});
		const children: ReturnType<typeof spawn>[] = [];
		const start = (mode: string, data: string) => {
			const child = spawn(process.execPath, ["test/support/web-crash-worker.ts", mode, data, http.url], {
				cwd: new URL("../", import.meta.url),
				stdio: ["ignore", "pipe", "pipe"],
			});
			children.push(child);
			return child;
		};
		let data: string | undefined;
		try {
			const first = start("crash", "unused");
			let output = "";
			let errors = "";
			first.stdout.on("data", (s) => {
				output += String(s);
			});
			first.stderr.on("data", (s) => {
				errors += String(s);
			});
			for (let n = 0; n < 1000 && !reached; n++) {
				assert.equal(first.exitCode, null, errors);
				await setTimeout(10);
			}
			assert.ok(reached, errors);
			data = JSON.parse(output.trim()).data;
			assert.ok(data);
			first.kill("SIGKILL");
			await new Promise((r) => first.once("exit", r));
			const second = start("recover", data);
			second.stderr.on("data", (s) => {
				errors += String(s);
			});
			const code = await new Promise((r) => second.once("exit", r));
			assert.equal(code, 0, errors);
			assert.equal(http.calls.length, provider === "exa" ? 1 : 2, "unsafe replay must never start charged work");
		} finally {
			for (const child of children)
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGKILL");
					await new Promise((r) => child.once("exit", r));
				}
			await http.close();
			if (data) await rm(data, { recursive: true, force: true });
		}
	});
