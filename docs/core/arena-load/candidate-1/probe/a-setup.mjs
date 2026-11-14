// Builds a target-shaped copy of the three real extensions and a stand-in tau-extension surface.
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const checkout = "/tmp/c1-probe.kDWNfm/checkout";
const here = "/tmp/c1-probe.kDWNfm/p/a";
const parent = pathToFileURL(`${checkout}/package.json`).href;
const url = (s) => import.meta.resolve(s, parent);
await rm(`${here}/surface`, { recursive: true, force: true });
await rm(`${here}/real`, { recursive: true, force: true });
await rm(`${here}/home`, { recursive: true, force: true });

// The surface: one package whose exports map is the one list the aliases derive from.
await mkdir(`${here}/surface`, { recursive: true });
const files = {
	"index.js": `export { request, withdraw, emit, decision, eventLog } from ${JSON.stringify(url("tau-store"))};\nexport { options, modelRef, prose, role } from ${JSON.stringify(url("tau-kit"))};\n`,
	"durable.js": `export { defineExtension, defineTool, defineTask, defineDoc, defineEntry, configure, AgentDoc, GenerationTask, hook, runEndTask } from ${JSON.stringify(url("@earendil-works/pi-durable"))};\nexport { CodingTools } from ${JSON.stringify(url("@earendil-works/pi-durable/tools"))};\n`,
	"schema.js": `export { arr, compile, int, lit, num, obj, oneOf, opt, str } from ${JSON.stringify(url("@earendil-works/pi-schema"))};\n`,
	"chord.js": `export { BACKGROUND_CONTEXT } from ${JSON.stringify(url("@earendil-works/chord/context"))};\n`,
	"testing.js": `export { answer as fauxAnswer } from ${JSON.stringify(url("tau-store/host"))};\n`,
};
for (const [name, text] of Object.entries(files)) await writeFile(`${here}/surface/${name}`, text);
await writeFile(
	`${here}/surface/package.json`,
	JSON.stringify({
		name: "tau-extension",
		type: "module",
		exports: {
			".": { import: "./index.js" },
			"./durable": { import: "./durable.js" },
			"./schema": { import: "./schema.js" },
			"./chord": { import: "./chord.js" },
			"./testing": { import: "./testing.js" },
		},
	}, null, "\t"),
);

// Target-shaped sources: every import of tau-store, tau-kit and pi goes through the surface, relative specifiers end in .ts.
const map = {
	"tau-store": "tau-extension",
	"tau-kit": "tau-extension",
	"@earendil-works/pi-durable": "tau-extension/durable",
	"@earendil-works/pi-durable/tools": "tau-extension/durable",
	"@earendil-works/pi-schema": "tau-extension/schema",
	"@earendil-works/chord/context": "tau-extension/chord",
	"@earendil-works/chord/delta": "tau-extension/chord",
};
let rewritten = 0;
for (const name of ["w1", "w2", "websearch"]) {
	const from = `${checkout}/packages/${name}/src`;
	const to = `${here}/real/${name}/src`;
	await mkdir(to, { recursive: true });
	for (const file of await readdir(from)) {
		let text = await readFile(`${from}/${file}`, "utf8");
		if (file.endsWith(".ts")) {
			text = text.replace(/from "([^"]+)"/g, (whole, spec) => {
				if (spec.startsWith("./")) { rewritten++; return `from "${spec.replace(/\.js$/, ".ts")}"`; }
				if (map[spec]) { rewritten++; return `from "${map[spec]}"`; }
				return whole;
			});
		}
		await writeFile(`${to}/${file}`, text);
	}
	await writeFile(`${here}/real/${name}/index.ts`, `export * from "./src/index.ts";\n`);
}
await writeFile(`${here}/real/websearch/package.json`, JSON.stringify({ name: "websearch", private: true, type: "module", dependencies: { webfox: "4.11.0" } }));
await mkdir(`${here}/real/node_modules`, { recursive: true });
await symlink(await realpath(`${checkout}/node_modules/webfox`), `${here}/real/node_modules/webfox`);
await mkdir(`${here}/home/extensions`, { recursive: true });
for (const name of ["w1", "w2", "websearch"]) await symlink(`${here}/real/${name}`, `${here}/home/extensions/${name}`);
console.log("setup", JSON.stringify({ rewritten, extensions: await readdir(`${here}/home/extensions`) }));
