import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	glob,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { check } from "./check-boundaries.mjs";
import { selectPackages, workspaces } from "./workspaces.mjs";

const tools = import.meta.dirname;

test("every source workspace references its emitted dependency", async () => {
	for (const directory of [
		"extensions/w1",
		"extensions/w2",
		"extensions/websearch",
		"journeys",
	]) {
		const config = JSON.parse(
			await readFile(
				path.join(tools, "..", directory, "tsconfig.json"),
				"utf8",
			),
		);
		assert.deepEqual(config.references, [
			{
				path: directory === "journeys" ? "../core" : "../../core",
			},
		]);
	}
});

test("journeys reject relative JavaScript and direct extension source imports", async (t) => {
	const { root, put } = await fixture(t);
	await put("journeys/package.json", { name: "tau-journeys" });
	await put("journeys/tsconfig.json", {});
	await put("tsconfig.json", {
		references: [{ path: "core" }, { path: "journeys" }],
	});
	await put(
		"boundaries.json",
		JSON.parse(await readFile(path.join(tools, "../boundaries.json"), "utf8")),
	);
	for (const [specifier, diagnostic] of [
		["./helper.js", /relative imports must end in \.ts/],
		["../../extensions/w1/src/index.ts", /cross-package relative import/],
	]) {
		await put("journeys/test/access.ts", `import "${specifier}";`);
		assert.match((await check(root)).join("\n"), diagnostic);
	}
});

test("side selection runs extension tests without unrelated packages", async (t) => {
	const { root, put } = await fixture(t);
	await put("core/test/no.test.ts", "");
	await put("core/dist/test/no.test.js", 'throw new Error("core ran");');
	for (const name of ["w1", "w2"]) {
		await put(`extensions/${name}/package.json`, {
			name: `tau-${name}`,
			type: "module",
		});
		await put(`extensions/${name}/tsconfig.json`, {
			compilerOptions: { noEmit: true },
		});
		await put(
			`extensions/${name}/test/ok.test.ts`,
			`import { test } from "node:test"; test("${name} selected", () => {});`,
		);
	}
	const result = run("tests.mjs", root, "extensions");
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /w1 selected/);
	assert.match(result.stdout, /w2 selected/);
	assert.doesNotMatch(result.stdout, /core ran/);
});

