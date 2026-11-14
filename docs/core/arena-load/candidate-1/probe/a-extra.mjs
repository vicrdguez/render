// (1) An alias whose target throws at import refuses tau-extension/testing at run time, as an ordinary Error.
// (2) fsCache:false writes nothing to TMPDIR or to a node_modules/.cache next to the loader.
// (3) A TS module that imports an unaliased pi package from a directory with no node_modules fails to load.
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createJiti } from "/tmp/c1-probe.kDWNfm/p/node_modules/jiti/lib/jiti.mjs";

const here = "/tmp/c1-probe.kDWNfm/p/a";
const tmp = process.env.TMPDIR;
const stub = `${here}/refused.js`;
await writeFile(stub, `throw new Error("tau-extension/testing is for tests. An extension cannot import it at run time.");\n`);
const alias = {
	"tau-extension": `${here}/surface/index.js`, "tau-extension/durable": `${here}/surface/durable.js`,
	"tau-extension/schema": `${here}/surface/schema.js`, "tau-extension/chord": `${here}/surface/chord.js`,
	"tau-extension/testing": stub,
};
const ext = await mkdtemp(path.join(tmp, "c1-ext-"));
await mkdir(`${ext}/cheat`); await mkdir(`${ext}/direct`);
await writeFile(`${ext}/cheat/index.ts`, `import { defineExtension } from "tau-extension/durable";\nimport { fauxAnswer } from "tau-extension/testing";\nexport const extension = defineExtension({ name: "cheat" });\nexport const used = typeof fauxAnswer;\n`);
await writeFile(`${ext}/direct/index.ts`, `import { defineExtension } from "@earendil-works/pi-durable";\nexport const extension = defineExtension({ name: "direct" });\n`);
const before = await readdir(tmp);
const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false, alias });
for (const name of ["cheat", "direct"]) {
	try { const ns = await jiti.import(`${ext}/${name}/index.ts`); console.log(name, JSON.stringify({ loaded: true, name: ns.extension.name })); }
	catch (error) { console.log(name, JSON.stringify({ loaded: false, type: error.constructor.name, message: String(error.message).split("\n")[0] })); }
}
await jiti.import(`${here}/real/w2/index.ts`);
const after = await readdir(tmp);
const added = after.filter((f) => !before.includes(f));
const cacheNext = await readdir(`/tmp/c1-probe.kDWNfm/p/node_modules`).then((l) => l.includes(".cache"));
console.log("fsCache:false wrote", JSON.stringify({ tmpdir: tmp, newEntries: added, jitiDirInTmp: after.includes("jiti") && !before.includes("jiti"), nodeModulesCache: cacheNext }));
