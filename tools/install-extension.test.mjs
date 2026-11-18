import assert from "node:assert/strict";
import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(
	new URL("./install-extension.mjs", import.meta.url),
);
const names = JSON.stringify(["w1", "w2", "webkit"]);

for (const status of ["applied", "refused"]) {
	test(`install-extension roots the previous store output during ${status} reload and removes the temporary root`, async (t) => {
		const f = await fixture(t);
		const directory = join(f.home, "extensions");
		await mkdir(directory, { recursive: true });
		const link = join(directory, "w2");
		const previous = `/nix/store/${randomUUID()}-previous`;
		await symlink(previous, link);
		let observation;
		const server = net.createServer({ allowHalfOpen: true }, (socket) => {
			socket.resume();
			socket.on("end", async () => {
				const roots = (await readFile(f.roots, "utf8"))
					.trim()
					.split("\n")
					.map(JSON.parse);
				const rooted = roots.find(
					(args) => args.at(-1) === previous && args[1] !== link,
				);
				observation = {
					current: await readlink(link),
					protected: rooted ? await readlink(rooted[1]) : undefined,
				};
				socket.end(
					JSON.stringify({
						reload: {
							status,
							extensions: [],
							tasks: [],
							skipped: [],
							failures: [],
						},
					}) + "\n",
				);
			});
		});
		await new Promise((resolve) =>
			server.listen(join(f.home, "admin.sock"), resolve),
		);
		try {
			const result = await new Promise((resolve) =>
				execFile(
					process.execPath,
					[installer, names, "--home", f.home, "w2"],
					{
						cwd: f.root,
						env: {
							...process.env,
							PATH: `${join(f.root, "bin")}${delimiter}${process.env.PATH}`,
						},
					},
					(error, stdout, stderr) =>
						resolve({ code: error?.code ?? 0, stdout, stderr }),
				),
			);
			assert.equal(result.code, status === "applied" ? 0 : 1, result.stderr);
			assert.deepEqual(observation, { current: f.target, protected: previous });
			assert.equal(
				await readlink(link),
				status === "applied" ? f.target : previous,
			);
			assert.deepEqual(await readdir(directory), ["w2"]);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
}

test("install-extension preserves the old store link if its temporary root cannot be registered", async (t) => {
	const f = await fixture(t);
	const directory = join(f.home, "extensions");
	await mkdir(directory, { recursive: true });
	const previous = `/nix/store/${randomUUID()}-previous`;
	const link = join(directory, "w2");
	await symlink(previous, link);
	const result = f.run(["w2"], { FAIL_ROOT: "1" });
	assert.equal(result.status, 1);
	assert.equal(await readlink(link), previous);
	assert.deepEqual(await readdir(directory), ["w2"]);
});

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "tau-install-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const home = join(root, "tau-home");
	const bin = join(root, "bin");
	const target = join(root, "built-output");
	const log = join(root, "nix-arguments.json");
	const roots = join(root, "roots.jsonl");
	await mkdir(bin);
	await mkdir(target);
	await writeFile(
		join(bin, "nix"),
		`#!${process.execPath}\nimport { writeFileSync, symlinkSync, unlinkSync, lstatSync, readlinkSync } from 'node:fs';\nconst args = process.argv.slice(2);\nwriteFileSync(${JSON.stringify(log)}, JSON.stringify(args));\nif (process.env.FAIL_BUILD || (process.env.FAIL_OUTLINK && args.includes('--out-link'))) process.exit(1);\nif (args.includes('--no-link')) process.exit(0);\nconst link = args[args.indexOf('--out-link') + 1];\nlet info;\ntry { info = lstatSync(link); } catch (error) { if (error.code !== 'ENOENT') throw error; }\nif (info?.isSymbolicLink() && readlinkSync(link).startsWith('/nix/store/')) unlinkSync(link);\nsymlinkSync(${JSON.stringify(target)}, link);\nif (process.env.WAIT_BUILD) setTimeout(() => {}, 2000);\n`,
	);
	await chmod(join(bin, "nix"), 0o755);
	await writeFile(
		join(bin, "nix-store"),
		`#!${process.execPath}\nimport { appendFileSync, symlinkSync, lstatSync } from "node:fs";\nconst args = process.argv.slice(2);\nif (process.env.FAIL_ROOT) process.exit(1);\nappendFileSync(${JSON.stringify(roots)}, JSON.stringify(args) + "\\n");\ntry { lstatSync(args[1]); } catch (error) { if (error.code !== "ENOENT") throw error; symlinkSync(args.at(-1), args[1]); }\n`,
	);
	await chmod(join(bin, "nix-store"), 0o755);
	execFileSync("git", ["init", "-q", root]);
	const run = (args = [], extraEnv = {}, defaultHome = false) =>
		spawnSync(
			process.execPath,
			[installer, names, ...(defaultHome ? [] : ["--home", home]), ...args],
			{
				cwd: root,
				env: {
					...process.env,
					PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
					HOME: root,
					TAU_INVOCATION_DIR: root,
					...extraEnv,
				},
				encoding: "utf8",
			},
		);
	return { root, home, target, log, roots, run };
}

test("install-extension lists repository extensions and marks an installed link", async (t) => {
	const f = await fixture(t);
	const empty = f.run();
	assert.equal(empty.status, 0, empty.stderr);
	assert.equal(empty.stdout, "w1\nw2\nwebkit\n");
	await mkdir(join(f.home, "extensions"), { recursive: true });
	await symlink(f.target, join(f.home, "extensions", "w2"));
	assert.equal(f.run().stdout, "w1\nw2 (installed)\nwebkit\n");
});

test("install-extension replaces a link atomically and reports that it loads at the next start", async (t) => {
	const f = await fixture(t);
	const installed = f.run(["w2"]);
	assert.equal(installed.status, 0, installed.stderr);
	const link = join(f.home, "extensions", "w2");
	const args = JSON.parse(await readFile(f.log, "utf8"));
	assert.deepEqual(args.slice(0, 3), ["build", ".#extension-w2", "--out-link"]);
	assert.equal(join(args[3], ".."), join(link, ".."));
	assert.notEqual(args[3], link);
	assert.equal(await readlink(link), f.target);
	assert.deepEqual(JSON.parse((await readFile(f.roots, "utf8")).trim()), [
		"--add-root",
		link,
		"--indirect",
		"--realise",
		f.target,
	]);
	assert.equal((await lstat(join(f.home, "extensions"))).mode & 0o777, 0o700);
	assert.match(installed.stdout, /next start/);
	await rm(link);
	await symlink(f.root, link);
	assert.equal(f.run(["w2"]).status, 0);
	assert.equal(await readlink(link), f.target);
});

test("install-extension preserves an existing group- and other-writable extensions folder", async (t) => {
	const f = await fixture(t);
	const directory = join(f.home, "extensions");
	await mkdir(directory, { recursive: true });
	await chmod(directory, 0o777);
	const result = f.run(["w2"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(await readlink(join(directory, "w2")), f.target);
	assert.equal((await lstat(directory)).mode & 0o777, 0o777);
});

test("install-extension uses a temporary HOME for its default Tau home", async (t) => {
	const f = await fixture(t);
	const result = f.run(["w2"], {}, true);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(await readlink(join(f.root, ".tau/extensions/w2")), f.target);
});

test("install-extension resolves a relative home from the caller directory", async (t) => {
	const f = await fixture(t);
	const caller = join(f.root, "nested");
	await mkdir(caller);
	const result = f.run(["--home", "relative", "w2"], {
		TAU_INVOCATION_DIR: caller,
	});
	assert.equal(result.status, 0, result.stderr);
	assert.equal(
		await readlink(join(caller, "relative/extensions/w2")),
		f.target,
	);
});

test("install-extension replaces a dangling link", async (t) => {
	const f = await fixture(t);
	await mkdir(join(f.home, "extensions"), { recursive: true });
	const link = join(f.home, "extensions/w2");
	await symlink(join(f.root, "absent"), link);
	const result = f.run(["w2"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(await readlink(link), f.target);
});

for (const kind of ["file", "directory"]) {
	test(`install-extension refuses an existing ${kind} without removing it`, async (t) => {
		const f = await fixture(t);
		await mkdir(join(f.home, "extensions"), { recursive: true });
		const link = join(f.home, "extensions/w2");
		if (kind === "file") await writeFile(link, "keep");
		else await mkdir(link);
		const result = f.run(["w2"]);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, new RegExp(`Refusing.*${kind}`));
		if (kind === "file") assert.equal(await readFile(link, "utf8"), "keep");
		else assert.ok((await lstat(link)).isDirectory());
	});
}

test("install-extension refuses unknown names and malformed arguments without building", async (t) => {
	const f = await fixture(t);
	for (const args of [
		["unknown"],
		["../w2"],
		["w1", "w2"],
		["--home"],
		["--unknown"],
	]) {
		const result = f.run(args);
		assert.equal(result.status, 2, result.stderr);
		assert.match(result.stderr, /usage: install-extension|Unknown extension/);
	}
	await assert.rejects(lstat(f.log), { code: "ENOENT" });
});

test("install-extension warns that untracked extension files are excluded by the flake", async (t) => {
	const f = await fixture(t);
	await mkdir(join(f.root, "extensions/w2/src"), { recursive: true });
	await writeFile(
		join(f.root, "extensions/w2/src/new.ts"),
		"export const newFile = true;\n",
	);
	const result = f.run(["w2"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /untracked.*extensions\/w2\/src\/new.ts/s);
	assert.match(result.stderr, /flake.*tracked.*git add/s);
});

for (const [status, tasks, expected] of [
	["applied", [], 0],
	[
		"applied",
		[
			{
				project: "p",
				task: 33,
				kind: "w2.due",
				conversation: 12,
				stored: 1,
				installed: 2,
				status: "migration-needed-on-reservation",
				reason: "migration_failed",
			},
		],
		3,
	],
	["refused", [], 1],
]) {
	test(`install-extension reloads a running home and returns ${expected}`, async (t) => {
		const f = await fixture(t);
		await mkdir(f.home, { recursive: true });
		const report = {
			status,
			tasks,
			extensions: [{ name: "w2", status: "added", projects: ["p"] }],
			skipped: [],
			failures:
				status === "refused"
					? [{ name: "w2", stage: "import", message: "syntax error" }]
					: [],
		};
		let request;
		const server = net.createServer({ allowHalfOpen: true }, (socket) => {
			let input = "";
			socket.on("data", (chunk) => {
				input += String(chunk);
			});
			socket.on("end", () => {
				request = JSON.parse(input);
				socket.end(JSON.stringify({ reload: report }) + "\n");
			});
		});
		await new Promise((resolve) =>
			server.listen(join(f.home, "admin.sock"), resolve),
		);
		try {
			const result = await new Promise((resolve) =>
				execFile(
					process.execPath,
					[installer, names, "--home", f.home, "w2"],
					{
						cwd: f.root,
						env: {
							...process.env,
							PATH: `${join(f.root, "bin")}${delimiter}${process.env.PATH ?? ""}`,
						},
					},
					(error, stdout, stderr) =>
						resolve({
							code: error === null ? 0 : Number(error.code),
							stdout,
							stderr,
						}),
				),
			);
			assert.equal(result.code, expected, result.stderr);
			assert.deepEqual(request, { command: "extension_reload" });
			assert.match(
				result.stdout + result.stderr,
				status === "applied"
					? /added w2; projects: p/
					: /install refused.*previous version.*installed/i,
			);
			assert.doesNotMatch(result.stdout, /"status"/);
			if (expected === 3) {
				assert.match(result.stdout, /will block when it next wakes/);
				assert.doesNotMatch(result.stdout, /migration_failed/);
			}
			if (status === "refused") {
				await assert.rejects(lstat(join(f.home, "extensions/w2")), {
					code: "ENOENT",
				});
				assert.doesNotMatch(result.stdout, /Installed/);
				assert.match(result.stderr, /syntax error/);
			} else
				assert.equal(await readlink(join(f.home, "extensions/w2")), f.target);
			assert.doesNotMatch(result.stdout, /next start/);
		} finally {
			await new Promise((resolve) => server.close(resolve));
		}
	});
}

test("install-extension keeps the old link when the out-link build fails", async (t) => {
	const f = await fixture(t);
	await mkdir(join(f.home, "extensions"), { recursive: true });
	const link = join(f.home, "extensions", "w2");
	await symlink(f.root, link);
	const result = f.run(["w2"], { FAIL_OUTLINK: "1" });
	assert.equal(result.status, 1);
	assert.equal(await readlink(link), f.root);
});

test("install-extension reports a failed build without claiming installation or replacing the old link", async (t) => {
	const f = await fixture(t);
	await mkdir(join(f.home, "extensions"), { recursive: true });
	const link = join(f.home, "extensions", "w2");
	await symlink(f.root, link);
	const result = f.run(["w2"], { FAIL_BUILD: "1" });
	assert.equal(result.status, 1);
	assert.doesNotMatch(result.stdout, /Restart tau|Installed/);
	assert.equal(await readlink(link), f.root);
});

test("install-extension restores and roots the previous version after refusal", async (t) => {
	const f = await fixture(t);
	await mkdir(join(f.home, "extensions"), { recursive: true });
	const link = join(f.home, "extensions/w2");
	await symlink(f.root, link);
	const server = net.createServer({ allowHalfOpen: true }, (socket) => {
		socket.resume();
		socket.on("end", () =>
			socket.end(
				JSON.stringify({
					reload: {
						status: "refused",
						extensions: [],
						tasks: [],
						skipped: [],
						failures: [
							{ name: "w2", stage: "import", message: "syntax error" },
						],
					},
				}) + "\n",
			),
		);
	});
	await new Promise((resolve) =>
		server.listen(join(f.home, "admin.sock"), resolve),
	);
	try {
		const result = await new Promise((resolve) =>
			execFile(
				process.execPath,
				[installer, names, "--home", f.home, "w2"],
				{
					cwd: f.root,
					env: {
						...process.env,
						PATH: `${join(f.root, "bin")}${delimiter}${process.env.PATH}`,
					},
				},
				(error, stdout, stderr) =>
					resolve({ code: error?.code, stdout, stderr }),
			),
		);
		assert.equal(result.code, 1, result.stderr);
		assert.equal(await readlink(link), f.root);
		const roots = (await readFile(f.roots, "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.deepEqual(roots.at(-1), [
			"--add-root",
			link,
			"--indirect",
			"--realise",
			f.root,
		]);
		assert.match(
			result.stderr,
			/install refused.*previous version.*installed/i,
		);
		assert.doesNotMatch(result.stdout, /Installed/);
		assert.deepEqual(await readdir(join(f.home, "extensions")), ["w2"]);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test("install-extension removes only its own stale temporary links at startup", async (t) => {
	const f = await fixture(t);
	const dir = join(f.home, "extensions");
	await mkdir(dir, { recursive: true });
	const stale = ".w2-00000000-0000-4000-8000-000000000000";
	await symlink(f.target, join(dir, stale));
	await symlink(f.target, join(dir, ".w2-not-ours"));
	const unrelated = ".w2-custom-00000000-0000-4000-8000-000000000000";
	await symlink(f.target, join(dir, unrelated));
	assert.equal(f.run().status, 0);
	assert.deepEqual(await readdir(dir), [unrelated, ".w2-not-ours"]);
});

for (const signal of ["SIGTERM", "SIGINT"])
	test(`install-extension cleans its temporary root on ${signal}`, async (t) => {
		const f = await fixture(t);
		const child = spawn(
			process.execPath,
			[installer, names, "--home", f.home, "w2"],
			{
				cwd: f.root,
				env: {
					...process.env,
					WAIT_BUILD: "1",
					PATH: `${join(f.root, "bin")}${delimiter}${process.env.PATH}`,
				},
				stdio: "ignore",
			},
		);
		t.after(() => child.kill("SIGKILL"));
		const dir = join(f.home, "extensions");
		for (let n = 0; ; n++) {
			if (
				(await readdir(dir).catch(() => [])).some((name) =>
					name.startsWith(".w2-"),
				)
			)
				break;
			assert.ok(n < 200, "temporary out-link created");
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		const ended = new Promise((resolve) => child.once("exit", resolve));
		child.kill(signal);
		await ended;
		assert.deepEqual(await readdir(dir), []);
	});