test("every declared workspace dependency is installed at its declared version", async () => {
	const root = path.resolve(tools, "..");
	const manifest = JSON.parse(
		await readFile(path.join(root, "package.json"), "utf8"),
	);
	for await (const directory of glob(manifest.workspaces, { cwd: root })) {
		const file = path.join(root, directory, "package.json");
		const pkg = JSON.parse(await readFile(file, "utf8"));
		const require = createRequire(file);
		for (const [name, version] of Object.entries({
			...pkg.dependencies,
			...pkg.devDependencies,
		})) {
			let installed;
			for (const modules of require.resolve.paths(name) ?? []) {
				try {
					installed = JSON.parse(
						await readFile(path.join(modules, name, "package.json"), "utf8"),
					);
					break;
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
			}
			assert.ok(installed, `${pkg.name}: dependency ${name} is not installed`);
			assert.equal(
				installed.version,
				version,
				`${pkg.name}: dependency ${name} version`,
			);
		}
	}
});
const { NODE_TEST_CONTEXT: _testContext, ...env } = process.env;
async function fixture(t) {
	const root = await realpath(
		await mkdtemp(path.join(os.tmpdir(), "tau-workspace-")),
	);
	t.after(() => rm(root, { force: true, recursive: true }));
	async function put(file, value) {
		await mkdir(path.dirname(path.join(root, file)), { recursive: true });
		await writeFile(
			path.join(root, file),
			typeof value === "string" ? value : JSON.stringify(value),
		);
	}
	const manifest = {
		devDependencies: { typescript: "5.9.3" },
		name: "tau-workspace",
		workspaces: ["core", "extensions/*", "journeys"],
	};
	const store = {
		exports: { ".": "./dist/src/index.js" },
		name: "tau",
		type: "module",
		version: "0.0.0",
	};
	await put("package.json", manifest);
	await put("tsconfig.json", { references: [{ path: "core" }] });
	await put("tsconfig.base.json", {});
	await put("boundaries.json", { tau: {} });
	await put("core/tsconfig.json", {});
	await put("core/package.json", store);
	await put("package-lock.json", {
		lockfileVersion: 3,
		packages: { "": manifest, core: store },
	});
	return { manifest, put, root, store };
}
async function extensionFixture(t) {
	const result = await fixture(t);
	const { put } = result;
	const policy = {
		tau: {},
		"tau-private": {},
		"tau-w1": { extension: true },
		"tau-w2": {
			extension: true,
			tau: [".", "./durable", "./schema", "./chord"],
			testOnly: { tau: ["./testing"] },
		},
	};
	const extension = {
		dependencies: { tau: "0.0.0", webfox: "4.11.0" },
		devDependencies: { "test-helper": "1.0.0" },
		name: "tau-w2",
	};
	await put("boundaries.json", policy);
	await put("tsconfig.json", {
		references: ["core", "extensions/w2", "extensions/w1"].map((path) => ({
			path,
		})),
	});
	for (const directory of ["extensions/w2", "extensions/w1"])
		await put(`${directory}/tsconfig.json`, {});
	await put("core/package.json", {
		exports: Object.fromEntries(
			[".", "./durable", "./schema", "./chord", "./testing", "./server"].map(
				(entry) => [entry, "./dist/src/index.js"],
			),
		),
		name: "tau",
	});
	await put("extensions/w1/package.json", {
		exports: { ".": "./dist/src/index.js" },
		name: "tau-w1",
	});
	await put("extensions/w2/package.json", extension);
	return { ...result, extension, policy };
}

for (const [layer, targets] of [
	["store", ["host", "command"]],
	["host", ["command"]],
]) {
	test(`core ${layer} cannot import upper layers`, async (t) => {
		const { root, put } = await fixture(t);
		await put("core/package.json", {
			exports: {
				".": "./dist/src/index.js",
				"./server": "./dist/src/server.js",
				"./testing": "./dist/src/testing.js",
			},
			name: "tau",
		});
		const specifiers = targets.map((target) => `../${target}/index.js`);
		if (layer === "store") specifiers.push("../server.js", "tau/server");
		for (const specifier of specifiers) {
			await put(`core/src/${layer}/access.ts`, `export * from "${specifier}";`);
			assert.match(
				(await check(root)).join("\n"),
				/forbidden core layer import/,
			);
		}
		await put(`core/src/${layer}/access.ts`, 'import "./local.js";');
		assert.deepEqual(await check(root), []);
	});
}

for (const layer of ["store", "host", "command"]) {
	test(`core ${layer} cannot import the extension author directory`, async (t) => {
		const { root, put } = await fixture(t);
		for (const statement of [
			'import { options } from "../extension/helpers.js";',
			'export * from "../extension/durable.js";',
			'const value = import("../extension/schema.js");',
			'type Value = import("../extension/chord.js").Context;',
			'import "tau";',
			'import "tau/durable";',
		]) {
			await put(`core/src/${layer}/access.ts`, statement);
			assert.match(
				(await check(root)).join("\n"),
				/forbidden core layer import/,
			);
		}
		await put(`core/src/${layer}/access.ts`, 'import "./local.js";');
		assert.deepEqual(await check(root), []);
	});
}

test("tau extensions cannot import tau/server", async (t) => {
	const { root, put } = await extensionFixture(t);
	await put("extensions/w2/src/access.ts", 'import "tau/server";');
	assert.match(
		(await check(root)).join("\n"),
		/access.ts: tau\/server: forbidden extension import/,
	);
});

for (const statement of [
	'import "./local.js";',
	'export { value } from "./local.js";',
	'const value = import("./local.js");',
	'type Value = import("./local.js").Value;',
	'import "./local";',
	'import "./local.mts";',
]) {
	test(`extensions require .ts relative specifiers: ${statement}`, async (t) => {
		const { root, put } = await extensionFixture(t);
		for (const directory of ["src", "test"]) {
			await put(`extensions/w2/${directory}/access.ts`, statement);
			assert.match(
				(await check(root)).join("\n"),
				new RegExp(
					`${directory}/access.ts: .*relative imports must end in \\.ts`,
				),
			);
		}
	});
}

test("source extensions reject tests outside the runner's discovery pattern", async (t) => {
	const { root, put } = await extensionFixture(t);
	await put("extensions/w2/tsconfig.json", {
		compilerOptions: { noEmit: true },
	});
	for (const file of [
		"src/lost.test.ts",
		"test/lost.spec.ts",
		"test/lost.test.mts",
	]) {
		await put(`extensions/w2/${file}`, 'throw new Error("must not be lost");');
		assert.ok(
			(await check(root)).some(
				(error) => error.includes(file) && error.includes("tests must live"),
			),
		);
	}
});

test("noEmit tests run source with types and prose, select nested files, and propagate failure", async (t) => {
	const { root, put } = await fixture(t);
	await put("core/tsconfig.json", {
		compilerOptions: { noEmit: true },
	});
	await put("core/src/value.ts", "export const value: number = 7;");
	await put("core/src/agent.md", "source prose");
	await put(
		"core/test/nested/first.test.ts",
		`
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { value } from "../../src/value.ts";
test("source first", () => {
  assert.equal(value, 7);
  assert.equal(readFileSync(new URL("../../src/agent.md", import.meta.url), "utf8"), "source prose");
});`,
	);
	await put(
		"core/test/second.test.ts",
		'import { test } from "node:test"; test("source second", () => {});',
	);
	await put(
		"core/dist/test/nested/first.test.js",
		'throw new Error("stale emitted test ran");',
	);
	for (const selections of [
		[],
		["core"],
		["tau"],
		["core/test/nested/first.test.ts"],
	]) {
		const result = run("tests.mjs", root, ...selections);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /source first/);
		if (selections[0]?.endsWith(".ts"))
			assert.doesNotMatch(result.stdout, /source second/);
		else assert.match(result.stdout, /source second/);
	}
	await put(
		"core/test/nested/first.test.ts",
		'import { test } from "node:test"; test("source failure", () => { throw new Error("source assertion"); });',
	);
	const result = run("tests.mjs", root, "tau");
	assert.equal(result.status, 1);
	assert.match(result.stdout, /source assertion/);
});

