import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { openHost } from "../src/host/host.ts";
import { adminRequest, createWorkflow, enroll, envelope, HOST_MAIN, http, save, startHost, tempDir } from "./support/host.ts";

class Clock {
	time = Date.now();
	jobs = new Map<object, { at: number; run: () => void }>();
	now = () => this.time;
	setTimeout = (run: () => void, ms: number) => {
		const key = {};
		this.jobs.set(key, { at: this.time + ms, run });
		return key;
	};
	clearTimeout = (key: object) => { this.jobs.delete(key); };
	advance(ms: number) {
		this.time += ms;
		for (const [key, job] of this.jobs) if (job.at <= this.time) {
			this.jobs.delete(key);
			job.run();
		}
	}
}

type Backup = {
	health: string; phase: string; verifiedOffHostCutoffSequence: number | null;
	generation: string | null; verifiedOffHostAt: number | null; exposedWorkSeconds: number | null;
	unprotectedAcknowledgedWork: boolean; lastWindowSeconds: number | null; targetOverrun: boolean;
};

async function fixture() {
	const dir = await tempDir("offhost");
	const data = join(dir.path, "live");
	const destination = join(dir.path, "remote");
	const bin = join(dir.path, "bin");
	await mkdir(bin);
	await mkdir(destination);
	const mode = join(dir.path, "mode");
	await writeFile(mode, "ok");
	// Only the external SSH boundary is substituted. The real production receiver validates and syncs real bytes.
	await writeFile(join(bin, "ssh"), `#!${process.execPath}\nimport {spawn} from 'node:child_process';\nimport {readFileSync} from 'node:fs';\nconst mode=readFileSync(${JSON.stringify(mode)},'utf8');\nconst chunks=[]; for await(const c of process.stdin) chunks.push(c);\nlet bytes=Buffer.concat(chunks);\nif(mode==='fail') process.exit(1);\nif(mode==='corrupt'){const p=JSON.parse(bytes);p.database=Buffer.from('corrupt').toString('base64');bytes=Buffer.from(JSON.stringify(p));}\nconst child=spawn('/bin/sh',['-c',process.argv.at(-1)],{env:{...process.env,...(mode==='before'||mode==='after'?{RENDER_FAULT_BARRIER:'offhost-'+mode+'-publish',RENDER_FAULT_COMMAND:'offhost'}:{})},stdio:['pipe','pipe','inherit']});\nchild.stdin.on('error',()=>{}); child.stdin.end(bytes);\nlet output='';child.stdout.on('data',c=>{output+=c;if(output.includes('"event":"barrier"')) child.kill('SIGKILL');});\nchild.on('exit',code=>{if(code!==0)process.exit(1);process.stdout.write(mode==='copy-only'?'{}':output);});\n`);
	await chmod(join(bin, "ssh"), 0o700);
	const path = process.env.PATH;
	process.env.PATH = `${bin}:${path}`;
	const clock = new Clock();
	const backup = { sshHost: "owned-fixture", receiver: HOST_MAIN, directory: destination };
	let h = await openHost({ data, backup, backupClock: clock });
	const compatible = () => ({ ...h, ready: { event: "ready", authorityEpoch: h.authorityEpoch } });
	const device = await enroll(compatible(), "owned");
	const workflow = await createWorkflow(compatible(), device.bearer, "retained");
	assert.equal(workflow, "workflow:3");
	const first = await save(compatible(), device.bearer, workflow, "ground", Buffer.from("protected\n"), null, "first");
	assert.equal(first.body.sequence, 4);
	const status = async () => (await http(h.url, "GET", "/v1/snapshot", { bearer: device.bearer })).body.backup as Backup;
	const wait = async (predicate: (b: Backup) => boolean) => {
		const end = performance.now() + 10000;
		while (performance.now() < end) { const b = await status(); if (predicate(b)) return b; await delay(10); }
		assert.fail(`backup did not settle: ${JSON.stringify(await status())}`);
	};
	return { dir, data, destination, mode, clock, device, workflow, status, wait, compatible,
		get h() { return h; },
		restart: async () => { await h.close(); h = await openHost({ data, backup, backupClock: clock }); },
		close: async () => { await h.close(); process.env.PATH = path; await dir.remove(); },
	};
}

