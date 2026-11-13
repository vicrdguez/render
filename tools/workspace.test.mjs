import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tools = import.meta.dirname;
const { NODE_TEST_CONTEXT: _testContext, ...env } = process.env;
async function fixture(t) {
	const root = await realpath(
		await mkdtemp(path.join(os.tmpdir(), "tau-workspace-")),
	);
	t.after(() => rm(root, { recursive: true, force: true }));
	async function put(file, value) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(
			path.join(root, file),
			typeof value === "string" ? value : JSON.stringify(value),
		);
	}
	const manifest = {
		name: "tau-workspace",
		workspaces: ["packages/*"],
		devDependencies: { typescript: "5.9.3" },
	};
	const store = {
		name: "tau-store",
		version: "0.0.0",
		type: "module",
		exports: { ".": "./dist/src/index.js" },
	};
	await put("package.json", manifest);
	await put("tsconfig.json", { references: [{ path: "packages/store" }] });
	await put("tsconfig.base.json", {});
	await put("boundaries.json", { "tau-store": {} });
	await put("packages/store/tsconfig.json", {});
	await put("packages/store/package.json", store);
	await put("package-lock.json", {
		lockfileVersion: 3,
		packages: { "": manifest, "packages/store": store },
	});
	return { root, put, manifest, store };
}
test("boundaries reject privileged, relative, and forbidden core imports", async (t) => {
	const { root, put, store } = await fixture(t);
	await put("boundaries.json", {
		"tau-store": {},
		"tau-kit": {},
		"tau-w2": { "tau-store": ["."] },
	});
	await put("tsconfig.base.json", {});
	await put("packages/store/tsconfig.json", {});
	await put("packages/w2/tsconfig.json", {});
	await put("tsconfig.json", {
		references: [{ path: "packages/store" }, { path: "packages/w2" }],
	});
	await put("packages/w2/package.json", {
		name: "tau-w2",
		dependencies: { "tau-store": "0.0.0" },
	});
	await put("packages/w2/src/index.ts", 'import "tau-store";\n');
	assert.equal(run("check-boundaries.mjs", root).status, 0);
	for (const [source, message] of [
		['import "tau-store/host";', /forbidden workspace capability/],
		['import "../../store/src/index.js";', /cross-package relative import/],
		[
			'export type Hidden = import("tau-store/host").Store;',
			/forbidden workspace capability/,
		],
	]) {
		await put("packages/w2/src/index.ts", source);
		const result = run("check-boundaries.mjs", root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, message);
	}
	await put("packages/w2/src/index.ts", 'import "tau-store";\n');
	await put("packages/store/package.json", {
		...store,
		dependencies: { "tau-kit": "0.0.0" },
	});
	await put("packages/store/src/index.ts", 'import "tau-kit";\n');
	const result = run("check-boundaries.mjs", root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /forbidden.*(capability|dependency)/);
});

test("boundaries reject a package omitted from root project references", async (t) => {
	const { root, put } = await fixture(t);
	await put("packages/forgotten/package.json", { name: "tau-forgotten" });
	await put("packages/forgotten/tsconfig.json", {});
	await put("boundaries.json", { "tau-store": {}, "tau-forgotten": {} });
	const result = run("check-boundaries.mjs", root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /tau-forgotten.*tsconfig.json.*references/);
});

for (const file of [
	"src/x.test.ts",
	"test/y.spec.ts",
	"test/z.test.mts",
	"checks/a.test.js",
]) {
	test(`boundaries reject misplaced test ${file}`, async (t) => {
		const { root, put } = await fixture(t);
		await put(
			`packages/store/${file}`,
			'import assert from "node:assert/strict"; assert.equal(1, 2);',
		);
		const result = run("check-boundaries.mjs", root);
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/tests must live in <pkg>\/test\/\*\*\/\*\.test\.ts/,
		);
	});
}