test("assets preserve emitted prose and leave noEmit packages without dist", async (t) => {
	const { root, put } = await extensionFixture(t);
	await put("extensions/w2/tsconfig.json", {
		compilerOptions: { noEmit: true },
	});
	await put("extensions/w2/src/agent.md", "source prose");
	await put("extensions/w2/test/nested/fixture.md", "source fixture");
	await put("core/src/agent.md", "emitted prose");
	assert.equal(run("assets.mjs", root).status, 0);
	assert.equal(
		await readFile(path.join(root, "core/dist/src/agent.md"), "utf8"),
		"emitted prose",
	);
	await assert.rejects(lstat(path.join(root, "extensions/w2/dist")), {
		code: "ENOENT",
	});
});

for (const name of ["websearch", "w2", "w1"]) {
	for (const [label, source, diagnostic] of [
		["no output", "export const value: number = 1;", null],
		["type errors", 'export const value: number = "wrong";', /TS2322/],
		["non-erasable syntax", "export enum Mode { A, B }", /TS1294/],
	]) {
		test(`${name} typecheck enforces ${label}`, async (t) => {
			const { root, put } = await fixture(t);
			const config = JSON.parse(
				await readFile(
					path.join(tools, `../extensions/${name}/tsconfig.json`),
					"utf8",
				),
			);
			await put("core/tsconfig.json", {
				...config,
				compilerOptions: {
					...config.compilerOptions,
					tsBuildInfoFile: path.join(root, "build.tsbuildinfo"),
					types: [],
				},
				extends: path.join(tools, "../tsconfig.base.json"),
				references: config.references.map((reference) => ({
					path: path.resolve(tools, `../extensions/${name}`, reference.path),
				})),
			});
			await put("core/src/index.ts", source);
			const result = spawnSync(
				process.execPath,
				[path.join(tools, "../node_modules/typescript/bin/tsc"), "-b", "core"],
				{ cwd: root, encoding: "utf8", env },
			);
			assert.equal(
				result.status,
				diagnostic ? 1 : 0,
				result.stdout + result.stderr,
			);
			if (diagnostic) assert.match(result.stdout, diagnostic);
			else
				await assert.rejects(lstat(path.join(root, "core/dist")), {
					code: "ENOENT",
				});
		});
	}
}