test("offhost-exposure-cutoff: configured/local-copy/copy-only cannot protect; outage preserves cutoff and local work", async () => {
	const f = await fixture();
	try {
		assert.equal((await f.status()).verifiedOffHostCutoffSequence, null, "scheduling must not advance protected cutoff");
		const local = await adminRequest(f.h.admin, "POST", "/v1/admin/commands", envelope(f.h.authorityEpoch, { type: "createRecoveryPackage" }));
		assert.equal(local.body.status, "packaged");
		assert.equal((await f.status()).verifiedOffHostCutoffSequence, null, "local copy must not advance protected cutoff");
		await writeFile(f.mode, "copy-only");
		f.clock.advance(1000);
		await f.wait(b => b.health === "warning");
		assert.equal((await f.status()).verifiedOffHostCutoffSequence, null, "copy-only must not advance protected cutoff");
		await writeFile(f.mode, "ok");
		f.clock.advance(60000);
		const first = await f.wait(b => b.verifiedOffHostCutoffSequence === 4);
		assert.equal(first.unprotectedAcknowledgedWork, false);
		assert.equal(first.exposedWorkSeconds, 0);
		for (const mode of ["fail", "corrupt", "before", "after"]) {
			await writeFile(f.mode, mode);
			const result = await save(f.compatible(), f.device.bearer, f.workflow, mode, Buffer.from(mode), null, mode);
			assert.equal(result.body.status, "accepted", "backup outage must not halt acknowledgement");
			f.clock.advance(1000);
			await f.wait(b => b.phase === "failed");
			assert.equal((await f.status()).verifiedOffHostCutoffSequence, 4, "failed transfer must retain last protected cutoff");
			assert.equal((await f.status()).generation, first.generation);
		}
		await f.restart();
		assert.equal((await f.status()).generation, first.generation, "restart retains verified identity");
		assert.equal((await f.status()).unprotectedAcknowledgedWork, true);
		const manifest = JSON.parse(await readFile(join(f.destination, String(first.generation), "manifest.json"), "utf8"));
		assert.equal(manifest.cutoff, 4, "prior remote generation survives failed publication");
		await writeFile(f.mode, "ok");
		f.clock.advance(60000);
		await f.wait(b => b.verifiedOffHostCutoffSequence !== null && b.verifiedOffHostCutoffSequence > 4);
		const historical = await http(f.h.url, "GET", "/v1/export", { bearer: f.device.bearer });
		assert.equal((historical.body.backup as Backup).generation, (await f.status()).generation);
	} finally { await f.close(); }
});

test("offhost-exposure-cutoff: whole-path target, periodic trigger, measured prompt path and idle time", async t => {
	const f = await fixture();
	try {
		const start = performance.now();
		f.clock.advance(1000);
		const protectedState = await f.wait(b => b.verifiedOffHostCutoffSequence === 4);
		const realElapsed = performance.now() - start;
		assert.equal(protectedState.targetOverrun, false);
		assert(realElapsed < 299000, "snapshot plus real transfer must fit the healthy window");
		t.diagnostic(`prompt snapshot/transfer/publication measured ${realElapsed.toFixed(1)} ms plus 1000 ms coalescing`);
		f.clock.advance(900000);
		assert.equal((await f.status()).exposedWorkSeconds, 0, "idle time must not invent loss exposure");
		const message = await http(f.h.url, "POST", "/v1/commands", { bearer: f.device.bearer,
			body: envelope(f.h.authorityEpoch, { type: "postCoordinatorMessage", text: "periodic" }, { workflow: f.workflow }) });
		assert.equal(message.body.sequence, 5);
		f.clock.advance(59000);
		assert.equal((await f.status()).verifiedOffHostCutoffSequence, 4);
		f.clock.advance(1000);
		await f.wait(b => b.verifiedOffHostCutoffSequence === 5);
		await writeFile(f.mode, "fail");
		await save(f.compatible(), f.device.bearer, f.workflow, "delayed", Buffer.from("late"), null);
		f.clock.advance(301000);
		await f.wait(b => b.phase === "failed");
		assert.equal((await f.status()).targetOverrun, true, "whole exposure beyond 300 seconds must warn");
		await writeFile(f.mode, "ok");
		f.clock.advance(60000);
		const recovered = await f.wait(b => b.verifiedOffHostCutoffSequence === 6);
		assert(recovered.lastWindowSeconds !== null && recovered.lastWindowSeconds >= 361);
		assert.equal(recovered.targetOverrun, true, "completed overrun must not be erased by success");
	} finally { await f.close(); }
});

