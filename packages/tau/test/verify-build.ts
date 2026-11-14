import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { post, until } from "./journey.js";

const command = process.argv[2];
assert.ok(command, "Pass the installed tau executable.");
const root = await mkdtemp(join(tmpdir(), "tau-installed-"));
const env = {
	...process.env,
	HOME: root,
	PI_CODING_AGENT_DIR: join(root, "pi"),
};
const run = promisify(execFile);
const child = spawn(command, ["--port", "0"], {
	env,
	stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
	stdout += String(chunk);
});
child.stderr.on("data", (chunk) => {
	stderr += String(chunk);
});
try {
	await until("installed tau starts", () => {
		assert.equal(child.exitCode, null, stderr);
		return stdout.includes("listening");
	});
	process.stdout.write(stdout);
	const url = /http:\/\/127\.0\.0\.1:\d+/.exec(stdout)?.[0];
	assert.ok(url);
	const paired = await run(command, ["device", "pair", "phone"], { env });
	process.stdout.write(paired.stdout);
	const code = /[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(paired.stdout)?.[0];
	assert.ok(code);
	const reply = await post(url, "pair", { code });
	assert.equal(reply.status, 200);
	const token = reply.body.result.token;
	assert.equal((await post(url, "projects", {}, token)).status, 200);
	const modules = await post(url, "extensions", {}, token);
	assert.equal(modules.status, 200);
	assert.deepEqual(modules.body.result.items.map((m: any) => m.name).sort(), [
		"w1",
		"w2",
		"websearch",
	]);
	const models = await post(url, "models", {}, token);
	assert.equal(models.status, 200, JSON.stringify(models.body));
	assert.ok(Array.isArray(models.body.result.items));
	process.stdout.write(`models HTTP ${models.status}\n`);
	const listed = await run(command, ["device", "list"], { env });
	assert.match(listed.stdout, /phone/);
	process.stdout.write(listed.stdout);
	const lib = resolve(command, "../../lib/tau/packages");
	for (const file of [
		"build",
		"designer",
		"fix",
		"implementer",
		"retry",
		"review",
		"reviewer",
		"revise",
	]) {
		const asset = join(lib, "w1/dist/src", `${file}.md`);
		await access(asset);
		assert.ok((await readFile(asset, "utf8")).length > 0);
		process.stdout.write(`asset ${asset}\n`);
	}
	await access(join(lib, "w2/dist/src/agent.md"));
	process.stdout.write(
		"W2 agent prose is installed. All three extensions are loaded.\n",
	);
} finally {
	if (child.exitCode === null && child.signalCode === null) {
		const exit = once(child, "exit");
		child.kill("SIGTERM");
		const [code, signal] = await exit;
		assert.equal(code, 0, stderr);
		assert.equal(signal, null);
		process.stdout.write("SIGTERM exit 0\n");
	}
	await rm(root, { recursive: true, force: true });
}
