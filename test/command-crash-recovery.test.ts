// V3: subprocess faults at the commit and reply barriers, and real disk exhaustion.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, test } from "node:test";
import { promisify } from "node:util";
import { createWorkflow, enroll, http, save, spawnHost, startHost, tempDir } from "./support/host.ts";
import { A1, G1 } from "./support/literals.ts";

const REPETITIONS = Number(process.env.RENDER_V3_REPETITIONS ?? 1);
const run = promisify(execFile);

async function revisionCount(url: string, bearer: string, workflow: string, document: string): Promise<number> {
	const snap = await http(url, "GET", "/v1/snapshot?version=1", { bearer });
	const wf = (snap.body.workflows as Record<string, unknown>[]).find((w) => w.workflow === workflow);
	const doc = ((wf?.documents ?? []) as Record<string, unknown>[]).find((d) => d.document === document);
	return Number(doc?.revisionCount ?? 0);
}

for (const barrier of ["before-commit", "after-commit"] as const) {
	describe(`V3 SIGKILL at ${barrier} (${REPETITIONS} repetitions)`, () => {
		test(`retrying the original envelope after a kill at ${barrier} yields exactly one accepted save`, async () => {
			for (let i = 0; i < REPETITIONS; i++) {
				const dir = await tempDir(`v3-${barrier}`);
				try {
					const host = await startHost(dir.path);
					const dev = await enroll(host, "crash");
					const w = await createWorkflow(host, dev.bearer, "crash");
					const first = await save(host, dev.bearer, w, "ground", G1.bytes, null);
					const r0 = String((first.body.result as Record<string, unknown>).revision);
					const seqBefore = Number(first.body.sequence);
					await host.stop();

					const commandId = `crash-${barrier}-${i}`;
					const faulted = spawnHost(dir.path, { RENDER_FAULT_BARRIER: barrier, RENDER_FAULT_COMMAND: commandId });
					const ready = await faulted.next("ready");
					const pending = save({ url: String(ready.url), ready }, dev.bearer, w, "ground", A1.bytes, r0, commandId).catch(
						(error: unknown) => ({ status: 0, body: {}, text: String(error) }),
					);
					const reached = await faulted.next("barrier");
					assert.equal(reached.name, barrier);
					faulted.proc.kill("SIGKILL");
					await faulted.exited;
					const lost = await pending;
					assert.notEqual(lost.status, 200, "no reply may be delivered from a killed host");

					const restarted = await startHost(dir.path);
					try {
						const retry = await save(restarted, dev.bearer, w, "ground", A1.bytes, r0, commandId);
						assert.equal(retry.status, 200, retry.text);
						assert.equal(retry.body.duplicate, barrier === "after-commit");
						assert.equal(Number(retry.body.sequence), seqBefore + 1);
						assert.equal(await revisionCount(restarted.url, dev.bearer, w, "ground"), 2);
						const again = await save(restarted, dev.bearer, w, "ground", A1.bytes, r0, commandId);
						assert.equal(again.body.duplicate, true);
						assert.equal(await revisionCount(restarted.url, dev.bearer, w, "ground"), 2);
					} finally {
						await restarted.stop();
					}
				} finally {
					await dir.remove();
				}
			}
		});
	});
}

async function hdiutilAvailable(): Promise<boolean> {
	try {
		await run("hdiutil", ["help"]);
		return true;
	} catch {
		return false;
	}
}

describe("B2-09 real disk exhaustion", () => {
	test("a save that cannot be stored is never acknowledged and earlier bytes survive", async (t) => {
		if (process.platform !== "darwin" || !(await hdiutilAvailable())) {
			t.skip("hdiutil unavailable: real disk-full case not run");
			return;
		}
		const dir = await tempDir("v3-full");
		const image = join(dir.path, "volume.dmg");
		const mount = join(dir.path, "render-full-mnt");
		await mkdir(mount);
		await run("hdiutil", ["create", "-size", "8m", "-fs", "HFS+", "-volname", "renderfull", "-layout", "NONE", image]);
		await run("hdiutil", ["attach", "-nobrowse", "-noautoopen", "-mountpoint", mount, image]);
		const data = join(mount, "data");
		try {
			const host = await startHost(data);
			const dev = await enroll(host, "full");
			const w = await createWorkflow(host, dev.bearer, "full");
			const first = await save(host, dev.bearer, w, "ground", G1.bytes, null);
			assert.equal(first.status, 200);
			const r0 = String((first.body.result as Record<string, unknown>).revision);
			const filler = join(mount, "filler");
			const { stdout } = await run("df", ["-k", mount]);
			const availableKiB = Number(stdout.trim().split("\n").at(-1)?.split(/\s+/)[3]);
			await writeFile(filler, Buffer.alloc(Math.max(0, availableKiB - 256) * 1024));
			const big = Buffer.from(`${"large unsaved body ".repeat(60_000)}\n`, "utf8");
			const commandId = "full-1";
			const attempt = await save(host, dev.bearer, w, "ground", big, r0, commandId).catch((error: unknown) => ({
				status: 0,
				body: {} as Record<string, unknown>,
				text: String(error),
			}));
			assert.notEqual(attempt.status, 200, `disk-full save was acknowledged: ${attempt.text}`);
			if (attempt.status !== 0) assert.equal(attempt.body.code, "outcome_unknown");
			const code = await Promise.race([host.exited, new Promise<string>((r) => setTimeout(() => r("still running"), 10_000))]);
			assert.notEqual(code, "still running", "host must stop after a storage failure");
			await unlink(filler);
			const restarted = await startHost(data);
			try {
				const art = await http(restarted.url, "GET", `/v1/artifacts/${encodeURIComponent(r0)}`, { bearer: dev.bearer });
				assert.ok(Buffer.from(String(art.body.content), "base64").equals(G1.bytes));
				const snap = await http(restarted.url, "GET", "/v1/snapshot?version=1", { bearer: dev.bearer });
				const wf = (snap.body.workflows as Record<string, unknown>[]).find((x) => x.workflow === w);
				const doc = ((wf?.documents ?? []) as Record<string, unknown>[]).find((d) => d.document === "ground");
				assert.equal(doc?.revision, r0, "current pointer must not move to unacknowledged bytes");
				const retry = await save(restarted, dev.bearer, w, "ground", big, r0, commandId);
				// The outcome was unknown to the client: the retry is accepted or duplicate, and exactly one revision results.
				assert.equal(retry.status, 200, retry.text);
				assert.equal(await revisionCount(restarted.url, dev.bearer, w, "ground"), 2);
			} finally {
				await restarted.stop();
			}
		} finally {
			await run("hdiutil", ["detach", "-force", mount]).catch(() => undefined);
			await dir.remove();
		}
	});
});
