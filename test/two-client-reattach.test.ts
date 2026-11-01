// V4: two stateless client processes against a real host, plus the observation rules.
import assert from "node:assert/strict";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { connect } from "node:net";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, before, describe, test } from "node:test";
import {
	CLIENT_CLI,
	createWorkflow,
	envelope,
	type HostProcess,
	http,
	percentile,
	save,
	sha256,
	startHost,
	tempDir,
} from "./support/host.ts";
import { A1, B1, G1 } from "./support/literals.ts";

type CliResult = { code: number | null; stdout: string; stderr: string; json: Record<string, unknown> };

function cli(args: string[], env: Record<string, string> = {}): Promise<CliResult> {
	return new Promise((resolve) => {
		execFile(process.execPath, [CLIENT_CLI, ...args], { env: { ...process.env, ...env } }, (error, stdout, stderr) => {
			let json: Record<string, unknown> = {};
			try {
				json = JSON.parse(stdout) as Record<string, unknown>;
			} catch {
				json = {};
			}
			const code = error === null ? 0 : typeof error.code === "number" ? error.code : null;
			resolve({ code, stdout, stderr, json });
		});
	});
}

function observeProcess(args: string[]): {
	proc: ChildProcess;
	frames: Record<string, unknown>[];
	exited: Promise<number | null>;
	waitFor(pred: (f: Record<string, unknown>) => boolean, ms?: number): Promise<Record<string, unknown>>;
} {
	const proc = spawn(process.execPath, [CLIENT_CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
	const frames: Record<string, unknown>[] = [];
	const waiters: { pred: (f: Record<string, unknown>) => boolean; resolve(f: Record<string, unknown>): void }[] = [];
	createInterface({ input: proc.stdout as NodeJS.ReadableStream }).on("line", (line) => {
		const f = JSON.parse(line) as Record<string, unknown>;
		frames.push(f);
		for (const w of waiters.splice(0)) {
			if (w.pred(f)) w.resolve(f);
			else waiters.push(w);
		}
	});
	const exited = new Promise<number | null>((r) => proc.on("exit", (c) => r(c)));
	return {
		proc,
		frames,
		exited,
		waitFor: (pred, ms = 10_000) =>
			new Promise((resolve, reject) => {
				const hit = frames.find(pred);
				if (hit) return resolve(hit);
				const timer = setTimeout(() => reject(new Error(`frame not seen; got ${JSON.stringify(frames)}`)), ms);
				waiters.push({
					pred,
					resolve: (f) => {
						clearTimeout(timer);
						resolve(f);
					},
				});
			}),
	};
}

describe("V4 two stateless clients", () => {
	let dir: Awaited<ReturnType<typeof tempDir>>;
	let host: HostProcess;
	let tokenA: string;
	let tokenB: string;
	let deviceA: string;

	before(async () => {
		dir = await tempDir("v4");
		host = await startHost(dir.path);
		const ea = await cli(["admin", "--data", dir.path, "enroll", "--label", "laptop"]);
		const eb = await cli(["admin", "--data", dir.path, "enroll", "--label", "desktop"]);
		assert.equal(ea.code, 0, ea.stderr);
		assert.equal(eb.code, 0, eb.stderr);
		deviceA = String(ea.json.device);
		tokenA = join(dir.path, "..", `${dir.path.split("/").at(-1)}-a.token`);
		tokenB = join(dir.path, "..", `${dir.path.split("/").at(-1)}-b.token`);
		await writeFile(tokenA, String(ea.json.bearer), { mode: 0o600 });
		await writeFile(tokenB, String(eb.json.bearer), { mode: 0o600 });
	});
	after(async () => {
		await host?.stop();
		await dir?.remove();
	});

	const as = (token: string) => ["--url", host.url, "--token-file", token];

	test("B2-03 race, cross-device retry, revocation of reads and streams, fresh attach within 5 s", async () => {
		const wf = await cli([...as(tokenA), "create-workflow", "--title", "Keep work safe"]);
		assert.equal(wf.code, 0, wf.stderr);
		const w = String((wf.json.result as Record<string, unknown>).workflow);
		const g1 = join(dir.path, "..", "g1.md");
		const a1 = join(dir.path, "..", "a1.md");
		const b1 = join(dir.path, "..", "b1.md");
		await writeFile(g1, G1.bytes);
		await writeFile(a1, A1.bytes);
		await writeFile(b1, B1.bytes);
		const ground = await cli([...as(tokenA), "save", "--workflow", w, "--document", "ground", "--file", g1, "--expected", "none"]);
		assert.equal(ground.code, 0, ground.stderr);
		const r0 = String((ground.json.result as Record<string, unknown>).revision);

		// Both clients hold r0; A wins, B is told its basis is stale.
		const sa = await cli([
			...as(tokenA),
			"save",
			"--workflow",
			w,
			"--document",
			"ground",
			"--file",
			a1,
			"--expected",
			r0,
			"--command-id",
			"a-race-1",
		]);
		const sb = await cli([...as(tokenB), "save", "--workflow", w, "--document", "ground", "--file", b1, "--expected", r0]);
		assert.equal(sa.code, 0, sa.stderr);
		assert.equal(sb.code, 1, sb.stdout);
		assert.equal(sb.json.code, "stale_basis");
		const ra = String((sa.json.result as Record<string, unknown>).revision);
		assert.deepEqual(sb.json.refs, { current: ra, expected: r0 });

		// Same human, other device, original ID and bytes: original receipt with A's provenance.
		const dup = await cli([
			...as(tokenB),
			"save",
			"--workflow",
			w,
			"--document",
			"ground",
			"--file",
			a1,
			"--expected",
			r0,
			"--command-id",
			"a-race-1",
		]);
		assert.equal(dup.code, 0, dup.stderr);
		assert.equal(dup.json.duplicate, true);
		assert.equal(dup.json.sequence, sa.json.sequence);
		assert.deepEqual(dup.json.acceptedBy, { principal: "human", route: "device", device: deviceA });

		// A observes, then is revoked while streaming.
		const stream = observeProcess([...as(tokenA), "observe"]);
		const first = await stream.waitFor((f) => f.kind === "snapshot");
		assert.equal(first.version, 1);
		assert.equal(first.authorityEpoch, host.ready.authorityEpoch);
		const revoke = await cli(["admin", "--data", dir.path, "revoke", "--device", deviceA]);
		assert.equal(revoke.code, 0, revoke.stderr);
		const end = await stream.waitFor((f) => f.kind === "end", 5_000);
		assert.equal(end.reason, "credential_revoked");
		assert.equal(await stream.exited, 4);
		const deniedSnap = await cli([...as(tokenA), "snapshot"]);
		assert.equal(deniedSnap.code, 1);
		assert.equal(deniedSnap.json.code, "unauthorized");
		const deniedRead = await cli([...as(tokenA), "read", "--revision", ra, "--out", join(dir.path, "..", "denied.bin")]);
		assert.equal(deniedRead.code, 1);
		assert.equal(deniedRead.json.code, "unauthorized");

		// Fresh client B process: no chat, no cached state.
		const started = performance.now();
		const snap = await cli([...as(tokenB), "snapshot"]);
		const out = join(dir.path, "..", "recovered.md");
		const read = await cli([...as(tokenB), "read", "--revision", ra, "--out", out]);
		const elapsed = performance.now() - started;
		assert.equal(snap.code, 0, snap.stderr);
		assert.equal(read.code, 0, read.stderr);
		assert.ok(elapsed <= 5_000, `reattach took ${elapsed} ms`);
		assert.ok((await readFile(out)).equals(A1.bytes));
		assert.equal(read.json.digest, A1.digest);
		const view = (snap.json.workflows as Record<string, unknown>[]).find((x) => x.workflow === w) as Record<string, unknown>;
		for (const field of ["commitment", "owner", "evidence", "blocker", "nextHumanAction", "unavailable"]) {
			assert.ok(field in view, `snapshot lacks ${field}`);
		}
		assert.equal((view.ground as Record<string, unknown>).revision, ra);
		for (const absent of ["coordinator-replies", "checkpoints", "assignments", "historical-export", "recovery-packages"]) {
			assert.ok((view.unavailable as string[]).includes(absent), absent);
		}
		assert.ok(!snap.stdout.includes(B1.digest), "unacknowledged bytes must not appear");
		console.log(JSON.stringify({ measure: "reattach_ms", value: Math.round(elapsed) }));

		// Ordinary restart preserves B's enrollment and A's revocation.
		await host.stop();
		host = await startHost(dir.path);
		const afterRestart = await cli([...as(tokenB), "snapshot"]);
		assert.equal(afterRestart.code, 0, afterRestart.stderr);
		const stillRevoked = await cli([...as(tokenA), "snapshot"]);
		assert.equal(stillRevoked.json.code, "unauthorized");
	});

	test("B3-01/B3-04 frames carry version, scope, epoch and sequence; reconnect starts with a snapshot", async () => {
		const stream = observeProcess([...as(tokenB), "observe", "--frames", "3"]);
		const snap = await stream.waitFor((f) => f.kind === "snapshot");
		const w = String(((snap.workflows as Record<string, unknown>[])[0] as Record<string, unknown>).workflow);
		const bearer = (await readFile(tokenB, "utf8")).trim();
		const doc = `frames-${Date.now()}`;
		const s1 = await save(host, bearer, w, doc, A1.bytes, null);
		const s2 = await save(host, bearer, w, doc, G1.bytes, String((s1.body.result as Record<string, unknown>).revision));
		assert.equal(await stream.exited, 0);
		const [f0, f1, f2] = stream.frames as Record<string, unknown>[];
		for (const f of [f0, f1, f2]) {
			assert.equal(f?.version, 1);
			assert.equal(f?.authorityEpoch, host.ready.authorityEpoch);
			assert.ok(typeof f?.sequence === "number");
			assert.ok(f !== undefined && "scope" in f);
		}
		assert.equal(f1?.kind, "change");
		assert.equal(f1?.base, f0?.sequence);
		assert.equal(f1?.sequence, s1.body.sequence);
		assert.equal(f2?.base, f1?.sequence);
		assert.equal(f2?.sequence, s2.body.sequence);
		const again = observeProcess([...as(tokenB), "observe", "--frames", "1"]);
		await again.exited;
		assert.equal(again.frames[0]?.kind, "snapshot");
		assert.equal(again.frames[0]?.sequence, s2.body.sequence);
	});

	test("B3-02 unknown protocol versions are refused with upgrade guidance", async () => {
		const bearer = (await readFile(tokenB, "utf8")).trim();
		for (const path of ["/v1/snapshot?version=2", "/v1/observe?version=2"]) {
			const r = await http(host.url, "GET", path, { bearer });
			assert.equal(r.status, 400, path);
			assert.equal(r.body.code, "unsupported_version");
			assert.deepEqual(r.body.supported, [1]);
			assert.match(String(r.body.reason), /upgrade/i);
		}
	});

	test("B3-05 a stalled observer cannot block commits and is disconnected", async () => {
		const bearer = (await readFile(tokenB, "utf8")).trim();
		const w = await createWorkflow(host, bearer, "slow consumer");
		const url = new URL(host.url);
		const socket = connect(Number(url.port), url.hostname);
		await new Promise<void>((r) => socket.once("connect", () => r()));
		socket.write(`GET /v1/observe?version=1 HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer ${bearer}\r\n\r\n`);
		await new Promise<void>((r) => socket.once("data", () => r()));
		socket.pause();
		let closed = false;
		socket.on("close", () => {
			closed = true;
		});
		const latencies: number[] = [];
		for (let i = 0; i < 1_500; i++) {
			const t0 = performance.now();
			const r = await http(host.url, "POST", "/v1/commands", {
				bearer,
				body: envelope(
					String(host.ready.authorityEpoch),
					{ type: "postCoordinatorMessage", text: `${"backlog ".repeat(40)}${i}` },
					{ workflow: w },
				),
			});
			latencies.push(performance.now() - t0);
			assert.equal(r.status, 200, r.text);
		}
		const p95 = percentile(latencies, 95);
		console.log(JSON.stringify({ measure: "stalled_observer_ack_p95_ms", value: Number(p95.toFixed(2)) }));
		assert.ok(p95 < 250, `p95 ${p95} ms`);
		socket.resume();
		socket.on("data", () => undefined);
		await new Promise((r) => setTimeout(r, 1_000));
		assert.ok(closed || socket.destroyed, "the stalled stream must have been disconnected by the host");
	});

	test("B3-06 a client that disconnects after sending still gets its work committed", async () => {
		const bearer = (await readFile(tokenB, "utf8")).trim();
		const w = await createWorkflow(host, bearer, "disconnect");
		const commandId = "disconnect-1";
		const body = JSON.stringify(
			envelope(
				String(host.ready.authorityEpoch),
				{ type: "saveDocument", document: "ground", mediaType: "text/markdown", content: A1.bytes.toString("base64") },
				{ workflow: w, expected: { document: null }, commandId },
			),
		);
		const url = new URL(host.url);
		const socket = connect(Number(url.port), url.hostname);
		await new Promise<void>((r) => socket.once("connect", () => r()));
		socket.end(
			`POST /v1/commands HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer ${bearer}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
		);
		socket.destroy();
		await new Promise((r) => setTimeout(r, 500));
		const retry = await save(host, bearer, w, "ground", A1.bytes, null, commandId);
		assert.equal(retry.status, 200, retry.text);
		assert.equal(retry.body.duplicate, true);
		assert.equal((retry.body.result as Record<string, unknown>).digest, sha256(A1.bytes));
	});
});

describe("B3-02/B3-03 client frame rules against a controlled stream", () => {
	function fakeServer(script: (call: number) => string[]): Promise<{ url: string; calls: () => number; close(): void }> {
		let calls = 0;
		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			if (req.url?.startsWith("/v1/observe")) {
				calls++;
				res.writeHead(200, { "content-type": "application/x-ndjson" });
				for (const line of script(calls)) res.write(`${line}\n`);
				res.end();
				return;
			}
			res.writeHead(404).end();
		});
		return new Promise((resolve) =>
			server.listen(0, "127.0.0.1", () => {
				const address = server.address() as { port: number };
				resolve({ url: `http://127.0.0.1:${address.port}`, calls: () => calls, close: () => server.close() });
			}),
		);
	}
	const frame = (f: Record<string, unknown>) =>
		JSON.stringify({ version: 1, scope: { workflows: "all" }, authorityEpoch: "authority-x", ...f });

	test("a gap triggers a fresh snapshot; repeated and older sequences are discarded", async () => {
		const fake = await fakeServer((call) =>
			call === 1
				? [
						frame({ kind: "snapshot", sequence: 5, workflows: [] }),
						frame({ kind: "change", base: 5, sequence: 6, workflows: [] }),
						frame({ kind: "change", base: 5, sequence: 6, workflows: [] }),
						frame({ kind: "change", base: 7, sequence: 8, workflows: [] }),
					]
				: [frame({ kind: "snapshot", sequence: 8, workflows: [] })],
		);
		const token = await tempDir("v4-fake");
		const file = join(token.path, "t");
		await writeFile(file, "render_device:1_x", { mode: 0o600 });
		try {
			const r = await cli(["--url", fake.url, "--token-file", file, "observe", "--frames", "3"]);
			assert.equal(r.code, 0, r.stderr);
			const frames = r.stdout
				.trim()
				.split("\n")
				.map((l) => JSON.parse(l) as Record<string, unknown>);
			assert.deepEqual(
				frames.map((f) => [f.kind, f.sequence]),
				[
					["snapshot", 5],
					["change", 6],
					["snapshot", 8],
				],
			);
			assert.equal(fake.calls(), 2);
		} finally {
			fake.close();
			await token.remove();
		}
	});

	test("an unknown frame version stops the client with upgrade guidance", async () => {
		const fake = await fakeServer(() => [JSON.stringify({ version: 2, kind: "snapshot", sequence: 1, scope: {}, authorityEpoch: "a" })]);
		const token = await tempDir("v4-fake2");
		const file = join(token.path, "t");
		await writeFile(file, "render_device:1_x", { mode: 0o600 });
		try {
			const r = await cli(["--url", fake.url, "--token-file", file, "observe"]);
			assert.equal(r.code, 5);
			assert.match(r.stderr, /upgrade/i);
			assert.equal(r.stdout.trim(), "");
		} finally {
			fake.close();
			await token.remove();
		}
	});
});

describe("B1-14 admin CLI uses the restrictive owner route", () => {
	test("the admin route refuses when the socket is absent rather than falling back to TCP", async () => {
		const empty = await tempDir("v4-noadmin");
		try {
			const r = await cli(["admin", "--data", empty.path, "enroll", "--label", "x"]);
			assert.notEqual(r.code, 0);
			assert.match(r.stderr, /admin\.sock/);
		} finally {
			await empty.remove();
		}
	});
});