test("manual-recovery-rehearsal: destination only, exact cutoff, missing progress and safe restricted resume", async t => {
	const f = await fixture();
	try {
		f.clock.advance(1000);
		const b = await f.wait(s => s.verifiedOffHostCutoffSequence === 4);
		await save(f.compatible(), f.device.bearer, f.workflow, "ground", Buffer.from("lost later progress"), "revision:4", "lost");
		await f.h.close();
		await rm(f.data, { recursive: true });
		const started = performance.now();
		const restored = join(f.dir.path, "restored");
		const imported = spawnSync(process.execPath, [HOST_MAIN, "restore", "--data", restored, "--package", join(f.destination, String(b.generation))], { encoding: "utf8" });
		assert.equal(imported.status, 0, imported.stderr);
		const h = await startHost(restored);
		try {
			assert.equal((await http(h.url, "GET", "/v1/snapshot", { bearer: f.device.bearer })).body.code, "recovery_required");
			const repair = await adminRequest(h.admin, "POST", "/v1/admin/commands", envelope(String(h.ready.authorityEpoch), { type: "repairRecovery" }));
			assert.equal(repair.body.status, "accepted", repair.text);
			const s = await adminRequest(h.admin, "GET", "/v1/admin/status");
			assert.equal(s.body.hostMode, "recovery-reconciling");
			const replacement = { ...h, ready: { event: "ready", authorityEpoch: s.body.authorityEpoch } };
			const device = await enroll(replacement, "replacement");
			const exact = await http(h.url, "GET", "/v1/artifacts/revision%3A4", { bearer: device.bearer });
			assert.equal(exact.body.content, "cHJvdGVjdGVkCg==");
			assert.equal((await http(h.url, "GET", "/v1/commands/lost", { bearer: device.bearer })).body.code, "outcome_unknown_after_restore");
			assert.equal((await save(replacement, device.bearer, f.workflow, "ground", Buffer.from("unsafe replay"), "revision:4")).body.code, "recovery_required");
			const exported = await http(h.url, "GET", "/v1/export", { bearer: device.bearer });
			assert.equal((exported.body.recovery as { restoredCutoff: number }).restoredCutoff, 4);
			assert(exported.body.backup, "package retains readable backup state, without upgrading restored status");
			t.diagnostic(`owned manual rehearsal elapsed ${(performance.now() - started).toFixed(1)} ms; cutoff 4; later progress lost; real destination/tool provisioning and effect reconciliation remain prerequisites; no RTO`);
		} finally { await h.stop(); }
	} finally { await f.close(); }
});

test("offhost-exposure-cutoff: missing provisioning warns without refusing local saves", async () => {
	const dir = await tempDir("no-backup");
	const h = await startHost(dir.path);
	try {
		const d = await enroll(h, "local");
		await createWorkflow(h, d.bearer, "works");
		const s = await http(h.url, "GET", "/v1/snapshot", { bearer: d.bearer });
		assert.equal((s.body.backup as Backup).phase, "unconfigured");
		assert.equal((s.body.backup as Backup).verifiedOffHostCutoffSequence, null);
		assert.equal((s.body.backup as Backup).unprotectedAcknowledgedWork, true);
		assert.equal(s.body.hostMode, "active");
		assert.equal((await readdir(dir.path)).includes("render.db"), true);
	} finally { await h.stop(); await dir.remove(); }
});
