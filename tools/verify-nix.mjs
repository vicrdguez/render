import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	cp,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "..");
const scratch = await realpath(
	await mkdtemp(path.join(tmpdir(), "tau-nix-inputs-")),
);
const system = execFileSync(
	"nix",
	["eval", "--impure", "--raw", "--expr", "builtins.currentSystem"],
	{ encoding: "utf8" },
).trim();
const run = (command, args) =>
	execFileSync(command, args, { cwd: scratch, encoding: "utf8" });
const checkNames = [
	"workspace",
	"core",
	"extension-w1",
	"extension-w2",
	"extension-websearch",
	"e2e",
	"verify-build",
];
const packageNames = [
	"tau",
	"extension-w1",
	"extension-w2",
	"extension-websearch",
];

function evaluate() {
	return JSON.parse(
		run("nix", [
			"eval",
			"--json",
			"--impure",
			"--expr",
			`let f = builtins.getFlake "git+file://${scratch}"; in { checks = builtins.mapAttrs (_: c: c.drvPath) f.checks.${system}; packages = builtins.mapAttrs (_: p: p.drvPath) f.packages.${system}; apps = builtins.attrNames f.apps.${system}; }`,
		]),
	);
}

try {
	const files = execFileSync("git", ["ls-files", "-z"], {
		cwd: repository,
		encoding: "utf8",
	})
		.split("\0")
		.filter(Boolean);
	for (const file of files) {
		const target = path.join(scratch, file);
		await mkdir(path.dirname(target), { recursive: true });
		await cp(path.join(repository, file), target, {
			dereference: false,
			verbatimSymlinks: true,
		});
	}
	run("git", ["init", "--quiet"]);
	run("git", ["add", "--force", "."]);
	const baseline = evaluate();
	await mkdir(path.join(scratch, "node_modules"));
	const unmanaged = path.join(scratch, "node_modules/keep");
	await writeFile(unmanaged, "unmanaged dependencies");
	for (const command of ["test", "typecheck"]) {
		for (const args of [
			["--help"],
			["--list"],
			["workspace", "--help"],
			["core", "--list"],
			["--help", "core"],
		]) {
			const result = spawnSync(
				"nix",
				["run", `git+file://${scratch}#${command}`, "--", ...args],
				{ cwd: scratch, encoding: "utf8" },
			);
			assert.equal(
				result.status,
				args.length === 1 ? 0 : 2,
				`${command} ${args.join(" ")}: ${result.stderr}`,
			);
			if (args.length > 1) assert.match(result.stderr, /Usage:/);
		}
	}
	assert.equal(await readFile(unmanaged, "utf8"), "unmanaged dependencies");
	console.log("help and mixed flags bypass checkout preparation");
	for (const name of [
		"test-core",
		"test-w1",
		"test-w2",
		"test-websearch",
		"test-e2e",
		"test-tools",
		"verify-build",
	])
		assert.ok(baseline.apps.includes(name), `discoverable app ${name}`);
	assert.ok(
		!baseline.apps.includes("check"),
		"full acceptance uses nix flake check",
	);
	for (const name of ["tau", "extension-w2"]) {
		const paths = run("nix-store", [
			"--query",
			"--requisites",
			baseline.packages[name],
		])
			.trim()
			.split("\n")
			.map((file) => path.basename(file));
		for (const other of packageNames.filter((other) => other !== name))
			assert.ok(
				!paths.includes(path.basename(baseline.packages[other])),
				`${name} must not build ${other}`,
			);
	}
	const validationChecks = checkNames.filter(
		(name) => !["workspace", "verify-build"].includes(name),
	);
	const cases = [
		["README.md", "\nNix input probe.\n", ["workspace"], []],
		["flake.nix", "\n# Nix input probe.\n", ["workspace"], []],
		["nix/workspace.nix", "\n# Nix input probe.\n", ["workspace"], []],
		["tools/workspace.test.mjs", "\n// Nix input probe.\n", ["workspace"], []],
		["core/src/server.ts", "\n// Nix input probe.\n", checkNames, ["tau"]],
		[
			"core/README.md",
			"\nNix input probe.\n",
			["workspace", ...validationChecks],
			[],
		],
		[
			"tools/assets.mjs",
			"\n// Nix input probe.\n",
			["workspace", ...validationChecks],
			[],
		],
		["tsconfig.base.json", "\n", checkNames, ["tau"]],
		["package-lock.json", "\n", checkNames, ["tau", "extension-websearch"]],
		[
			"extensions/w2/src/agent.md",
			"\nNix input probe.\n",
			["workspace", "extension-w2", "e2e", "verify-build"],
			["extension-w2"],
		],
		[
			"e2e/test/journey-server.ts",
			"\n// Nix input probe.\n",
			["workspace", "e2e"],
			[],
		],
		[
			"core/test/extension/fixtures/instructions.md",
			"\nNix input probe.\n",
			checkNames,
			["tau"],
		],
	];
	for (const [file, addition, changedChecks, changedPackages] of cases) {
		const target = path.join(scratch, file);
		const original = await readFile(target, "utf8");
		await writeFile(target, original + addition);
		try {
			const changed = evaluate();
			for (const [group, names, expected] of [
				["checks", checkNames, changedChecks],
				["packages", packageNames, changedPackages],
			]) {
				for (const name of names)
					assert.equal(
						changed[group][name] !== baseline[group][name],
						expected.includes(name),
						`${file}: ${group}.${name} invalidation`,
					);
			}
			console.log(`${file}: expected check and package invalidation`);
		} finally {
			await writeFile(target, original);
		}
	}
} finally {
	await rm(scratch, { recursive: true, force: true });
}
