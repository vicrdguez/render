import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
	access,
	glob,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const [command, ...outputs] = process.argv.slice(2);
assert.ok(command, "Pass the installed tau executable.");
assert.equal(
	outputs.length,
	3,
	"Pass the w1, w2 and websearch source outputs.",
);
const root = await mkdtemp(join(tmpdir(), "tau-installed-"));
const home = join(root, ".tau");
const env = {
	...process.env,
	HOME: root,
	PI_CODING_AGENT_DIR: join(root, "pi"),
};
const run = promisify(execFile);
const lib = resolve(command, "../../lib/tau");

async function post(url: string, name: string, body: object, token?: string) {
	const response = await fetch(`${url}/v1/${name}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify(body),
	});
	const reply = await response.json();
	assert.equal(response.status, 200, JSON.stringify(reply));
	return reply.result;
}

async function check(installed: boolean) {
	const child = spawn(command!, ["--port", "0"], {
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
		const deadline = Date.now() + 10_000;
		while (!stdout.includes("listening")) {
			assert.equal(child.exitCode, null, stderr);
			assert.ok(
				Date.now() < deadline,
				`installed tau did not start: ${stderr}`,
			);
			await new Promise((done) => setTimeout(done, 10));
		}
		process.stdout.write(stdout);
		const url = /http:\/\/127\.0\.0\.1:\d+/.exec(stdout)?.[0];
		assert.ok(url);
		const device = installed ? "phone" : "empty";
		const paired = await run(command!, ["device", "pair", device], { env });
		const code = /[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(paired.stdout)?.[0];
		assert.ok(code);
		const { token } = await post(url, "pair", { code });
		const { items } = await post(url, "extensions", {}, token);
		if (!installed) {
			assert.deepEqual(items, [], stderr);
			process.stdout.write("empty extensions []\n");
		} else {
			assert.deepEqual(
				items.map((item: any) => [item.name, item.workflow]),
				[
					["w1", true],
					["w2", true],
					["websearch", false],
				],
				stderr,
			);
			assert.deepEqual(
				items.map((item: any) => item.schema.required),
				[
					["designer", "implementer", "reviewer", "base"],
					["model"],
					["provider", "apiKey"],
				],
			);
			assert.ok(
				items.every(
					(item: any) =>
						item.schema.type === "object" &&
						item.schema.additionalProperties === false,
				),
			);
			assert.equal(items[0].schema.properties.designer.format, "model");
			assert.equal(items[1].schema.properties.model.format, "model");
			assert.equal(items[2].schema.properties.apiKey.format, "secret");
			process.stdout.write("loaded w1, w2, websearch with options schemas\n");
			const bound = await post(
				url,
				"bind",
				{ project: "p", workdir: root, extensions: ["w2", "websearch"] },
				token,
			);
			assert.deepEqual(bound.project.missing, []);
			const projects = await post(url, "projects", {}, token);
			assert.deepEqual(projects.items[0].missing, []);
			await post(
				url,
				"setOptions",
				{
					project: "p",
					extension: "w2",
					patch: { model: "anthropic/claude-sonnet-4-5" },
				},
				token,
			);
			const created = await post(
				url,
				"create",
				{ project: "p", workflow: "w2" },
				token,
			);
			assert.equal(typeof created.conversation, "number");
			process.stdout.write(
				"project missing []; W2 conversation created without a model call\n",
			);
		}
		const models = await post(url, "models", {}, token);
		assert.ok(Array.isArray(models.items));
		const listed = await run(command!, ["device", "list"], { env });
		assert.match(listed.stdout, new RegExp(device));
		process.stdout.write("models HTTP 200; paired device listed\n");
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			const exit = once(child, "exit");
			child.kill("SIGTERM");
			const [code, signal] = await exit;
			assert.equal(code, 0, stderr);
			assert.equal(signal, null);
			process.stdout.write("SIGTERM exit 0\n");
		}
	}
}

try {
	assert.deepEqual((await readdir(join(lib, "packages"))).sort(), [
		"extension",
		"host",
		"store",
		"tau",
	]);
	for await (const file of glob("packages/**/*", { cwd: lib })) {
		assert.ok(!file.endsWith(".md"), `core ships prose: ${file}`);
		if (!/\.(?:js|json)$/.test(file)) continue;
		assert.doesNotMatch(
			await readFile(join(lib, file), "utf8"),
			/tau-w1|tau-w2|tau-websearch/,
			file,
		);
	}
	await mkdir(join(home, "extensions"), { recursive: true, mode: 0o700 });
	await check(false);
	for (const [i, name] of ["w1", "w2", "websearch"].entries()) {
		const output = outputs[i]!;
		await access(join(output, "index.ts"));
		for await (const file of glob("**/*.{js,mjs,cjs}", {
			cwd: output,
			exclude: ["node_modules/**"],
		}))
			assert.fail(`extension ships JavaScript: ${file}`);
		await symlink(output, join(home, "extensions", name));
	}
	for (const file of [
		"build",
		"designer",
		"fix",
		"implementer",
		"retry",
		"review",
		"reviewer",
		"revise",
	])
		assert.ok(
			(await readFile(join(outputs[0]!, `${file}.md`), "utf8")).length > 0,
		);
	assert.ok((await readFile(join(outputs[1]!, "agent.md"), "utf8")).length > 0);
	process.stdout.write("extension source and Markdown installed\n");
	await check(true);
} finally {
	await rm(root, { recursive: true, force: true });
}
