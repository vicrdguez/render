import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";

const cuts = [
	{
		name: "implementation handoff",
		worker: "test/support/implementation-lifecycle-crash-worker.ts",
		expected: (n: number) => ({
			beforeHandoffs: n,
			beforeTasks: n,
			hadReceipt: n === 1,
			duplicate: n === 1,
			finalHandoffs: 1,
			finalTasks: 1,
		}),
	},
	{
		name: "successor pass",
		worker: "test/support/implementation-successor-crash-worker.ts",
		expected: (n: number) => ({
			beforePasses: 1 + n,
			beforeTasks: n,
			hadReceipt: n === 1,
			duplicate: n === 1,
			finalPasses: 2,
			finalTasks: 1,
			finalObservations: 1,
		}),
	},
];
for (const cut of cuts)
	for (const barrier of ["before-commit", "after-commit"])
		for (let repetition = 0; repetition < Number(process.env.RENDER_V3_REPETITIONS ?? 1); repetition++)
			test(`${cut.name} SIGKILL ${barrier} (${repetition + 1})`, { timeout: 20000 }, async () => {
				const children: ReturnType<typeof spawn>[] = [];
				let data: string | undefined;
				const run = (mode: string, argument: string) => {
					const child = spawn(process.execPath, [cut.worker, mode, argument], {
						cwd: new URL("../", import.meta.url),
						stdio: ["ignore", "pipe", "pipe"],
					});
					children.push(child);
					return child;
				};
				try {
					const first = run("crash", barrier);
					let output = "";
					let errors = "";
					first.stdout.on("data", (chunk) => {
						output += String(chunk);
						for (const line of output.split("\n").slice(0, -1)) {
							const event = JSON.parse(line);
							if (event.event === "data") data = event.data;
						}
					});
					first.stderr.on("data", (chunk) => {
						errors += String(chunk);
					});
					for (let i = 0; i < 1000 && !output.includes('"event":"barrier"'); i++) {
						assert.equal(first.exitCode, null, errors);
						await setTimeout(10);
					}
					assert.match(output, /"event":"barrier"/);
					assert.ok(data);
					assert.equal(first.exitCode, null, errors);
					assert.equal(first.kill("SIGKILL"), true);
					await new Promise((resolve) => first.once("exit", resolve));
					assert.equal(first.signalCode, "SIGKILL");
					const recovered = run("recover", data);
					let result = "";
					recovered.stdout.on("data", (chunk) => {
						result += String(chunk);
					});
					recovered.stderr.on("data", (chunk) => {
						errors += String(chunk);
					});
					assert.equal(await new Promise((resolve) => recovered.once("exit", resolve)), 0, errors);
					assert.deepEqual(JSON.parse(result.trim().split("\n").at(-1)!), cut.expected(barrier === "after-commit" ? 1 : 0));
				} finally {
					for (const child of children)
						if (child.exitCode === null && child.signalCode === null) {
							child.kill("SIGKILL");
							await new Promise((resolve) => child.once("exit", resolve));
						}
					if (data) await rm(data, { recursive: true, force: true });
				}
			});