test("boundaries accept nested test files and ignore generated tests", async (t) => {
	const { root, put } = await fixture(t);
	await put("packages/store/test/nested/ok.test.ts", "");
	await put("packages/store/dist/test/nested/ok.test.js", "");
	await put("packages/store/node_modules/dep/other.spec.js", "");
	const result = run("check-boundaries.mjs", root);
	assert.equal(result.status, 0, result.stderr);
});

for (const [name, directory, specifier, allowed] of [
	["tau-websearch", "src", "tau-store/host", false],
	["tau-w2", "src", "tau-store/host", false],
	["tau-w1", "src", "tau-store/host", false],
	["tau-websearch", "test", "tau-store/host", true],
	["tau-w2", "test", "tau-store/host", true],
	["tau-w1", "test", "tau-store/host", true],
	["tau-kit", "test", "tau-store/host", false],
	["tau-w2", "test", "tau-host", false],
]) {
	test(`${name} ${directory} import of ${specifier} is ${allowed ? "allowed" : "forbidden"}`, async (t) => {
		const { root, put, manifest, store } = await fixture(t);
		await put(
			"boundaries.json",
			await readFile(path.join(tools, "../boundaries.json"), "utf8"),
		);
		const hostStore = {
			...store,
			exports: { ...store.exports, "./host": "./dist/src/host.js" },
		};
		const extension = {
			name,
			devDependencies: {
				"tau-store": "0.0.0",
				...(specifier === "tau-host" ? { "tau-host": "0.0.0" } : {}),
			},
		};
		const host = { name: "tau-host", exports: { ".": "./dist/src/index.js" } };
		await put("packages/store/package.json", hostStore);
		await put("packages/extension/package.json", extension);
		await put("packages/extension/tsconfig.json", {});
		await put("packages/host/package.json", host);
		await put("packages/host/tsconfig.json", {});
		await put("tsconfig.json", {
			references: ["store", "extension", "host"].map((dir) => ({
				path: `packages/${dir}`,
			})),
		});
		await put("package-lock.json", {
			lockfileVersion: 3,
			packages: {
				"": manifest,
				"packages/store": hostStore,
				"packages/extension": extension,
				"packages/host": host,
			},
		});
		await put(
			`packages/extension/${directory}/${directory === "test" ? "access.test.ts" : "access.ts"}`,
			`import "${specifier}";`,
		);
		const result = run("check-boundaries.mjs", root);
		assert.equal(result.status, allowed ? 0 : 1, result.stderr);
		if (!allowed) assert.match(result.stderr, /forbidden workspace capability/);
		assert.equal(run("check-lock.mjs", root).status, 0);
	});
}

for (const source of [
	'import { createRequire as load } from "node:module"; load(import.meta.url)("tau-store/host");',
	'import { createRequire as load } from "module";',
	'import m from "node:module"; m.createRequire(import.meta.url)("tau-store/host");',
	'import * as m from "module"; m.createRequire(import.meta.url)("tau-store/host");',
]) {
	test(`boundaries reject CommonJS escape ${source}`, async (t) => {
		const { root, put } = await fixture(t);
		await put("packages/store/src/index.ts", source);
		const result = run("check-boundaries.mjs", root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /CommonJS escape forbidden/);
	});
}

test("test selection refuses missing emitted files before running any tests", async (t) => {
	const { root, put } = await fixture(t);
	await put("packages/store/test/missing.test.ts", "");
	await put("packages/store/test/present.test.ts", "");
	await put(
		"packages/store/dist/test/present.test.js",
		'console.log("TEST_RAN");',
	);
	for (const selections of [
		[],
		["tau-store"],
		["packages/store/test/missing.test.ts"],
	]) {
		const result = run("tests.mjs", root, ...selections);
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/missing emitted test.*packages\/store\/dist\/test\/missing.test.js/,
		);
		assert.doesNotMatch(result.stdout, /TEST_RAN/);
	}
});

