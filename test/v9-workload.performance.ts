// V9 full workload (B6, spec §13): a separate host process on an owned store at effective WAL/FULL/fullfsync, with 100
// active Slices and four executing attempts streaming Durable transcript and tool-result turns, while two enrolled HTTP
// clients issue ordinary commands and snapshots. Provider latency is excluded: it only paces the streams. Prints
// the measured values with source, settings and workload; the targets are p95 acknowledgement < 250 ms and snapshot < 1 s.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { enroll, http, percentile, ROOT, save, tempDir, track } from "./support/host.ts";

const SAVES_PER_CLIENT = Number(process.env.RENDER_V9_SAVES ?? 500);
const LANES = 4;
const SNAPSHOT_EVERY = 10;
type Status = { executing: string[]; active: number; turns: Record<string, number>; sequence: number };

test("V9 full workload: 100 active Slices, two clients, four streaming Durable attempts at FULL/fullfsync", {
	timeout: 600_000,
}, async () => {
	const dir = await tempDir("v9-full");
	const child = track(
		spawn(process.execPath, [new URL("./support/v9-host-worker.ts", import.meta.url).pathname, dir.path], {
			stdio: ["ignore", "pipe", "pipe"],
		}),
	);
	let ready: Record<string, unknown> | undefined;
	let status: Status | undefined;
	let stderr = "";
	let buffer = "";
	child.stdout!.on("data", (chunk) => {
		buffer += chunk;
		for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
			const event = JSON.parse(buffer.slice(0, i));
			buffer = buffer.slice(i + 1);
			if (event.event === "ready") ready = event;
			if (event.event === "status") status = event;
		}
	});
	child.stderr!.on("data", (chunk) => {
		stderr += chunk;
	});
	try {
		const until = async (check: () => boolean, label: string, ms = 120_000) => {
			const deadline = Date.now() + ms;
			while (!check()) {
				assert.equal(child.exitCode, null, `${label}: host exited: ${stderr}`);
				assert.ok(Date.now() < deadline, `${label}: ${JSON.stringify(status)} ${stderr}`);
				await delay(50);
			}
		};
		await until(() => !!ready, "host ready");
		assert.deepEqual(ready!.persistence, { journal_mode: "wal", synchronous: 2, fullfsync: 1, checkpoint_fullfsync: 1 });
		const host = { url: String(ready!.url), admin: String(ready!.admin), ready: { event: "ready", authorityEpoch: ready!.authorityEpoch } };
		const workflows = ready!.workflows as string[];
		const clients = [await enroll(host, "v9-a"), await enroll(host, "v9-b")];
		// The four streams are running and have committed turns before measurement starts.
		await until(
			() => (status?.executing.length ?? 0) === 4 && Object.values(status!.turns).filter((t) => t >= 3).length === 4,
			"four streams",
		);
		const start = { ...status! };
		const current = new Map<string, string | null>();
		const acks: number[] = [];
		const snapshots: number[] = [];
		const began = performance.now();
		await Promise.all(
			clients.map(async (client, c) => {
				let next = 0;
				await Promise.all(
					Array.from({ length: LANES }, async (_, lane) => {
						while (next < SAVES_PER_CLIENT) {
							const i = next++;
							const workflow = workflows[(i * 7 + c * 13 + lane) % workflows.length]!;
							const key = `${workflow}|c${c}l${lane}`;
							const bytes = Buffer.from(`client ${c} lane ${lane} save ${i}\n${"body text ".repeat(200)}`, "utf8");
							const t0 = performance.now();
							const r = await save(host, client.bearer, workflow, `c${c}-l${lane}`, bytes, current.get(key) ?? null);
							acks.push(performance.now() - t0);
							assert.equal(r.status, 200, r.text);
							current.set(key, String((r.body.result as Record<string, unknown>).revision));
							if (i % SNAPSHOT_EVERY === 0) {
								const s0 = performance.now();
								const s = await http(host.url, "GET", "/v1/snapshot?version=1", { bearer: client.bearer });
								snapshots.push(performance.now() - s0);
								assert.equal(s.status, 200, s.text);
								assert.equal((s.body.workflows as unknown[]).length, workflows.length);
							}
						}
					}),
				);
			}),
		);
		const seconds = (performance.now() - began) / 1000;
		await delay(600);
		const end = { ...status! };
		const streamed = Object.fromEntries(start.executing.map((id) => [id, (end.turns[id] ?? 0) - (start.turns[id] ?? 0)]));
		const result = {
			measure: "v9_full",
			source: {
				commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
				dirty: execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim() !== "",
				node: process.version,
				platform: `${process.platform}-${process.arch}`,
			},
			settings: ready!.persistence,
			workload: {
				activeSlices: end.active,
				workflows: workflows.length,
				clients: clients.length,
				lanesPerClient: LANES,
				executing: end.executing.length,
				streamTurnsDuringMeasurement: streamed,
				committedSequencesDuringMeasurement: end.sequence - start.sequence,
				acknowledgements: acks.length,
				snapshots: snapshots.length,
				seconds,
			},
			ackMs: { p50: percentile(acks, 50), p95: percentile(acks, 95), max: Math.max(...acks) },
			snapshotMs: { p50: percentile(snapshots, 50), p95: percentile(snapshots, 95), max: Math.max(...snapshots) },
			excluded: ["model latency (scripted provider)", "forge latency (no Forge in this build)"],
		};
		console.log(JSON.stringify(result));
		assert.ok(end.active >= 100, `100 active Slices, saw ${end.active}`);
		assert.equal(end.executing.length, 4, "four executing attempts throughout");
		assert.deepEqual(end.executing, start.executing, "the same four attempts streamed for the whole measurement");
		for (const [id, n] of Object.entries(streamed)) assert.ok(n >= 5, `stream ${id} committed only ${n} turns during measurement`);
		assert.ok(result.ackMs.p95 < 250, `ack p95 ${result.ackMs.p95}`);
		assert.ok(result.snapshotMs.p95 < 1_000, `snapshot p95 ${result.snapshotMs.p95}`);
	} finally {
		child.kill("SIGTERM");
		await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5000)]);
		if (child.exitCode === null) child.kill("SIGKILL");
		await dir.remove();
	}
});
