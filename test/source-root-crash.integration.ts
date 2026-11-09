import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Effects } from "../src/effects/source.ts";
import { sourceFixture } from "./support/source.ts";

for (const barrier of ["before-source-root", "after-source-root"] as const)
	test(`source-root-crash: SIGKILL ${barrier} never accepts different source`, async () => {
		const f = await sourceFixture();
		let handle: Effect.Success<ReturnType<typeof f.sandboxes.prepare>> | undefined;
		try {
			const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
			handle = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, base));
			await Effect.runPromise(
				f.sandboxes.execute(handle, {
					scope: f.scope,
					argv: ["sh", "-c", "printf 'retained exact\\r\\n' > result.txt"],
					timeoutMs: 10000,
				}),
			);
			const capture = await Effect.runPromise(f.sandboxes.seal(handle));
			const input = join(f.root, "capture.json");
			const output = join(f.root, "accepted.json");
			await writeFile(input, JSON.stringify({ base, capture }));
			const child = spawn(
				process.execPath,
				[new URL("./support/source-root-worker.ts", import.meta.url).pathname, join(f.root, "effects"), f.repo, input, output],
				{
					env: { ...process.env, RENDER_FAULT_BARRIER: barrier, RENDER_FAULT_COMMAND: "owned-source" },
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
			let stderr = "";
			child.stderr.on("data", (b) => {
				stderr += b;
			});
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error(`source root barrier timeout ${stderr}`)), 10000);
				child.stdout.on("data", (b) => {
					if (String(b).includes('"event":"barrier"')) {
						clearTimeout(timer);
						resolve();
					}
				});
				child.once("exit", (code) => {
					clearTimeout(timer);
					reject(new Error(`early exit ${code}: ${stderr}`));
				});
			});
			const died = new Promise<void>((resolve) => child.once("exit", () => resolve()));
			child.kill("SIGKILL");
			await died;
			await assert.rejects(access(output));
			const recovered = new Effects({ root: join(f.root, "effects") });
			const receipt = await Effect.runPromise(recovered.perform({ type: "retain", base, capture }));
			assert.equal(
				receipt.source.entries.find((e) => e.path === "result.txt")?.content,
				Buffer.from("retained exact\r\n").toString("base64"),
			);
			assert.equal((await Effect.runPromise(recovered.reconcile(receipt))).source.tree, receipt.source.tree);
			await assert.rejects(
				Effect.runPromise(recovered.reconcile({ ...receipt, source: { ...receipt.source, commit: "0".repeat(40) } })),
				/root|source|object|commit/i,
			);
		} finally {
			if (handle) await Effect.runPromise(f.sandboxes.stop(handle)).catch(() => {});
			await f.close();
		}
	});
