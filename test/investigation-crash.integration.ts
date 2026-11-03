import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { sourceFiles } from "./support/investigation.ts";
import { gitSourceFixture } from "./support/source.ts";

for (const barrier of ["before-commit", "after-commit"])
	for (let repetition = 0; repetition < Number(process.env.RENDER_V3_REPETITIONS ?? 1); repetition++)
		test(`G12 investigation result SIGKILL ${barrier} (${repetition + 1})`, { timeout: 20000 }, async () => {
			const source = await gitSourceFixture(sourceFiles);
			const children: ReturnType<typeof spawn>[] = [];
			const run = (mode: string) => {
				const child = spawn(
					process.execPath,
					["test/support/investigation-crash-worker.ts", join(source.root, "data"), mode, source.repo, source.commit],
					{
						cwd: new URL("../", import.meta.url),
						env: { ...process.env, RENDER_INVESTIGATION_BARRIER: barrier },
						stdio: ["ignore", "pipe", "pipe"],
					},
				);
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
				for (let i = 0; i < 1000 && !output.includes('"event":"barrier"'); i++) {
					assert.equal(first.exitCode, null, errors);
					await setTimeout(10);
				}
				assert.match(output, /"event":"barrier"/);
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
				assert.equal(value.assignments, 1);
				assert.equal(value.exact, true);
				assert.equal(value.duplicate, barrier === "after-commit");
			} finally {
				for (const child of children)
					if (child.exitCode === null && child.signalCode === null) {
						child.kill("SIGKILL");
						await new Promise((resolve) => child.once("exit", resolve));
					}
				await source.close();
			}
		});