for (const [specifier, replacement] of [
	["@earendil-works/pi-durable/tools", "tau/durable"],
	["@earendil-works/pi-schema", "tau/schema"],
	["@earendil-works/chord/context", "tau/chord"],
	["@earendil-works/pi-ai/providers/faux", "tau/testing"],
	["@earendil-works/future", "tau"],
	["tau/dist/src/store/decisions.js", "tau"],
	["tau/server", "tau"],
	["tau-private", "tau"],
	["tau-w1", "tau"],
	["tau-w2", "tau"],
]) {
	test(`extension imports reject ${specifier} even when declared and permitted`, async (t) => {
		const { root, put, policy, extension } = await extensionFixture(t);
		const name = specifier.startsWith("@")
			? specifier.split("/").slice(0, 2).join("/")
			: specifier.split("/")[0];
		const subpath =
			specifier === name ? "." : `.${specifier.slice(name.length)}`;
		policy["tau-w2"][name] = [subpath];
		await put("boundaries.json", policy);
		await put("extensions/w2/package.json", {
			...extension,
			dependencies: { ...extension.dependencies, [name]: "0.0.0" },
		});
		for (const directory of ["src", "test"]) {
			await put(
				`extensions/w2/${directory}/access.ts`,
				`import "${specifier}";`,
			);
			const errors = await check(root);
			assert.ok(
				errors.some(
					(error) =>
						error.includes(`${directory}/access.ts: ${specifier}`) &&
						error.includes(
							directory === "src" && name === "@earendil-works/pi-ai"
								? "pi-ai is for tests only"
								: `use ${replacement}`,
						),
				),
				errors.join("\n"),
			);
		}
	});
}

for (const [label, name] of [
	["tau-private", "tau-private"],
	["tau-w1", "tau-w1"],
	["@earendil-works/pi-durable", "@earendil-works/pi-durable"],
]) {
	test(`extension manifests reject ${label} without an import`, async (t) => {
		const { root, put, extension, policy } = await extensionFixture(t);
		policy["tau-w2"][name] = ["."];
		await put("boundaries.json", policy);
		for (const field of [
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"optionalDependencies",
		]) {
			await put("extensions/w2/package.json", {
				...extension,
				[field]: { ...extension[field], [name]: "0.0.0" },
			});
			const errors = await check(root);
			assert.ok(
				errors.some(
					(error) =>
						error.includes(`forbidden dependency ${name}`) &&
						error.includes("use tau"),
				),
				errors.join("\n"),
			);
		}
	});
}

