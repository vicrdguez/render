import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";

const [archive] = process.argv.slice(2);
assert.ok(
	archive && process.argv.length === 3,
	"Usage: node tools/verify-standalone.mjs <archive.tar.gz>",
);
const exec = promisify(execFile);
const scratch = await mkdtemp("/tmp/tau-smoke-");
const install = join(scratch, "relocated tau");
const cwd = join(scratch, "project");
const env = { HOME: join(scratch, "home"), PATH: "/usr/bin:/bin" };
const tau = join(install, "tau/bin/tau");

async function withServer(check) {
	const child = spawn(tau, ["--port", "0"], {
		cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	const closed = new Promise((done) => child.once("close", done));
	let passed = false;
	let stdout = "";
	let stderr = "";
	let spawnError;
	child.on("error", (error) => {
		spawnError = error;
	});
	child.stdout.setEncoding("utf8").on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.setEncoding("utf8").on("data", (chunk) => {
		stderr += chunk;
	});
	try {
		const deadline = Date.now() + 15_000;
		for (;;) {
			if (spawnError) throw spawnError;
			assert.ok(
				child.exitCode === null && child.signalCode === null,
				"Tau exited before listening",
			);
			const url = /listening on (http:\/\/127\.0\.0\.1:\d+)\n/.exec(
				stdout,
			)?.[1];
			if (url) {
				await check(url);
				passed = true;
				break;
			}
			assert.ok(Date.now() < deadline, "Tau did not announce a listener");
			await setTimeout(25);
		}
	} catch (error) {
		process.stderr.write(stdout + stderr);
		throw error;
	} finally {
		if (child.pid && child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
		}
		const code = await Promise.race([
			closed,
			setTimeout(10_000, undefined, { ref: false }),
		]);
		if (code === undefined) {
			child.kill("SIGKILL");
			await closed;
		}
		if (passed)
			assert.equal(code, 0, `Tau did not shut down cleanly: ${stderr}`);
	}
}

async function post(url, call, body, token) {
	const response = await fetch(`${url}/v1/${call}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(5_000),
	});
	const reply = await response.json();
	assert.equal(response.status, 200, `${call}: ${JSON.stringify(reply)}`);
	return reply.result;
}

try {
	for (const directory of [install, cwd, env.HOME]) await mkdir(directory);
	await exec("tar", ["-xzf", resolve(archive), "-C", install], {
		env,
		timeout: 60_000,
	});
	let token;
	await withServer(async (url) => {
		const paired = await exec(tau, ["device", "pair", "smoke-phone"], {
			cwd,
			env,
			timeout: 10_000,
		});
		const code = /[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(paired.stdout)?.[0];
		assert.ok(code, paired.stdout);
		({ token } = await post(url, "pair", { code }));
		assert.ok(token);
		assert.deepEqual((await post(url, "projects", {}, token)).items, []);
		const { project } = await post(
			url,
			"bind",
			{ project: "smoke", workdir: cwd, extensions: [] },
			token,
		);
		assert.equal(project.project, "smoke");
		assert.deepEqual((await post(url, "extensions", {}, token)).items, []);
	});

	const extension = join(env.HOME, ".tau/extensions/smoke-addon");
	await mkdir(extension, { recursive: true });
	await writeFile(
		join(extension, "index.ts"),
		`import { defineExtension } from "tau/durable";
export const extension = defineExtension({ name: "smoke-addon" });
`,
	);
	await withServer(async (url) => {
		const { items } = await post(url, "projects", {}, token);
		assert.deepEqual(
			items.map((project) => project.project),
			["smoke"],
		);
		assert.deepEqual((await post(url, "extensions", {}, token)).items, [
			{ name: "smoke-addon", workflow: false },
		]);
	});
	process.stdout.write(
		"Standalone Tau paired, reopened its project, and loaded a TypeScript extension.\n",
	);
} finally {
	await rm(scratch, { recursive: true, force: true });
}
