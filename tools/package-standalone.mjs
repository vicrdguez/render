import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	constants,
	copyFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [target, output] = process.argv.slice(2);
assert.ok(
	target && output && process.argv.length === 4,
	"Usage: node tools/package-standalone.mjs <target> <output-directory>",
);
assert.match(target, /^(darwin-arm64|linux-arm64|linux-x64)$/);
assert.equal(
	target,
	`${process.platform}-${process.arch}`,
	"Use a native runner for the target",
);

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const lock = readJson("package-lock.json");
assert.equal(
	lock.lockfileVersion,
	3,
	"Tau runtime requires npm lockfile version 3",
);
const runtimeRecords = Object.fromEntries(
	Object.entries(lock.packages).filter(
		([path, record]) => path.includes("node_modules/") && !record.link,
	),
);
assert.ok(
	Object.keys(runtimeRecords).every((path) => path.startsWith("node_modules/")),
	"Tau runtime does not support workspace-local node_modules records",
);
const core = readJson("core/package.json");
const runtime = { name: "tau-runtime", version: core.version, private: true };
for (const key of [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
	"peerDependenciesMeta",
]) {
	if (Object.hasOwn(core, key)) runtime[key] = core[key];
}

const nodeVersion = "24.22.1";
const nodeDist = `node-v${nodeVersion}-${target}`;
const nodeUrl = `https://nodejs.org/dist/v${nodeVersion}`;
const scratch = mkdtempSync(join(tmpdir(), "tau-standalone-"));
const build = join(scratch, "build");
const stage = join(scratch, "tau");
const node = join(scratch, nodeDist, "bin/node");
const npm = join(scratch, nodeDist, "bin/npm");
const name = `tau-${target}.tar.gz`;
const archive = join(scratch, name);
const destination = resolve(output, name);
const run = (command, args, cwd) =>
	execFileSync(command, args, { cwd, stdio: "inherit" });

try {
	const tarball = `${nodeDist}.tar.gz`;
	run(
		"curl",
		["-fsSLO", `${nodeUrl}/SHASUMS256.txt`, "-O", `${nodeUrl}/${tarball}`],
		scratch,
	);
	const checksums = readFileSync(join(scratch, "SHASUMS256.txt"), "utf8");
	const expected = checksums
		.split("\n")
		.map((line) => line.trim().split(/\s+/))
		.find(([, file]) => file === tarball)?.[0];
	assert.ok(expected, `Node did not publish a checksum for ${tarball}`);
	const actual = createHash("sha256")
		.update(readFileSync(join(scratch, tarball)))
		.digest("hex");
	assert.equal(
		actual,
		expected,
		`Node archive checksum mismatch for ${tarball}`,
	);
	run("tar", ["-xzf", tarball], scratch);

	const workspaceManifests = Object.keys(lock.packages)
		.filter((path) => path && !path.includes("node_modules/"))
		.map((path) => `${path}/package.json`);
	for (const path of [
		"package.json",
		"package-lock.json",
		"tsconfig.base.json",
		...workspaceManifests,
		"core/tsconfig.json",
		"core/src",
		"core/test",
	]) {
		const targetPath = join(build, path);
		mkdirSync(dirname(targetPath), { recursive: true });
		cpSync(join(root, path), targetPath, { recursive: true });
	}
	const ci = [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"];
	run(node, ci, build);
	run(node, ["node_modules/typescript/bin/tsc", "-b", "core"], build);
	run(node, [join(root, "tools/assets.mjs"), "core"], build);

	mkdirSync(join(stage, "bin"), { recursive: true });
	mkdirSync(join(stage, "core/dist"), { recursive: true });
	cpSync(join(build, "core/dist/src"), join(stage, "core/dist/src"), {
		recursive: true,
	});
	copyFileSync(
		join(root, "core/package.json"),
		join(stage, "core/package.json"),
	);
	copyFileSync(join(root, "LICENSE"), join(stage, "LICENSE"));
	copyFileSync(join(scratch, nodeDist, "LICENSE"), join(stage, "NODE-LICENSE"));
	copyFileSync(node, join(stage, "bin/node"));
	writeFileSync(
		join(stage, "bin/tau"),
		`#!/bin/sh
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P) || exit 1
exec "$root/bin/node" "$root/core/dist/src/command/main.js" "$@"
`,
		{ mode: 0o755 },
	);
	chmodSync(join(stage, "bin/node"), 0o755);

	writeFileSync(join(stage, "package.json"), JSON.stringify(runtime));
	writeFileSync(
		join(stage, "package-lock.json"),
		JSON.stringify({
			...lock,
			name: runtime.name,
			version: runtime.version,
			packages: { "": runtime, ...runtimeRecords },
		}),
	);
	run(node, [...ci, "--omit=dev"], stage);
	for (const path of [
		"package.json",
		"package-lock.json",
		"node_modules/.package-lock.json",
	]) {
		rmSync(join(stage, path), { force: true });
	}

	run("tar", ["-czf", archive, "tau"], scratch);
	mkdirSync(dirname(destination), { recursive: true });
	copyFileSync(archive, destination, constants.COPYFILE_EXCL);
	process.stdout.write(`${destination}\n`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