test("extensions accept only canonical facade entries with testing limited to tests", async (t) => {
	const { root, put, policy } = await extensionFixture(t);
	await put("extensions/w2/src/local.ts", "export const value = 1;");
	await put(
		"extensions/w2/src/index.ts",
		[
			"./local.ts",
			"node:fs",
			"path",
			"webfox",
			"webfox/subpath",
			"tau",
			"tau/durable",
			"tau/schema",
			"tau/chord",
		]
			.map((specifier) => `import "${specifier}";`)
			.join("\n"),
	);
	await put(
		"extensions/w2/test/access.ts",
		'import "tau/testing"; import "test-helper"; import "../src/local.ts";',
	);
	assert.deepEqual(await check(root), []);
	policy["tau-w2"]["tau"].push(
		"./testing",
		"./dist/src/index.js",
		"./schema/../testing",
	);
	await put("boundaries.json", policy);
	for (const [directory, specifier] of [
		["src", "tau/testing"],
		["src", "tau/dist/src/index.js"],
		["test", "tau/dist/src/index.js"],
		["test", "tau/schema/../testing"],
	]) {
		await put("extensions/w2/src/index.ts", "");
		await put(`extensions/w2/${directory}/index.ts`, `import "${specifier}";`);
		const errors = await check(root);
		assert.ok(
			errors.some(
				(error) =>
					error.includes(`${directory}/index.ts`) &&
					error.includes("forbidden extension import") &&
					error.includes("use tau"),
			),
			errors.join("\n"),
		);
	}
});

test("extension source pi-ai diagnostics reserve pi-ai for tests", async (t) => {
	const { root, put } = await extensionFixture(t);
	for (const specifier of [
		"@earendil-works/pi-ai",
		"@earendil-works/pi-ai/models",
	]) {
		await put("extensions/w2/src/index.ts", `import "${specifier}";`);
		const errors = (await check(root)).join("\n");
		assert.match(errors, /pi-ai is for tests only/);
		assert.doesNotMatch(errors, /use tau\/testing/);
	}
});

test("extension deep facade diagnostics name the public entry", async (t) => {
	const { root, put } = await extensionFixture(t);
	for (const entry of ["durable", "schema", "chord"]) {
		await put(
			"extensions/w2/src/index.ts",
			`import "tau/dist/src/${entry}.js";`,
		);
		assert.match(
			(await check(root)).join("\n"),
			new RegExp(`use tau/${entry}(?:$|\\n)`),
		);
	}
});

test("extensions require declared runtime dependencies and reserve devDependencies for tests", async (t) => {
	const { root, put } = await extensionFixture(t);
	for (const specifier of ["undeclared", "test-helper"]) {
		await put("extensions/w2/src/index.ts", `import "${specifier}";`);
		assert.match(
			(await check(root)).join("\n"),
			/undeclared external dependency/,
		);
	}
});

test("boundaries reject privileged, relative, and forbidden core imports", async (t) => {
	const { root, put, store } = await fixture(t);
	await put("boundaries.json", {
		tau: {},
		"tau-private": {},
		"tau-w2": { tau: ["."] },
	});
	await put("tsconfig.base.json", {});
	await put("core/tsconfig.json", {});
	await put("extensions/w2/tsconfig.json", {});
	await put("tsconfig.json", {
		references: [{ path: "core" }, { path: "extensions/w2" }],
	});
	await put("extensions/w2/package.json", {
		dependencies: { tau: "0.0.0" },
		name: "tau-w2",
	});
	await put("extensions/w2/src/index.ts", 'import "tau";\n');
	assert.equal(run("check-boundaries.mjs", root).status, 0);
	for (const [source, message] of [
		['import "tau/server";', /forbidden workspace capability/],
		['import "../../store/src/index.js";', /cross-package relative import/],
		[
			'export type Hidden = import("tau/server").Store;',
			/forbidden workspace capability/,
		],
	]) {
		await put("extensions/w2/src/index.ts", source);
		const result = run("check-boundaries.mjs", root);
		assert.equal(result.status, 1);
		assert.match(result.stderr, message);
	}
	await put("extensions/w2/src/index.ts", 'import "tau";\n');
	await put("core/package.json", {
		...store,
		dependencies: { "tau-private": "0.0.0" },
	});
	await put("core/src/index.ts", 'import "tau-private";\n');
	const result = run("check-boundaries.mjs", root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /forbidden.*(capability|dependency)/);
});

