import assert from "node:assert/strict";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const tau = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/main.js");
const URL = "http://127.0.0.1:6283";
const running: ChildProcess[] = [];
after(() => {
	for (const child of running) child.kill("SIGKILL");
});

async function home() {
	const dir = await mkdtemp(path.join(tmpdir(), "tau-command-"));
	return { HOME: dir, PI_CODING_AGENT_DIR: path.join(dir, "pi"), PATH: process.env.PATH ?? "" };
}
function run(env: NodeJS.ProcessEnv, args: string[]) {
	return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
		execFile(process.execPath, [tau, ...args], { env }, (error, stdout, stderr) => {
			resolve({ code: error === null ? 0 : Number(error.code ?? 1), stdout, stderr });
		});
	});
}
async function serve(env: NodeJS.ProcessEnv) {
	const child = spawn(process.execPath, [tau], { env, stdio: ["ignore", "pipe", "pipe"] });
	running.push(child);
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
		stdout += chunk;
	});
	child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
		stderr += chunk;
	});
	for (let i = 0; i < 500 && !stdout.includes("listening"); i++) {
		if (child.exitCode !== null) assert.fail(`tau exited: ${stderr}`);
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	assert.match(stdout, /listening on http:\/\/127\.0\.0\.1:6283/);
	return { child, output: () => ({ stdout, stderr }) };
}
function post(name: string, body: object, token?: string) {
	return fetch(`${URL}/v1/${name}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify(body),
	}).then(async (r) => ({ status: r.status, body: await r.json() }));
}
async function pair(env: NodeJS.ProcessEnv, device: string) {
	const issued = await run(env, ["device", "pair", device]);
	assert.equal(issued.code, 0, issued.stderr);
	const code = /[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(issued.stdout)?.[0];
	assert.ok(code, issued.stdout);
	const paired = await post("pair", { code });
	return paired.body.result.token as string;
}

test("tau starts on ~/.tau at 127.0.0.1:6283, and the device commands reach it through the admin socket", async () => {
	const env = await home();
	await mkdir(path.join(env.HOME, ".tau", "projects", "Bad"), { recursive: true });
	const server = await serve(env);
	try {
		assert.match(server.output().stderr, /skipped Bad/);
		const socket = await stat(path.join(env.HOME, ".tau", "admin.sock"));
		assert.equal(socket.mode & 0o777, 0o600);
		const token = await pair(env, "phone");
		assert.equal((await post("projects", {}, token)).status, 200);
		const listed = await run(env, ["device", "list"]);
		assert.equal(listed.code, 0);
		assert.match(listed.stdout, /phone/);
		assert.ok(!listed.stdout.includes(token.split(".")[2] ?? "-"));
		const revoked = await run(env, ["device", "revoke", "phone"]);
		assert.equal(revoked.code, 0, revoked.stderr);
		assert.equal((await post("projects", {}, token)).body.refused.code, "unauthorized");
		assert.match((await run(env, ["device", "list"])).stdout, /phone.*revoked/);
		const again = await run(env, ["device", "pair", "phone"]);
		assert.equal(again.code, 1);
		assert.match(again.stderr, /already used/);
	} finally {
		server.child.kill("SIGKILL");
		await once(server.child, "exit");
	}
});

test("a signal ends every stream with stopping and frees the home for the next start", async () => {
	const env = await home();
	const first = await serve(env);
	const token = await pair(env, "laptop");
	const frames: string[] = [];
	const ended = new Promise<void>((resolve) => {
		http
			.request(
				`${URL}/v1/inbox`,
				{ method: "POST", headers: { Authorization: `Bearer ${token}` } },
				(response) => {
					response.setEncoding("utf8").on("data", (chunk: string) => frames.push(chunk));
					response.on("end", () => resolve());
				},
			)
			.end("{}");
	});
	await new Promise((resolve) => setTimeout(resolve, 100));
	first.child.kill("SIGTERM");
	await ended;
	assert.match(frames.join(""), /data: \{"end":\{"reason":"stopping"\}\}/);
	const [code] = await once(first.child, "exit");
	assert.equal(code, 0);
	const second = await serve(env);
	try {
		assert.equal((await post("projects", {}, token)).status, 200);
	} finally {
		second.child.kill("SIGKILL");
		await once(second.child, "exit");
	}
});

test("a device command with no server, or an unknown command, fails with a message", async () => {
	const env = await home();
	const none = await run(env, ["device", "list"]);
	assert.equal(none.code, 1);
	assert.match(none.stderr, /no Tau server/i);
	for (const args of [["serve"], ["device"], ["device", "pair"], ["device", "pair", "a", "b"]]) {
		const wrong = await run(env, args);
		assert.equal(wrong.code, 2, args.join(" "));
		assert.match(wrong.stderr, /usage: tau/);
	}
});
