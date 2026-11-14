import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	chmod,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	readlink,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(
	new URL("./install-extension.mjs", import.meta.url),
);
const names = JSON.stringify(["w1", "w2", "websearch"]);

async function fixture(t) {
	const root = await mkdtemp(join(tmpdir(), "tau-install-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const home = join(root, "tau-home");
	const bin = join(root, "bin");
	const target = join(root, "built-output");
	const log = join(root, "nix-arguments.json");
	await mkdir(bin);
	await mkdir(target);
	await writeFile(
		join(bin, "nix"),
		`#!${process.execPath}\nimport { writeFileSync, symlinkSync, unlinkSync, existsSync } from 'node:fs';\nconst args = process.argv.slice(2);\nwriteFileSync(${JSON.stringify(log)}, JSON.stringify(args));\nif (process.env.FAIL_BUILD) process.exit(1);\nconst link = args[args.indexOf('--out-link') + 1];\nif (existsSync(link)) unlinkSync(link);\nsymlinkSync(${JSON.stringify(target)}, link);\n`,
	);
	await chmod(join(bin, "nix"), 0o755);
	execFileSync("git", ["init", "-q", root]);
	const run = (args = [], extraEnv = {}) =>
		spawnSync(process.execPath, [installer, names, "--home", home, ...args], {
			cwd: root,
			env: {
				...process.env,
				PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
				...extraEnv,
			},
			encoding: "utf8",
		});
	return { root, home, target, log, run };
}

test("install-extension lists repository extensions and marks an installed link", async (t) => {
	const f = await fixture(t);
	const empty = f.run();
	assert.equal(empty.status, 0, empty.stderr);
	assert.equal(empty.stdout, "w1\nw2\nwebsearch\n");
	await mkdir(join(f.home, "extensions"), { recursive: true });
	await symlink(f.target, join(f.home, "extensions", "w2"));
	assert.equal(f.run().stdout, "w1\nw2 (installed)\nwebsearch\n");
});

test("install-extension builds an out-link, replaces it and tells the owner to restart", async (t) => {
	const f = await fixture(t);
	const installed = f.run(["w2"]);
	assert.equal(installed.status, 0, installed.stderr);
	const link = join(f.home, "extensions", "w2");
	assert.deepEqual(JSON.parse(await readFile(f.log, "utf8")), [
		"build",
		".#extension-w2",
		"--out-link",
		link,
	]);
	assert.equal(await readlink(link), f.target);
	assert.equal((await lstat(join(f.home, "extensions"))).mode & 0o777, 0o700);
	assert.match(installed.stdout, /Restart tau/);
	await rm(link);
	await symlink(f.root, link);
	assert.equal(f.run(["w2"]).status, 0);
	assert.equal(await readlink(link), f.target);
});

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
	await mkdir(join(f.root, "packages/w2/src"), { recursive: true });
	await writeFile(
		join(f.root, "packages/w2/src/new.ts"),
		"export const newFile = true;\n",
	);
	const result = f.run(["w2"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /untracked.*packages\/w2\/src\/new.ts/s);
	assert.match(result.stderr, /flake.*tracked.*git add/s);
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