test("boundaries reject a package omitted from root project references", async (t) => {
	const { root, put } = await fixture(t);
	await put("extensions/forgotten/package.json", { name: "tau-forgotten" });
	await put("extensions/forgotten/tsconfig.json", {});
	await put("boundaries.json", { tau: {}, "tau-forgotten": {} });
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
			`core/${file}`,
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
	await put("core/test/nested/ok.test.ts", "");
	await put("core/dist/test/nested/ok.test.js", "");
	await put("core/node_modules/dep/other.spec.js", "");
	const result = run("check-boundaries.mjs", root);
	assert.equal(result.status, 0, result.stderr);
});

for (const [name, directory, specifier, allowed] of [
	...["tau-websearch", "tau-w2", "tau-w1"].flatMap((name) => [
		[name, "src", "tau/server", false],
		[name, "test", "tau/server", false],
		[name, "test", "tau/testing", true],
		[name, "src", "tau/testing", false],
		[name, "test", "tau/private", false],
		[name, "src", "tau", true],
		[name, "test", "tau", true],
	]),
	["tau-journeys", "test", "tau", true],
	["tau-journeys", "test", "tau/testing", false],
	["tau-journeys", "test", "tau/server", true],
	["tau-journeys", "test", "tau-w1", false],
]) {
	test(`${name} ${directory} import of ${specifier} is ${allowed ? "allowed" : "forbidden"}`, async (t) => {
		const { root, put } = await fixture(t);
		const repository = path.resolve(tools, "..");
		for (const file of [
			"package.json",
			"boundaries.json",
			"tsconfig.json",
			"tsconfig.base.json",
		])
			await put(file, await readFile(path.join(repository, file), "utf8"));
		const manifest = JSON.parse(
			await readFile(path.join(repository, "package.json"), "utf8"),
		);
		let target;
		for await (const workspace of glob(manifest.workspaces, {
			cwd: repository,
		})) {
			const pkg = JSON.parse(
				await readFile(
					path.join(repository, workspace, "package.json"),
					"utf8",
				),
			);
			await put(`${workspace}/package.json`, pkg);
			await put(
				`${workspace}/tsconfig.json`,
				await readFile(
					path.join(repository, workspace, "tsconfig.json"),
					"utf8",
				),
			);
			if (pkg.name === name) target = workspace;
		}
		assert.ok(target);
		await put(`${target}/${directory}/access.ts`, `import "${specifier}";`);
		const errors = (await check(root)).join("\n");
		if (allowed) assert.equal(errors, "");
		else
			assert.match(errors, /forbidden (extension import|workspace capability)/);
	});
}

for (const layer of ["store", "host", "command"]) {
	for (const directory of ["src", "test"]) {
		test(`tau ${layer} ${directory} cannot import tau author helpers`, async (t) => {
			const { root, put } = await fixture(t);
			await put(
				`core/${directory}/${layer}/index.ts`,
				`import "../../src/extension/helpers.js";`,
			);
			const result = run("check-boundaries.mjs", root);
			assert.equal(result.status, 1, result.stderr);
			assert.match(result.stderr, /forbidden core layer import/);
		});
	}
}

