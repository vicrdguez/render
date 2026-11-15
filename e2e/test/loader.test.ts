import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { defineTask } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import { request } from "tau";
import { type ExtensionScan, fromDirectory } from "tau/server";
import { type Journey, journey as start, until } from "./journey.ts";

type Reply = Awaited<ReturnType<Journey["call"]>>;

const TESTING =
	"tau/testing is for tests. An extension cannot import it at run time.";
const root = fileURLToPath(new URL("../../", import.meta.url));

const scratch = () => mkdtemp(path.join(tmpdir(), "tau-loader-"));

async function write(
	folder: string,
	files: Readonly<Record<string, string>>,
): Promise<string> {
	for (const [name, text] of Object.entries(files)) {
		const file = path.join(folder, name);
		await mkdir(path.dirname(file), { recursive: true, mode: 0o755 });
		await writeFile(file, text, { mode: 0o644 });
	}
	return folder;
}

const plain = (name: string, extra = "") =>
	`import { defineExtension } from "tau/durable";\nexport const extension = defineExtension({ name: ${JSON.stringify(name)} });\n${extra}`;

async function directory(
	extensions: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Promise<string> {
	const dir = await scratch();
	for (const [name, files] of Object.entries(extensions))
		await write(path.join(dir, name), files);
	return dir;
}

function failure(scan: ExtensionScan, name: string) {
	const found = scan.failures.filter((f) => f.name === name);
	assert.equal(found.length, 1, `${name}: ${JSON.stringify(scan.failures)}`);
	const [only] = found;
	assert.ok(only);
	return {
		...only,
		message: only.error instanceof Error ? only.error.message : "",
	};
}

const extensionName = (value: unknown) =>
	(value as { extension: { name: string } }).extension.name;

test("a directory source lists extension folders in sorted name order and skips dot entries and node_modules", async () => {
	const dir = await directory({
		beta: { "index.ts": plain("beta") },
		alpha: { "index.ts": plain("alpha") },
		".hidden": { "index.ts": "throw new Error('hidden ran');\n" },
		node_modules: { "index.ts": "throw new Error('node_modules ran');\n" },
	});
	await writeFile(path.join(dir, ".notes"), "x", { mode: 0o644 });
	await symlink(
		"/missing-install-output",
		path.join(dir, ".w2-00000000-0000-4000-8000-000000000000"),
	);
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.deepEqual(Object.keys(scan.modules), ["alpha", "beta"]);
	assert.equal(extensionName(scan.modules.alpha), "alpha");
});

test("an absent directory is created with mode 0700 and loads nothing", async () => {
	const dir = path.join(await scratch(), "home", "extensions");
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan, { modules: {}, failures: [] });
	assert.equal((await stat(dir)).mode & 0o777, 0o700);
});

test("an entry that is not a readable folder holding index.ts fails alone and never rejects the scan", async () => {
	const dir = await directory({
		alpha: { "index.ts": plain("alpha") },
		empty: { "README.md": "no index\n" },
		locked: { "index.ts": plain("locked"), "lib/helper.ts": "" },
	});
	await writeFile(path.join(dir, "single.ts"), plain("single"), {
		mode: 0o644,
	});
	await symlink(path.join(dir, "nowhere"), path.join(dir, "gone"));
	await chmod(path.join(dir, "locked", "lib"), 0o000);
	try {
		const scan = await fromDirectory(dir)();
		assert.deepEqual(Object.keys(scan.modules), ["alpha"]);
		for (const name of ["empty", "gone", "locked", "single.ts"]) {
			const f = failure(scan, name);
			assert.equal(f.path, path.join(dir, name));
			assert.ok(f.message.length > 0, name);
		}
		assert.match(failure(scan, "empty").message, /index\.ts/);
		assert.match(failure(scan, "single.ts").message, /folder/);
		assert.equal(scan.failures.length, 4);
	} finally {
		await chmod(path.join(dir, "locked", "lib"), 0o755);
	}
});

test("a symlink to a folder elsewhere loads under the link's name", async () => {
	const elsewhere = await write(await scratch(), {
		"index.ts": plain("linked"),
	});
	const dir = await scratch();
	await symlink(elsewhere, path.join(dir, "linked"));
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.equal(extensionName(scan.modules.linked), "linked");
});

