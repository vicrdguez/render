import assert from "node:assert/strict";
import { type ChildProcess, execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { post, until } from "./journey.ts";

const tau = fileURLToPath(
	new URL("./command/main.js", import.meta.resolve("tau/server")),
);
const running: ChildProcess[] = [];
after(() => {
	for (const child of running) child.kill("SIGKILL");
});
async function home() {
	const dir = await mkdtemp(path.join(tmpdir(), "tau-command-"));
	return {
		HOME: dir,
		PI_CODING_AGENT_DIR: path.join(dir, "pi"),
		PATH: process.env.PATH ?? "",
	};
}
function run(env: NodeJS.ProcessEnv, args: string[]) {
	return new Promise<{ code: number; stdout: string; stderr: string }>(
		(resolve) => {
			execFile(
				process.execPath,
				[tau, ...args],
				{ env },
				(error, stdout, stderr) => {
					resolve({
						code: error === null ? 0 : Number(error.code ?? 1),
						stdout,
						stderr,
					});
				},
			);
		},
	);
}
async function serve(env: NodeJS.ProcessEnv, args: string[] = []) {
	const child = spawn(process.execPath, [tau, "--port", "0", ...args], {
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
	running.push(child);
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
		stdout += chunk;
	});
	child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
		stderr += chunk;
	});
	await until("command listening address", () => {
		if (child.exitCode !== null) assert.fail(`tau exited: ${stderr}`);
		return stdout.includes("listening");
	});
	const url = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(stdout)?.[1];
	assert.ok(url, stdout);
	assert.ok(!url.endsWith(":0"));
	return { child, url, output: () => ({ stdout, stderr }) };
}

async function pair(env: NodeJS.ProcessEnv, url: string, device: string) {
	const issued = await run(env, ["device", "pair", device]);
	assert.equal(issued.code, 0, issued.stderr);
	const code = /[0-9A-Z]{4}-[0-9A-Z]{4}/.exec(issued.stdout)?.[0];
	assert.ok(code, issued.stdout);
	const paired = await post(url, "pair", { code });
	return paired.body.result.token as string;
}

test("tau starts empty and discovers only the extensions placed in its home", async () => {
	const env = await home();
	const empty = await serve(env);
	try {
		const token = await pair(env, empty.url, "empty");
		assert.deepEqual(
			(await post(empty.url, "extensions", {}, token)).body.result.items,
			[],
		);
	} finally {
		empty.child.kill("SIGTERM");
		assert.equal((await once(empty.child, "exit"))[0], 0);
	}
	const folder = path.join(env.HOME, ".tau", "extensions", "local");
	await mkdir(folder, { recursive: true });
	await writeFile(
		path.join(folder, "index.ts"),
		`import { defineExtension } from "tau-extension/durable";\nexport const extension = defineExtension({name: "local"});\n`,
	);
	const loaded = await serve(env);
	try {
		const token = await pair(env, loaded.url, "loaded");
		assert.deepEqual(
			(await post(loaded.url, "extensions", {}, token)).body.result.items,
			[{ name: "local", workflow: false }],
		);
	} finally {
		loaded.child.kill("SIGTERM");
		assert.equal((await once(loaded.child, "exit"))[0], 0);
	}
});

test("reload rereads prose, refuses syntax errors and keeps the old workflow without exposing secrets", async () => {
	const env = await home();
	const server = await serve(env);
	const folder = path.join(env.HOME, ".tau", "extensions", "local");
	await mkdir(folder);
	const source = `import { defineExtension } from "tau-extension/durable";
import { options as defineOptions, prose } from "tau-extension";
import { obj, str } from "tau-extension/schema";
export const extension = defineExtension({name: "local"});
export const options = defineOptions("local", obj({key: str({format: "secret"})}));
const instructions = prose(import.meta.dirname, "agent.md", [])({});
export const entry = {model: {provider: "anthropic", modelId: "claude-sonnet-4-5"}, extensions: [extension], instructions};
`;
	try {
		const token = await pair(env, server.url, "reload");
		await writeFile(path.join(folder, "index.ts"), source);
		await writeFile(path.join(folder, "agent.md"), "old prose");
		const added = await run(env, ["extension", "reload"]);
		assert.equal(added.code, 0, added.stderr);
		assert.match(added.stdout, /added local; projects: none/);
		await post(
			server.url,
			"bind",
			{ project: "p", workdir: env.HOME, extensions: ["local"] },
			token,
		);
		const secret = "R8-SECRET-NEVER-PRINT";
		await post(
			server.url,
			"setOptions",
			{ project: "p", extension: "local", patch: { key: secret } },
			token,
		);
		await writeFile(path.join(folder, "agent.md"), "new prose");
		const replaced = await run(env, ["extension", "reload"]);
		assert.equal(replaced.code, 0, replaced.stderr);
		assert.match(replaced.stdout, /replaced local; projects: p/);
		await writeFile(path.join(folder, "index.ts"), "export const broken = ;");
		const refused = await run(env, ["extension", "reload"]);
		assert.equal(refused.code, 1);
		assert.match(refused.stderr, /refused; old code still runs/);
		const created = await post(
			server.url,
			"create",
			{ project: "p", workflow: "local" },
			token,
		);
		assert.equal(
			typeof created.body.result.conversation,
			"number",
			JSON.stringify(created.body),
		);
		assert.doesNotMatch(
			[added, replaced, refused].map((r) => r.stdout + r.stderr).join("") +
				JSON.stringify(server.output()),
			new RegExp(secret),
		);
	} finally {
		server.child.kill("SIGTERM");
		assert.equal((await once(server.child, "exit"))[0], 0);
	}
});
