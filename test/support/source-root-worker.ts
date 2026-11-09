import { readFile, writeFile } from "node:fs/promises";
import * as Effect from "effect/Effect";
import { Effects } from "../../src/effects/source.ts";

const [root, repo, input, output] = process.argv.slice(2) as [string, string, string, string];
const effects = new Effects({ root, repositories: { owned: repo } });
const { base, capture } = JSON.parse(await readFile(input, "utf8"));
const receipt = await Effect.runPromise(effects.perform({ type: "retain", base, capture }));
await writeFile(output, JSON.stringify(receipt));
