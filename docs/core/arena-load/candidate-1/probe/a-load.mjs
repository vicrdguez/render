// Loads the three target-shaped real extensions through a loader-shaped jiti call.
// Measures: aliases derived from the surface's exports map; .ts relative specifiers; symlinked directories with and
// without realpath; webfox from the real path; load time with fsCache off and on; re-import cost; identity.
import { mkdtemp, readFile, readdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "/tmp/c1-probe.kDWNfm/p/node_modules/jiti/lib/jiti.mjs";

const here = "/tmp/c1-probe.kDWNfm/p/a";
const checkout = "/tmp/c1-probe.kDWNfm/checkout";
const parent = pathToFileURL(`${checkout}/package.json`).href;
const native = (s) => import(import.meta.resolve(s, parent));

// The one list: the surface's exports map, minus ./testing.
const surface = JSON.parse(await readFile(`${here}/surface/package.json`, "utf8"));
const alias = Object.fromEntries(
	Object.entries(surface.exports)
		.filter(([subpath]) => subpath !== "./testing")
		.map(([subpath, target]) => [surface.name + subpath.slice(1), path.join(`${here}/surface`, target.import)]),
);
console.log("aliases", JSON.stringify(alias));
const fresh = (fsCache) => createJiti(import.meta.url, { moduleCache: false, fsCache, alias });

const dir = `${here}/home/extensions`;
const time = async (jiti, file) => {
	const t = performance.now();
	const ns = await jiti.import(file);
	return { ms: +(performance.now() - t).toFixed(1), ns };
};

// 1. websearch through the symlink path, then through its real path.
for (const how of ["symlink", "realpath"]) {
	const link = path.join(dir, "websearch", "index.ts");
	const file = how === "symlink" ? link : await realpath(link);
	try {
		const { ms, ns } = await time(fresh(false), file);
		console.log("websearch via", how, JSON.stringify({ ok: true, ms, name: ns.extension?.name }));
	} catch (error) {
		console.log("websearch via", how, JSON.stringify({ ok: false, error: String(error.message).split("\n")[0] }));
	}
}

// 2. All three, realpath, fsCache off: first import, then re-import (as reload does).
const jiti = fresh(false);
const loaded = {};
for (const name of (await readdir(dir)).sort()) {
	const file = await realpath(path.join(dir, name, "index.ts"));
	const first = await time(jiti, file);
	const again = await time(jiti, file);
	loaded[name] = first.ns;
	console.log("load fsCache=false", name, JSON.stringify({ first: first.ms, reimport: again.ms, exports: Object.keys(first.ns).sort(), distinct: first.ns.extension !== again.ns.extension }));
}

// 3. fsCache on, in a private directory: cold then warm, each in a fresh jiti.
const cache = await mkdtemp(path.join(tmpdir(), "c1-jiti-cache-"));
for (const round of ["cold", "warm"]) {
	const j = fresh(cache);
	const out = {};
	for (const name of ["w1", "w2", "websearch"]) out[name] = (await time(j, await realpath(path.join(dir, name, "index.ts")))).ms;
	console.log(`load fsCache=dir ${round}`, JSON.stringify(out));
}

// 4. Identity with the host's running copies and a scratch registry install (the reload's dry run).
const durable = await native("@earendil-works/pi-durable");
const tools = await native("@earendil-works/pi-durable/tools");
const store = await native("tau-store");
const surfaceIndex = await import(alias["tau-extension"]);
const registry = durable.createRegistry();
registry.install(tools.CodingTools);
for (const name of ["websearch", "w2", "w1"]) registry.install(loaded[name].extension);
console.log("scratch registry", JSON.stringify({ installed: registry.snapshot().installed().map((e) => e.name), tasks: registry.snapshot().tasks().length }));
const surfaceDurable = await import(alias["tau-extension/durable"]);
console.log("identity", JSON.stringify({ request: surfaceIndex.request === store.request, CodingTools: surfaceDurable.CodingTools === tools.CodingTools }));
// Collision: a second module that defines a task named like one of W2's.
const clash = durable.defineExtension({ name: "clash", tasks: [durable.defineTask({ name: "w2.due", version: 1, initial: () => ({ phase: "a" }), phases: { a: async () => ({ status: "terminal", outcome: { status: "completed", result: null } }) } })] });
try { registry.install(clash); console.log("collision", "installed"); } catch (error) { console.log("collision refused", JSON.stringify(error.message)); }
console.log("after refused install", JSON.stringify(registry.snapshot().installed().map((e) => e.name)));