for (const name of ["tau-w2", "tau"]) {
	for (const directory of ["src", "test"]) {
		test(`${name} ${directory} relative import of test helper is ${directory === "test" ? "allowed" : "forbidden"}`, async (t) => {
			const { root, put, store } = await fixture(t);
			await put("core/package.json", {
				...store,
				exports: { ...store.exports, "./testing": "./dist/src/testing.js" },
			});
			await put("boundaries.json", {
				tau: {},
				"tau-w2": { testOnly: { tau: ["./testing"] } },
			});
			const pkg = name === "tau-w2" ? "extensions/w2" : "core";
			if (pkg === "extensions/w2") {
				await put("extensions/w2/package.json", {
					devDependencies: { tau: "0.0.0" },
					name,
				});
				await put("extensions/w2/tsconfig.json", {});
				await put("tsconfig.json", {
					references: [{ path: "core" }, { path: "extensions/w2" }],
				});
			}
			await put(`${pkg}/test/helper.ts`, 'export * from "tau/testing";');
			await put(
				`${pkg}/${directory}/index.ts`,
				'export * from "../test/helper.js";',
			);
			const result = run("check-boundaries.mjs", root);
			assert.equal(result.status, directory === "test" ? 0 : 1, result.stderr);
			if (directory === "src")
				assert.match(result.stderr, /source import of tests forbidden/);
		});
	}
}

for (const source of [
	'import m from "node:module"; const { createRequire: r } = m; r(import.meta.url)("tau/server");',
	'import m from "node:module"; m["createRequire"](import.meta.url)("tau/server");',
	'const r = process.getBuiltinModule("module")["create" + "Require"]; r(import.meta.url)("tau/server");',
	'export { createRequire } from "node:module";',
	'const { getBuiltinModule: load } = process; load("module");',
	'process["getBuiltinModule"]("module");',
	'import { createRequire as load } from "node:module"; load(import.meta.url)("tau/server");',
	'import { createRequire as load } from "module";',
	'import m from "node:module"; m.createRequire(import.meta.url)("tau/server");',
	'import * as m from "module"; m.createRequire(import.meta.url)("tau/server");',
]) {
	for (const directory of ["src", "test"]) {
		test(`boundaries reject CommonJS escape in ${directory}: ${source}`, async (t) => {
			const { root, put } = await fixture(t);
			await put(`core/${directory}/index.ts`, source);
			const result = run("check-boundaries.mjs", root);
			assert.equal(result.status, 1);
			assert.match(result.stderr, /CommonJS escape forbidden/);
		});
	}
}

test("test selection refuses missing emitted files before running any tests", async (t) => {
	const { root, put } = await fixture(t);
	await put("core/test/missing.test.ts", "");
	await put("core/test/present.test.ts", "");
	await put("core/dist/test/present.test.js", 'console.log("TEST_RAN");');
	for (const selections of [[], ["tau"], ["core/test/missing.test.ts"]]) {
		const result = run("tests.mjs", root, ...selections);
		assert.equal(result.status, 1);
		assert.match(
			result.stderr,
			/missing emitted test.*core\/dist\/test\/missing.test.js/,
		);
		assert.doesNotMatch(result.stdout, /TEST_RAN/);
	}
});

