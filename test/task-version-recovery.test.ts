import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineExtension, defineTask, type Harness } from "@earendil-works/pi-durable";
import { type OpenedLedger, openLedger, StartupFailure } from "../src/ledger/startup.ts";

function definition(version: number, throwing = false) {
	return defineTask<{ authority: string }, { phase: "hold"; basis: string }, null>({
		name: "owned.versioned-work",
		version,
		initial: () => ({ phase: "hold", basis: "EXACT-ACCEPTED-BASIS" }),
		...(throwing
			? {
					migrate: () => {
						throw new Error("Owned migration failure; no state repaired");
					},
				}
			: {}),
		phases: { hold: (task, runtime, context) => runtime.sleepUntil(Date.now() + 60000, task.state.checkpoint, context) },
		abort: (_task, runtime, context) =>
			runtime.commit(() => ({ status: "terminal", outcome: { status: "orphaned", reason: "Prior effects unresolved" } }), context),
	});
}

for (const failure of ["missing", "older", "missing-migration", "throwing-migration"] as const) {
	test(`task-version-recovery: ${failure} preserves exact work and reopens with the compatible definition`, async () => {
		const data = await mkdtemp(join(tmpdir(), "render-version-"));
		let opened: OpenedLedger | undefined;
		let harness!: Harness;
		const original = definition(failure === "older" ? 2 : 1);
		const runtime = (task: ReturnType<typeof definition> | null) => () => {
			const registry = createRegistry();
			if (task) registry.install(defineExtension({ name: "owned.version", tasks: [task] }));
			return {
				models: createModels(),
				registry,
				bindLedger: (_ledger: unknown, h: Harness) => {
					harness = h;
				},
			};
		};
		try {
			opened = await openLedger({ data, runtime: runtime(original), onFatal: () => {} });
			const c = await harness.createConversation({ ownership: { kind: "ownerless" } }, ctx);
			const id = await c.commit(
				(tx) => tx.createTask(original, { authority: "ORIGINAL-AUTHORITY" }, { ownership: { kind: "conversation" } }),
				ctx,
			);
			const before = await harness.getTask(id, ctx);
			assert.ok(before);
			await opened.close();
			opened = undefined;
			const next = failure === "missing" ? null : definition(failure === "older" ? 1 : 2, failure === "throwing-migration");
			if (failure === "throwing-migration") {
				opened = await openLedger({ data, runtime: runtime(next), onFatal: () => {} });
				let inspection = await harness.inspect(ctx);
				for (let n = 0; n < 100 && !inspection.tasks.some((t) => t.state.kind === "blocked"); n++) {
					await setTimeout(10);
					inspection = await harness.inspect(ctx);
				}
				assert.ok(inspection.tasks.some((t) => t.state.kind === "blocked" && t.state.reason === "migration_failed"));
				assert.equal((await harness.getTask(id, ctx))?.version, before.version);
				await opened.close();
				opened = undefined;
			} else {
				await assert.rejects(
					openLedger({ data, runtime: runtime(next), onFatal: () => {} }),
					(e) => e instanceof StartupFailure && e.code === "unsupported_definitions",
				);
			}
			opened = await openLedger({ data, runtime: runtime(original), onFatal: () => {} });
			const retained = await harness.getTask(id, ctx);
			assert.ok(retained);
			assert.deepEqual(retained.input, { authority: "ORIGINAL-AUTHORITY" });
			assert.ok("checkpoint" in retained.state);
			assert.deepEqual(retained.state.checkpoint, { phase: "hold", basis: "EXACT-ACCEPTED-BASIS" });
			assert.equal(retained.conversationId, before.conversationId);
			assert.deepEqual(retained.owner, before.owner);
		} finally {
			await opened?.close();
			await rm(data, { recursive: true, force: true });
		}
	});
}
