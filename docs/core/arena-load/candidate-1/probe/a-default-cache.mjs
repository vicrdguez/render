// Where jiti 2.7.0 writes transformed code with its default fsCache, for a loader whose own file has no node_modules beside it.
import { readdir, stat } from "node:fs/promises";
import { createJiti } from "/tmp/c1-probe.kDWNfm/p/node_modules/jiti/lib/jiti.mjs";
const here = "/tmp/c1-probe.kDWNfm/p/a";
const alias = { "tau-extension": `${here}/surface/index.js`, "tau-extension/durable": `${here}/surface/durable.js`, "tau-extension/schema": `${here}/surface/schema.js`, "tau-extension/chord": `${here}/surface/chord.js` };
const jiti = createJiti(import.meta.url, { moduleCache: false, alias });
await jiti.import(`${here}/real/w2/index.ts`);
const dir = `${process.env.TMPDIR}/jiti`;
const files = await readdir(dir);
console.log("default fsCache", JSON.stringify({ dir, files: files.length, mode: ((await stat(dir)).mode & 0o777).toString(8), sample: files.slice(0, 2) }));
