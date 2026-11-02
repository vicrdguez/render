// V9 (slice-1 measurement): command acknowledgement and snapshot latency on WAL/FULL/fullfsync.
// This is an early local measurement, not the full V9 workload (no executing attempts or runtime streams).
import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflow, enroll, http, percentile, save, startHost, tempDir } from "./support/host.ts";

const WORKFLOWS = 100;
const SAVES_PER_CLIENT = Number(process.env.RENDER_V9_SAVES ?? 200);
const CONCURRENCY = 4;

test(`V9: two clients, ${WORKFLOWS} workflows, p95 acknowledgement < 250 ms and snapshot < 1 s`, async () => {
	const dir = await tempDir("v9");
	const host = await startHost(dir.path);
	try {
		assert.deepEqual(host.ready.persistence, { journal_mode: "wal", synchronous: 2, fullfsync: 1, checkpoint_fullfsync: 1 });
		const clients = [await enroll(host, "load-a"), await enroll(host, "load-b")];
		const workflows: string[] = [];
		for (let i = 0; i < WORKFLOWS; i++) workflows.push(await createWorkflow(host, (clients[0] as { bearer: string }).bearer, `load ${i}`));
		const current = new Map<string, string | null>();
		const latencies: number[] = [];
		await Promise.all(
			clients.map(async (client, c) => {
				let next = 0;
				await Promise.all(
					Array.from({ length: CONCURRENCY }, async (_, lane) => {
						while (next < SAVES_PER_CLIENT) {
							const i = next++;
							// Each client/lane pair writes its own documents so expected bases stay current.
							const workflow = workflows[(i * 7 + c * 13) % WORKFLOWS] as string;
							const key = `${workflow}|c${c}l${lane}`;
							const bytes = Buffer.from(`client ${c} lane ${lane} save ${i}\n${"body text ".repeat(200)}`, "utf8");
							const t0 = performance.now();
							const r = await save(host, client.bearer, workflow, `c${c}-l${lane}`, bytes, current.get(key) ?? null);
							latencies.push(performance.now() - t0);
							assert.equal(r.status, 200, r.text);
							current.set(key, String((r.body.result as Record<string, unknown>).revision));
						}
					}),
				);
			}),
		);
		const snapshots: number[] = [];
		for (let i = 0; i < 20; i++) {
			const t0 = performance.now();
			const s = await http(host.url, "GET", "/v1/snapshot?version=1", { bearer: (clients[i % 2] as { bearer: string }).bearer });
			snapshots.push(performance.now() - t0);
			assert.equal((s.body.workflows as unknown[]).length, WORKFLOWS);
		}
		const ack = { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: Math.max(...latencies) };
		const snap = { p50: percentile(snapshots, 50), p95: percentile(snapshots, 95) };
		console.log(JSON.stringify({ measure: "v9_slice1", saves: latencies.length, ackMs: ack, snapshotMs: snap }));
		assert.ok(ack.p95 < 250, `ack p95 ${ack.p95}`);
		assert.ok(snap.p95 < 1_000, `snapshot p95 ${snap.p95}`);
	} finally {
		await host.stop();
		await dir.remove();
	}
});