for (const name of ["tau-store", "@tau/store"]) {
	test(`linking removes the stale managed workspace link ${name}`, async (t) => {
		const { root, put, store } = await fixture(t);
		await put("packages/store/package.json", { ...store, name });
		await put("external/library/package.json", { name: "library" });
		const external = path.join(root, "external");
		assert.equal(run("link-node-modules.mjs", root, external).status, 0);
		await rm(path.join(root, "packages/store"), { recursive: true });
		assert.equal(run("link-node-modules.mjs", root, external).status, 0);
		await assert.rejects(lstat(path.join(root, "node_modules", name)), {
			code: "ENOENT",
		});
		assert.equal(
			await realpath(path.join(root, "node_modules/library")),
			path.join(external, "library"),
		);
	});
}

function run(script, root, ...args) {
	return spawnSync(process.execPath, [path.join(tools, script), ...args], {
		cwd: root,
		encoding: "utf8",
		timeout: 10000,
		env,
	});
}

test("lock check rejects changed dependency specs and workspace versions", async (t) => {
	const { root, put, manifest, store } = await fixture(t);
	assert.equal(run("check-lock.mjs", root).status, 0);
	await put("package.json", {
		...manifest,
		devDependencies: { typescript: "5.8.3" },
	});
	let result = run("check-lock.mjs", root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /package.json.*devDependencies/);
	await put("package.json", manifest);
	await put("packages/store/package.json", { ...store, version: "0.0.1" });
	result = run("check-lock.mjs", root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /packages\/store\/package.json.*version/);
});

test("links resolve external dependencies and live workspace output without installing", async (t) => {
	const { root, put } = await fixture(t);
	await put("external/@scope/library/package.json", {
		name: "@scope/library",
		type: "module",
		exports: "./index.js",
	});
	await put("external/@scope/library/index.js", "export default 7;\n");
	await put("packages/store/dist/src/index.js", "export const value = 1;\n");
	const external = path.join(root, "external");
	assert.equal(run("link-node-modules.mjs", root, external).status, 0);
	assert.equal(
		await realpath(path.join(root, "node_modules/tau-store")),
		path.join(root, "packages/store"),
	);
	assert.equal(
		await realpath(path.join(root, "node_modules/@scope/library")),
		path.join(external, "@scope/library"),
	);
	await put(
		"probe.mjs",
		'import { value } from "tau-store"; import external from "@scope/library"; console.log(String(value) + " " + String(external));\n',
	);
	const probe = () =>
		spawnSync(process.execPath, ["probe.mjs"], { cwd: root, encoding: "utf8" });
	assert.equal(probe().stdout.trim(), "1 7");
	await put("packages/store/dist/src/index.js", "export const value = 2;\n");
	assert.equal(run("link-node-modules.mjs", root, external).status, 0);
	assert.equal(probe().stdout.trim(), "2 7");
});

test("linking refuses an unmanaged node_modules directory without changing it", async (t) => {
	const { root, put } = await fixture(t);
	await put("node_modules/keep", "user data");
	const result = run(
		"link-node-modules.mjs",
		root,
		path.join(root, "external"),
	);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Move it aside/);
	assert.equal(
		await readFile(path.join(root, "node_modules/keep"), "utf8"),
		"user data",
	);
});

test("test selection accepts package names and source files and rejects unknown selections", async (t) => {
	const { root, put } = await fixture(t);
	await put("packages/store/test/first.test.ts", "");
	await put("packages/store/test/second.test.ts", "");
	await put(
		"packages/store/dist/test/first.test.js",
		'import { test } from "node:test"; test("selected first", () => {});\n',
	);
	await put(
		"packages/store/dist/test/second.test.js",
		'import { test } from "node:test"; test("selected second", () => {});\n',
	);
	for (const selection of ["store", "tau-store"]) {
		const result = run("tests.mjs", root, selection);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /selected first/);
		assert.match(result.stdout, /selected second/);
	}
	const result = run("tests.mjs", root, "packages/store/test/first.test.ts");
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /selected first/);
	assert.doesNotMatch(result.stdout, /selected second/);
	assert.equal(run("tests.mjs", root, "missing").status, 1);
	assert.equal(run("tests.mjs", root, "store", "missing").status, 1);
});