for (const name of ["tau", "@tau/store"]) {
	test(`linking removes the stale managed workspace link ${name}`, async (t) => {
		const { root, put, store } = await fixture(t);
		await put("core/package.json", { ...store, name });
		await put("external/library/package.json", { name: "library" });
		const external = path.join(root, "external");
		assert.equal(run("link-node-modules.mjs", root, external).status, 0);
		await rm(path.join(root, "core"), { recursive: true });
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

for (const name of ["library", "@scope/library"]) {
	test(`linking removes the stale managed external link ${name} after the dependency set changes`, async (t) => {
		const { root, put } = await fixture(t);
		await put(`external-old/${name}/package.json`, { name });
		await put("external-new/kept/package.json", { name: "kept" });
		assert.equal(
			run("link-node-modules.mjs", root, path.join(root, "external-old"))
				.status,
			0,
		);
		assert.equal(
			run("link-node-modules.mjs", root, path.join(root, "external-new"))
				.status,
			0,
		);
		await assert.rejects(lstat(path.join(root, "node_modules", name)), {
			code: "ENOENT",
		});
		assert.equal(
			await realpath(path.join(root, "node_modules/kept")),
			path.join(root, "external-new/kept"),
		);
	});
}

function run(script, root, ...args) {
	return spawnSync(process.execPath, [path.join(tools, script), ...args], {
		cwd: root,
		encoding: "utf8",
		env,
		timeout: 10000,
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
	await put("core/package.json", { ...store, version: "0.0.1" });
	result = run("check-lock.mjs", root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /core\/package.json.*version/);
});

test("links resolve external dependencies and live workspace output without installing", async (t) => {
	const { root, put } = await fixture(t);
	await put("external/@scope/library/package.json", {
		exports: "./index.js",
		name: "@scope/library",
		type: "module",
	});
	await put("external/@scope/library/index.js", "export default 7;\n");
	await put("core/dist/src/index.js", "export const value = 1;\n");
	const external = path.join(root, "external");
	assert.equal(run("link-node-modules.mjs", root, external).status, 0);
	assert.equal(
		await realpath(path.join(root, "node_modules/tau")),
		path.join(root, "core"),
	);
	assert.equal(
		await realpath(path.join(root, "node_modules/@scope/library")),
		path.join(external, "@scope/library"),
	);
	await put(
		"probe.mjs",
		'import { value } from "tau"; import external from "@scope/library"; console.log(String(value) + " " + String(external));\n',
	);
	const probe = () =>
		spawnSync(process.execPath, ["probe.mjs"], { cwd: root, encoding: "utf8" });
	assert.equal(probe().stdout.trim(), "1 7");
	await put("core/dist/src/index.js", "export const value = 2;\n");
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
	await put("core/test/first.test.ts", "");
	await put("core/test/second.test.ts", "");
	await put(
		"core/dist/test/first.test.js",
		'import { test } from "node:test"; test("selected first", () => {});\n',
	);
	await put(
		"core/dist/test/second.test.js",
		'import { test } from "node:test"; test("selected second", () => {});\n',
	);
	for (const selection of ["core", "tau"]) {
		const result = run("tests.mjs", root, selection);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /selected first/);
		assert.match(result.stdout, /selected second/);
	}
	const result = run("tests.mjs", root, "core/test/first.test.ts");
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /selected first/);
	assert.doesNotMatch(result.stdout, /selected second/);
	for (const [label, caller, selection, count] of [
		["relative file", "core", "test/first.test.ts", 1],
		["parent path", "extensions/w2", "../../core/test/first.test.ts", 1],
		["directory", "core", "test", 2],
		["missing path", "core", "test/absent.test.ts", 0],
	]) {
		await t.test(label, async (row) => {
			const invocation = path.join(root, caller);
			const previous = process.env.TAU_INVOCATION_DIR;
			process.env.TAU_INVOCATION_DIR = invocation;
			row.after(() => {
				if (previous === undefined) delete process.env.TAU_INVOCATION_DIR;
				else process.env.TAU_INVOCATION_DIR = previous;
			});
			const packages = await workspaces(root);
			if (count === 0)
				assert.throws(
					() => selectPackages(packages, [selection], root),
					/no package selected/,
				);
			else
				assert.deepEqual(
					selectPackages(packages, [selection], root).map(
						(pkg) => pkg.manifest.name,
					),
					["tau"],
				);
			const result = spawnSync(
				process.execPath,
				[path.join(tools, "tests.mjs"), selection],
				{
					cwd: root,
					encoding: "utf8",
					env: { ...env, TAU_INVOCATION_DIR: invocation },
				},
			);
			assert.equal(result.status, count ? 0 : 1, result.stderr);
			if (count) assert.match(result.stdout, /selected first/);
			if (count === 2) assert.match(result.stdout, /selected second/);
			else assert.doesNotMatch(result.stdout, /selected second/);
		});
	}
	assert.equal(run("tests.mjs", root, "missing").status, 1);
	assert.equal(run("tests.mjs", root, "store", "missing").status, 1);
});