test("a JavaScript file outside node_modules and dot folders fails its extension", async () => {
	const kinds = ["js", "mjs", "cjs", "jsx"];
	const dir = await directory({
		fine: {
			"index.ts": plain("fine"),
			"node_modules/dep/index.js": "export const x = 1;\n",
			".cache/old.js": "export const x = 1;\n",
		},
		...Object.fromEntries(
			kinds.map((kind) => [
				`with-${kind}`,
				{ "index.ts": plain(`with-${kind}`), [`lib/helper.${kind}`]: "" },
			]),
		),
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(Object.keys(scan.modules), ["fine"]);
	for (const kind of kinds) {
		const f = failure(scan, `with-${kind}`);
		assert.match(f.message, new RegExp(`lib/helper\\.${kind} is JavaScript`));
		assert.match(f.message, /Only TypeScript is read again on reload/);
	}
});

test("a group- and other-writable extensions folder loads without changing its mode", async () => {
	const dir = await directory({ alpha: { "index.ts": plain("alpha") } });
	await chmod(dir, 0o777);
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.equal(extensionName(scan.modules.alpha), "alpha");
	assert.equal((await stat(dir)).mode & 0o777, 0o777);
});

for (const kind of ["file", "unreadable folder"]) {
	test(`an extensions path that is a ${kind} reports one failure and the server serves empty`, async (t) => {
		const dir = path.join(await scratch(), "extensions");
		if (kind === "file") await writeFile(dir, "");
		else {
			await mkdir(dir);
			await chmod(dir, 0o000);
			t.after(() => chmod(dir, 0o700));
		}
		const scan = await fromDirectory(dir)();
		assert.deepEqual(scan.modules, {});
		assert.equal(scan.failures.length, 1);
		const f = failure(scan, "*");
		assert.equal(f.path, dir);
		assert.equal(f.stage, "scan");
		assert.match(f.message, kind === "file" ? /not a folder/ : /EACCES/);
		const stderr: string[] = [];
		t.mock.method(process.stderr, "write", (chunk: string) => {
			stderr.push(String(chunk));
			return true;
		});
		const s = await start({ source: fromDirectory(dir) });
		try {
			assert.deepEqual((await s.ok("extensions", {})).items, []);
			assert.equal(stderr.length, 1, JSON.stringify(stderr));
			assert.ok(stderr[0]?.includes(dir), JSON.stringify(stderr));
			assert.match(stderr[0]!, kind === "file" ? /not a folder/ : /EACCES/);
		} finally {
			await s.close();
		}
	});
}

test("group-writable extension folders and files load alongside other extensions", async () => {
	const dir = await directory({
		alpha: { "index.ts": plain("alpha") },
		"loose-folder": { "index.ts": plain("loose-folder") },
		"loose-file": {
			"index.ts": plain("loose-file", 'export { value } from "./lib/a.ts";'),
			"lib/a.ts": "export const value = 42;",
		},
		"loose-modules": {
			"index.ts": plain("loose-modules"),
			"node_modules/dep/index.ts": "",
		},
		"deep-modules": {
			"index.ts": plain("deep-modules"),
			"node_modules/dep/index.ts": "",
		},
	});
	await chmod(path.join(dir, "loose-folder"), 0o777);
	await chmod(path.join(dir, "loose-file", "index.ts"), 0o664);
	await chmod(path.join(dir, "loose-file", "lib", "a.ts"), 0o666);
	await chmod(path.join(dir, "loose-modules", "node_modules"), 0o777);
	await chmod(path.join(dir, "deep-modules", "node_modules", "dep"), 0o777);
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.deepEqual(Object.keys(scan.modules), [
		"alpha",
		"deep-modules",
		"loose-file",
		"loose-folder",
		"loose-modules",
	]);
	assert.equal((scan.modules["loose-file"] as { value: number }).value, 42);
});

test("the old tau-extension package name points authors to the four tau entries", async () => {
	for (const specifier of ["tau-extension", "tau-extension/durable"]) {
		const dir = await directory({
			old: {
				"index.ts": `import * as old from "${specifier}"; export { old };`,
			},
			good: { "index.ts": plain("good") },
		});
		const scan = await fromDirectory(dir)();
		assert.deepEqual(Object.keys(scan.modules), ["good"]);
		const f = failure(scan, "old");
		assert.equal(f.stage, "import");
		assert.ok(f.message.includes(specifier), f.message);
		assert.match(
			f.message,
			/The package is now tau\. Use a canonical entry: tau, tau\/durable, tau\/schema, tau\/chord\./,
		);
	}
});

test("an extension outside the repository gets the host's own request, defineTask and obj", async (t) => {
	const dir = await directory({
		same: {
			"index.ts": plain(
				"same",
				`import { request } from "tau";\nimport { defineTask } from "tau/durable";\nimport { obj } from "tau/schema";\nexport const got = { request, defineTask, obj };\n`,
			),
		},
	});
	const begun = performance.now();
	const scan = await fromDirectory(dir)();
	t.diagnostic(
		`one extension loaded in ${(performance.now() - begun).toFixed(1)} ms`,
	);
	assert.deepEqual(scan.failures, []);
	const { got } = scan.modules.same as {
		got: { request: unknown; defineTask: unknown; obj: unknown };
	};
	assert.equal(got.request, request);
	assert.equal(got.defineTask, defineTask);
	assert.equal(got.obj, obj);
});

test("an extension that imports tau/server fails with the server message", async () => {
	const dir = await directory({
		cheat: {
			"index.ts":
				'import { startServer } from "tau/server"; export const used = startServer;',
		},
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.modules, {});
	assert.equal(failure(scan, "cheat").stage, "import");
	assert.equal(
		failure(scan, "cheat").message,
		"tau/server is for starting a server. An extension cannot import it at run time.",
	);
});

test("the four tau author entries give every host value to an outside extension", async () => {
	const entries = ["tau", "tau/durable", "tau/schema", "tau/chord"];
	const dir = await directory({
		same: {
			"index.ts":
				entries
					.map((entry, i) => `import * as a${i} from ${JSON.stringify(entry)};`)
					.join("\n") + "\nexport const got = [a0, a1, a2, a3];",
		},
	});
	const script = `import assert from 'node:assert/strict';
const {fromDirectory} = await import('tau/server');
const scan = await fromDirectory(${JSON.stringify(dir)})();
assert.deepEqual(scan.failures, []);
for (const [i, entry] of ${JSON.stringify(entries)}.entries()) {
 const expected = await import(entry);
 assert.deepEqual(Object.keys(scan.modules.same.got[i]).sort(), Object.keys(expected).sort());
 for (const [name, value] of Object.entries(expected)) assert.equal(scan.modules.same.got[i][name], value, entry + '.' + name);
}`;
	const child = spawnSync(
		process.execPath,
		["--input-type=module", "--eval", script],
		{ encoding: "utf8" },
	);
	assert.equal(child.status, 0, child.stderr);
});

test("tau-helpers as an extension dependency loads", async () => {
	const dir = await directory({
		good: {
			"index.ts": 'import { value } from "tau-helpers"; export { value };',
			"node_modules/tau-helpers/package.json": JSON.stringify({
				name: "tau-helpers",
				type: "module",
				exports: "./index.js",
			}),
			"node_modules/tau-helpers/index.js": "export const value = 42;",
		},
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.equal((scan.modules.good as { value: number }).value, 42);
});

test("an extension that imports tau/testing fails with the testing message", async () => {
	const dir = await directory({
		cheat: {
			"index.ts": plain(
				"cheat",
				`import { fauxAnswer } from "tau/testing";\nexport const used = fauxAnswer;\n`,
			),
		},
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.modules, {});
	const f = failure(scan, "cheat");
	assert.equal(f.stage, "import");
	assert.ok(f.message.includes(TESTING), f.message);
});

test("an extension that imports pi-durable directly fails to load, since no alias exists for it", async () => {
	const dir = await directory({
		direct: {
			"index.ts": `import { defineExtension } from "@earendil-works/pi-durable";\nexport const extension = defineExtension({ name: "direct" });\n`,
		},
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.modules, {});
	const f = failure(scan, "direct");
	assert.equal(f.stage, "import");
	assert.match(f.message, /Cannot find module '@earendil-works\/pi-durable'/);
});

test("a changed file is read again on the next scan", async () => {
	const dir = await directory({
		edited: {
			"index.ts": plain(
				"edited",
				`export { version } from "./lib/version.ts";\n`,
			),
			"lib/version.ts": "export const version = 1;\n",
		},
	});
	const source = fromDirectory(dir);
	const version = async () =>
		((await source()).modules.edited as { version: number }).version;
	assert.equal(await version(), 1);
	await writeFile(
		path.join(dir, "edited", "lib", "version.ts"),
		"export const version = 2;\n",
	);
	assert.equal(await version(), 2);
});

test("a scan writes no jiti cache to the system temporary directory or beside the host", async () => {
	const places = [
		path.join(tmpdir(), "jiti"),
		path.join(root, "node_modules", ".cache", "jiti"),
	];
	const snapshot = () =>
		Promise.all(
			places.map((place) => readdir(place).catch(() => "absent" as const)),
		);
	const before = await snapshot();
	const dir = await directory({
		cached: {
			"index.ts": plain("cached", `import "./lib/more.ts";\n`),
			"lib/more.ts": "export const more = 1;\n",
		},
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.deepEqual(await snapshot(), before);
});

test("a syntax error, a top-level throw and a mismatched name are left out and the server serves", async (t) => {
	const dir = await directory({
		good: { "index.ts": plain("good") },
		syntax: { "index.ts": `${plain("syntax")}export const x = ;\n` },
		throws: { "index.ts": `${plain("throws")}throw new Error("top level");\n` },
		renamed: { "index.ts": plain("other") },
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(Object.keys(scan.modules), ["good", "renamed"]);
	assert.equal(failure(scan, "syntax").stage, "import");
	assert.match(failure(scan, "throws").message, /top level/);
	const stderr: string[] = [];
	t.mock.method(process.stderr, "write", (chunk: string) => {
		stderr.push(String(chunk));
		return true;
	});
	const s = await start({ source: fromDirectory(dir) });
	try {
		const reply = await s.call("bind", {
			project: "p",
			workdir: s.home,
			extensions: ["good", "syntax", "throws", "renamed"],
		});
		assert.equal(reply.status, 200);
		assert.deepEqual(reply.body.result.project.missing, [
			"syntax",
			"throws",
			"renamed",
		]);
		assert.deepEqual(
			(await s.call("extensions", {})).body.result.items.map(
				(item: { name: string }) => item.name,
			),
			["good"],
		);
		assert.equal(stderr.length, 3, JSON.stringify(stderr));
	} finally {
		await s.close();
	}
});

test("only canonical tau specifiers load, including dynamic imports and re-exports", async (t) => {
	const manifest = JSON.parse(
		await readFile(path.join(root, "core/package.json"), "utf8"),
	);
	const canonical = Object.keys(manifest.exports)
		.filter((key) => key !== "./testing" && key !== "./server")
		.map((key) => `tau${key.slice(1)}`);
	const spellings = [
		"tau/../testing.js",
		"tau/schema/../testing.js",
		"tau/testing/../../extension/dist/src/testing.js",
		"tau/./testing",
		"tau/testing.js",
		"tau/dist/src/testing.js",
		"tau//testing",
	];
	for (const specifier of spellings) {
		for (const form of ["import", "dynamic", "export", "require", "template"]) {
			await t.test(`${form} ${specifier}`, async () => {
				const literal = JSON.stringify(specifier);
				const code =
					form === "import"
						? `import * as got from ${literal}; export { got };`
						: form === "dynamic"
							? `export const got = await import(${literal});`
							: form === "require"
								? `export const got = require(${literal});`
								: form === "template"
									? `export const got = await import(\`${specifier}\`);`
									: `export * from ${literal};`;
				const dir = await directory({
					bad: {
						"index.ts": plain("bad", `export * from './nested.ts';`),
						"nested.ts": code,
					},
					good: { "index.ts": plain("good") },
				});
				const scan = await fromDirectory(dir)();
				assert.deepEqual(Object.keys(scan.modules), ["good"]);
				const message = failure(scan, "bad").message;
				assert.ok(message.includes(specifier), message);
				assert.equal(
					/Use a canonical entry: ([^\r\n]*)/.exec(message)?.[1]?.trim(),
					`${canonical.join(", ")}.`,
					message,
				);
			});
		}
	}
});

test("a dependency whose name starts with tau is allowed", async () => {
	const dir = await directory({
		good: {
			"index.ts": plain(
				"good",
				'import { value } from "tau-helpers"; export { value };',
			),
			"node_modules/tau-helpers/package.json": JSON.stringify({
				name: "tau-helpers",
				type: "module",
				exports: "./index.js",
			}),
			"node_modules/tau-helpers/index.js": "export const value = 42;",
		},
	});
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.failures, []);
	assert.equal((scan.modules.good as { value: number }).value, 42);
});

test("every production entry in the exports map gives the host's own values", async () => {
	const manifest = JSON.parse(
		await readFile(path.join(root, "core/package.json"), "utf8"),
	);
	const entries = Object.entries(manifest.exports).filter(
		([key]) => key !== "./testing" && key !== "./server",
	);
	const imports = entries
		.map(
			([key], i) =>
				`import * as a${i} from ${JSON.stringify(`tau${key.slice(1)}`)};`,
		)
		.join("\n");
	const dir = await directory({
		same: {
			"index.ts": plain(
				"same",
				`${imports}\nexport const got = [${entries.map((_, i) => `a${i}`).join(",")}];`,
			),
		},
	});
	const script = `import assert from 'node:assert/strict';
const {fromDirectory} = await import(${JSON.stringify(import.meta.resolve("tau/server"))});
const entries = ${JSON.stringify(entries)};
const scan = await fromDirectory(${JSON.stringify(dir)})();
assert.deepEqual(scan.failures, []);
let checked = 0;
for (const [i, [key, target]] of entries.entries()) {
 const expected = await import(new URL(target.import, ${JSON.stringify(pathToFileURL(path.join(root, "core/")).href)}));
 for (const [name, value] of Object.entries(expected)) {
  assert.equal(scan.modules.same.got[i][name], value, key + '.' + name);
  checked++;
 }
}
assert.ok(checked > 0);`;
	const child = spawnSync(
		process.execPath,
		["--input-type=module", "--eval", script],
		{ encoding: "utf8" },
	);
	assert.equal(child.status, 0, child.stderr);
});

test("the first sorted folder owns a shared task even with integer names on every start", async (t) => {
	const task = `import {defineExtension, defineTask} from 'tau/durable';
const Task = defineTask({name:'shared.task',version:1,initial:()=>({phase:'run'}),phases:{run:async()=>{}},abort:async()=>{}});`;
	const dir = await directory(
		Object.fromEntries(
			["2", "10"].map((name) => [
				name,
				{
					"index.ts": `${task}export const extension = defineExtension({name:'${name}',tasks:[Task]});`,
				},
			]),
		),
	);
	const messages: string[] = [];
	t.mock.method(process.stderr, "write", (chunk: string) => {
		messages.push(String(chunk));
		return true;
	});
	for (let i = 0; i < 2; i++) {
		const s = await start({ source: fromDirectory(dir) });
		try {
			const items = (await s.call("extensions", {})).body.result.items;
			assert.deepEqual(
				items.map((item: { name: string }) => item.name),
				["10"],
			);
			assert.match(
				messages.at(-1) ?? "",
				/Task shared.task of extension 2 is already installed by extension 10/,
			);
		} finally {
			await s.close();
		}
	}
});

test("a second folder with the same real target fails and names the first", async () => {
	const dir = await directory({
		alpha: {
			"index.ts": plain(
				"alpha",
				`import {appendFileSync} from 'node:fs'; appendFileSync(import.meta.dirname + '/ran', 'x');`,
			),
		},
	});
	await symlink(path.join(dir, "alpha"), path.join(dir, "beta"));
	const scan = await fromDirectory(dir)();
	assert.deepEqual(Object.keys(scan.modules), ["alpha"]);
	assert.match(failure(scan, "beta").message, /alpha/);
	assert.equal(await readFile(path.join(dir, "alpha/ran"), "utf8"), "x");
});

test("a ts-named symlink to external JavaScript fails for helpers and index files", async () => {
	const outside = await write(await scratch(), {
		"native.js": `export const extension = {name:'index'}; export const value = 1;`,
	});
	const dir = await directory({
		helper: {
			"index.ts": plain("helper", `export {value} from './helper.ts';`),
		},
		index: { "README.md": "" },
	});
	await symlink(
		path.join(outside, "native.js"),
		path.join(dir, "helper/helper.ts"),
	);
	await symlink(
		path.join(outside, "native.js"),
		path.join(dir, "index/index.ts"),
	);
	const scan = await fromDirectory(dir)();
	assert.deepEqual(scan.modules, {});
	for (const name of ["helper", "index"]) {
		assert.equal(failure(scan, name).stage, "files");
		assert.match(
			failure(scan, name).message,
			/JavaScript.*Only TypeScript is read again on reload/,
		);
	}
});

const DEMO = `import { request } from "tau";
import { defineExtension, defineTask, defineTool } from "tau/durable";
import { obj } from "tau/schema";

type Choice = "ship" | "hold";
const Then = defineTask<{ choice: Choice }, { phase: string }, string>({
	name: "demo.then",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: {
		run: async (task, runtime, c) => {
			await runtime.commit(async (tx) => {
				await tx.appendEntry(task.conversationId, { kind: "demo.answered", data: { text: task.input.choice } });
				return { status: "terminal", outcome: { status: "completed", result: task.input.choice } };
			}, c);
		},
	},
	abort: async (_task, runtime, c) => {
		await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted", reason: "stopped" } }), c);
	},
});

export const extension = defineExtension({
	name: "demo",
	tools: [
		defineTool({
			name: "ask",
			description: "Ask the owner.",
			parameters: obj({}),
			execute: async (_args, api, c) => {
				const id = await api.commit(async (tx) => {
					const basis = await tx.appendEntry(api.conversationId, { kind: "demo.design", data: { text: "Ship it?" } });
					const asked = await request(tx, {
						subject: "demo:ship",
						title: "Ship",
						basis,
						choices: ["ship", "hold"] as const,
						conversation: api.conversationId,
						requestedAt: api.now(),
						then: Then,
					});
					return asked.id;
				}, c);
				return { output: [{ type: "text", text: id }] };
			},
		}),
	],
	tasks: [Then],
});
`;

test("a directory extension runs through startServer: its tool asks, an HTTP answer runs its then task", async () => {
	const dir = await directory({ demo: { "index.ts": DEMO } });
	const s = await start({ source: fromDirectory(dir) });
	try {
		await s.call("bind", {
			project: "p",
			workdir: s.home,
			extensions: ["demo"],
		});
		const conversation = (
			await s.call("create", { project: "p", model: "faux/a" })
		).body.result.conversation;
		s.faux.setResponses([
			fauxAssistantMessage([fauxToolCall("ask", {})], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("Asked."),
		]);
		await s.call("input", {
			project: "p",
			conversation,
			text: "Ask.",
			requestId: "ask",
		});
		let shown: Reply | undefined;
		await until("the decision opens", async () => {
			shown = await s.call("decision", {
				project: "p",
				decision: "demo:ship#1",
			});
			return shown.status === 200;
		});
		assert.equal(shown?.body.result.text, "Ship it?");
		const answered = await s.call("answer", {
			project: "p",
			decision: "demo:ship#1",
			basis: shown?.body.result.decision.basis,
			choice: "ship",
			annotations: [],
		});
		assert.equal(answered.status, 200, JSON.stringify(answered.body));
		await until("the then task runs", async () =>
			(
				await s.call("history", { project: "p", conversation })
			).body.result.items.some(
				(e: { kind: string; data?: { text?: string } }) =>
					e.kind === "demo.answered" && e.data?.text === "ship",
			),
		);
	} finally {
		await s.close();
	}
});
