// Owned real SQLite/runtime observations; only provider latency and responses are scripted.

import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import { admin, allowSameFamily, claudeFixture, packet, roleFixture, scheduler } from "./roles.ts";

const mode = process.argv[2];
let release!: () => void;
const gate = new Promise<void>((resolve) => {
	release = resolve;
});
let active = 0;
let maxActive = 0;
let releaseParent!: () => void;
const parentGate = new Promise<void>((resolve) => {
	releaseParent = resolve;
});
function provider(parentAlreadyRan = false) {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let parentCalls = parentAlreadyRan ? 1 : 0;
	p.setResponses(
		Array.from({ length: 100 }, () => async (transcript, options) => {
			active++;
			maxActive = Math.max(maxActive, active);
			try {
				const isParent = JSON.stringify(transcript).includes("Required output: Parent report");
				if (mode === "parent" && isParent && parentCalls++ === 0)
					return fauxAssistantMessage(fauxToolCall("request_role", { key: "child:0" }), { stopReason: "toolUse" });
				const wait = mode === "load-restart" && isParent && parentCalls++ === 0 ? parentGate : isParent ? Promise.resolve() : gate;
				await Promise.race([
					wait,
					new Promise<void>((resolve) => {
						if (options?.signal?.aborted) resolve();
						else options?.signal?.addEventListener("abort", () => resolve(), { once: true });
					}),
				]);
				return isParent && mode === "load-restart" && parentCalls === 1
					? fauxAssistantMessage("Role requests accepted; awaiting independent children.")
					: fauxAssistantMessage(
							fauxToolCall("submit_role_result", { supports: [], text: isParent ? "Parent complete.\n" : "Child complete.\n" }),
							{
								stopReason: "toolUse",
							},
						);
			} finally {
				active--;
			}
		}),
	);
	return p;
}
function engine(p: ReturnType<typeof provider>) {
	return new Engine({ provider: p.provider, ...claudeFixture });
}
let p = provider();
const f = await roleFixture(engine(p));
await allowSameFamily(f.ledger);
console.log(JSON.stringify({ event: "owned-data", data: f.data }));
const assignments = () => {
	const frame = f.ledger.snapshot(admin);
	assert.ok("assignments" in frame);
	return frame.assignments as RoleAssignment[];
};
async function until(check: () => boolean) {
	const deadline = Date.now() + 15000;
	while (!check()) {
		assert.ok(Date.now() < deadline, "waiting role observation did not settle");
		await setTimeout(10);
	}
}
async function idleAndResponsive() {
	await setTimeout(500); // let one-time admission/submission transitions settle
	const wal = (await readdir(f.data)).find((name) => name.endsWith("-wal"));
	assert.ok(wal, "real SQLite WAL must be present");
	const before = await stat(join(f.data, wal), { bigint: true });
	const began = performance.now();
	await setTimeout(500);
	const lag = performance.now() - began - 500;
	const after = await stat(join(f.data, wal), { bigint: true });
	assert.equal(after.mtimeNs, before.mtimeNs, "idle waiting assignments must not continuously write durable commits");
	assert.ok(lag < 1000, `waiting roles must yield the host event loop: ${lag} ms lag`);
	const observed: unknown[] = [];
	const observer = Effect.runSync(f.ledger.observe(admin, { send: (frame) => observed.push(frame), end: () => {} }));
	assert.ok("snapshot" in observer);
	try {
		const start = performance.now();
		assert.equal(
			(await f.command({ type: "postCoordinatorMessage", whenBusy: "followUp", text: "Human remains in control." }, admin)).status,
			"accepted",
		);
		const ackMs = performance.now() - start;
		assert.ok(ackMs < 1000, `human command remains responsive: ${ackMs} ms`);
		assert.equal(observed.length, 1, "human observer sees its acknowledged change while roles wait");
		assert.equal(assignments().filter((a) => a.executing).length, 4);
		assert.equal(active, 4);
		console.log(
			JSON.stringify({
				observation: mode,
				queued: assignments().filter((a) => a.status === "queued").length,
				idleWalWrites: 0,
				lag,
				ackMs,
				maxActive,
			}),
		);
	} finally {
		observer.stop();
	}
}
try {
	if (mode === "capacity") {
		for (let i = 0; i < 5; i++)
			assert.equal((await f.command({ type: "assignTask", slice: `slice:${i}`, delivery: true, packet: packet() })).status, "accepted");
		await until(() => p.state.callCount === 4);
		await idleAndResponsive();
		const a = assignments()[0]!;
		assert.equal(
			(
				await f.command(
					{ type: "recordBlocker", assignment: a.id, generation: a.generation, attempt: a.attempt, reason: "human decision" },
					scheduler,
				)
			).status,
			"accepted",
		);
		await setTimeout(150);
		assert.equal(p.state.callCount, 4, "blocked live owner still occupies its slot");
		assert.equal(
			(await f.command({ type: "cancelWork", assignment: a.id, generation: a.generation, attempt: a.attempt }, admin)).status,
			"accepted",
		);
		await until(() => p.state.callCount === 5);
		assert.equal(assignments()[0]!.status, "canceled");
		assert.ok(maxActive <= 4, "cancellation releases capacity only after provider quiescence");
	} else {
		const childCount = mode === "parent" ? 1 : 32;
		const accepted = await f.command({
			type: "assignTask",
			slice: "slice:parent",
			delivery: true,
			packet: packet({
				expectedOutput: "Parent report",
				maxInputBytes: 262144,
				requests: Array.from({ length: childCount }, (_, i) => ({ key: `child:${i}`, packet: packet({ role: "challenger" }) })),
			}),
		});
		assert.equal(accepted.status, "accepted");
		if (mode === "load-restart") {
			await until(() => p.state.callCount === 1);
			const a = assignments()[0]!;
			const own = mintContext({
				kind: "assignment-agent",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				role: a.packet.role,
			});
			for (let i = 0; i < childCount; i++)
				assert.equal((await f.command({ type: "requestRole", key: `child:${i}` }, own)).status, "accepted");
			releaseParent();
		}
		await until(() => assignments()[0]?.blocker === "awaiting_role_results" && !assignments()[0]?.executing);
		if (mode === "parent") {
			// Isolate the parent waiting path with three additional executing roles.
			for (let i = 0; i < 3; i++)
				assert.equal(
					(await f.command({ type: "assignTask", slice: `slice:peer:${i}`, delivery: true, packet: packet() })).status,
					"accepted",
				);
		}
		await until(() => active === 4);
		await idleAndResponsive();
		if (mode === "load-restart") {
			p = provider(true);
			await f.reopen(engine(p));
			await until(() => active === 4);
			assert.equal(assignments().length, 33, "workflow-owned parent and all 32 accepted children survive reopen");
			await idleAndResponsive();
		}
		release();
		await until(() => assignments()[0]?.status === "submitted" && assignments().every((a) => !a.executing));
		const parent = assignments()[0]!;
		const report = await Effect.runPromise(f.ledger.artifact(admin, { read: parent.report! }));
		assert.ok("content" in report);
		assert.equal(report.content.toString(), "Parent complete.\n", "committed child reports wake the retained parent");
		assert.equal(assignments().filter((a) => a.parent === parent.id && a.status === "submitted").length, childCount);
		assert.ok(maxActive <= 4);
	}
} finally {
	release();
	releaseParent();
	await f.close();
}
