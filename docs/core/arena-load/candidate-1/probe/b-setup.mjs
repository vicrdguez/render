// A stand-in tau-extension (built TS, composite) and the real W2 rewritten to the target shape: imports only
// tau-extension, `.ts` relative specifiers, a root index.ts, tests run from source.
import { cp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

const checkout = "/tmp/c1-probe.kDWNfm/checkout";
const here = "/tmp/c1-probe.kDWNfm/p/b";
for (const d of ["surface", "extensions", "node_modules"]) await rm(`${here}/${d}`, { recursive: true, force: true });

// node_modules: the host's copies, and tau-extension linked to the stand-in.
const link = async (name, target) => {
	await mkdir(path.dirname(`${here}/node_modules/${name}`), { recursive: true });
	await symlink(target, `${here}/node_modules/${name}`);
};
for (const name of ["@earendil-works/pi-durable", "@earendil-works/pi-schema", "@earendil-works/pi-ai", "@earendil-works/chord", "typescript", "@types/node"])
	await link(name, await realpath(`${checkout}/node_modules/${name}`));
await link("tau-store", `${checkout}/packages/store`);
await link("tau-kit", `${checkout}/packages/kit`);
await link("tau-extension", `${here}/surface`);

// The stand-in surface. Each name in exactly one entry.
await mkdir(`${here}/surface/src`, { recursive: true });
const entry = (name) => ({ types: `./dist/src/${name}.d.ts`, import: `./dist/src/${name}.js` });
await writeFile(`${here}/surface/package.json`, JSON.stringify({
	name: "tau-extension", private: true, type: "module",
	exports: { ".": entry("index"), "./durable": entry("durable"), "./schema": entry("schema"), "./chord": entry("chord"), "./testing": entry("testing") },
}, null, "\t"));
await writeFile(`${here}/surface/tsconfig.json`, JSON.stringify({
	extends: `${checkout}/tsconfig.base.json`,
	compilerOptions: { rootDir: ".", outDir: "dist", tsBuildInfoFile: "dist/build.tsbuildinfo" },
	include: ["src/**/*.ts"],
	references: [{ path: `${checkout}/packages/store` }, { path: `${checkout}/packages/kit` }],
}, null, "\t"));
const src = {
	index: `export type { Annotation, Decision, DecisionId, DecisionInput, DeviceId, EventData, RequestDraft } from "tau-store";
export { decision, emit, eventLog, request, withdraw } from "tau-store";
export type { RoleSettings } from "tau-kit";
export { modelRef, options, prose, role } from "tau-kit";
`,
	durable: `export type { AgentChange, Conversation, ConversationId, Cursor, EntryId, EntryRecord, JsonObject, Registry, Storage, TaskId, Tx } from "@earendil-works/pi-durable";
export { configure, createRegistry, defineDoc, defineEntry, defineExtension, defineTask, defineTool, Harness, MemoryStorage } from "@earendil-works/pi-durable";
export { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
export { CodingTools } from "@earendil-works/pi-durable/tools";
`,
	schema: `export { int, num, obj, str } from "@earendil-works/pi-schema";
`,
	chord: `export { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
`,
	testing: `import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { DecisionId } from "tau-store";
import { type AnswerInput, type AnswerResult, answer, openStore, type Store } from "tau-store/host";
/** No paired device can have this name: a device name matches ^[a-z][a-z0-9-]{0,31}$. */
export const FAUX_DEVICE = "test:faux";
/** The real answer, with the faux device. */
export const fauxAnswer = (store: Store, id: DecisionId, input: AnswerInput): Promise<AnswerResult> =>
	answer(store, id, input, FAUX_DEVICE, BACKGROUND_CONTEXT);
export { openStore, type Store };
export { createModels } from "@earendil-works/pi-ai/models";
export { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
`,
};
for (const [name, text] of Object.entries(src)) await writeFile(`${here}/surface/src/${name}.ts`, text);

// W2 in the target shape.
const map = {
	"tau-store": "tau-extension", "tau-kit": "tau-extension", "tau-store/host": "tau-extension/testing",
	"@earendil-works/pi-durable": "tau-extension/durable", "@earendil-works/pi-durable/tools": "tau-extension/durable",
	"@earendil-works/pi-durable/storage/sqlite/node": "tau-extension/durable",
	"@earendil-works/pi-schema": "tau-extension/schema", "@earendil-works/chord/context": "tau-extension/chord",
	"@earendil-works/pi-ai/models": "tau-extension/testing", "@earendil-works/pi-ai/providers/faux": "tau-extension/testing",
};
const w2 = `${here}/extensions/w2`;
await cp(`${checkout}/packages/w2/src`, `${w2}/src`, { recursive: true });
await cp(`${checkout}/packages/w2/test`, `${w2}/test`, { recursive: true });
let files = 0;
const rewrite = async (dir) => {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) { await rewrite(file); continue; }
		if (!file.endsWith(".ts")) continue;
		let text = await readFile(file, "utf8");
		text = text.replace(/from "([^"]+)"/g, (whole, spec) =>
			spec.startsWith(".") ? `from "${spec.replace(/\.js$/, ".ts")}"` : map[spec] ? `from "${map[spec]}"` : whole);
		text = text.replace(/"\.\/fixtures\/crash\.js"/, '"./fixtures/crash.ts"');
		text = text.replace("import { answer, openStore, type Store }", "import { fauxAnswer, openStore, type Store }");
		text = text.replace(/answer\(\s*store,\s*id,\s*(\{ basis: d\.basis, choice, annotations: \[\] \}),\s*"phone",\s*context,\s*\)/, "fauxAnswer(store, id, $1)");
		await writeFile(file, text);
		files++;
	}
};
await rewrite(w2);
await writeFile(`${w2}/index.ts`, `export * from "./src/index.ts";\n`);
await writeFile(`${w2}/package.json`, JSON.stringify({ name: "tau-w2", private: true, type: "module", dependencies: { "tau-extension": "0.0.0" } }, null, "\t"));
await writeFile(`${w2}/tsconfig.json`, JSON.stringify({
	extends: `${checkout}/tsconfig.base.json`,
	compilerOptions: { composite: false, declaration: false, sourceMap: false, noEmit: true, allowImportingTsExtensions: true, erasableSyntaxOnly: true, tsBuildInfoFile: "../../tsbuildinfo-w2" },
	include: ["index.ts", "src/**/*.ts", "test/**/*.ts"],
	references: [{ path: "../../surface" }],
}, null, "\t"));
console.log("setup", JSON.stringify({ rewrittenFiles: files }));
