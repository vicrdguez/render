// L7: in production source only the Engine launcher constructs a host `assignTask`; lint fails anywhere else.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const BIOME = join(process.cwd(), "node_modules", ".bin", "biome");
const PROBE = 'export const command = { type: "assignTask", slice: "s", delivery: false };\n';

test("L7: an assignTask built outside the launcher fails lint; the launcher and tests pass", async () => {
	const root = await mkdtemp(join(tmpdir(), "render-lint-"));
	try {
		await cp("biome.json", join(root, "biome.json"));
		await cp("lint", join(root, "lint"), { recursive: true });
		for (const path of ["src/ledger/probe.ts", "src/engine/runtime.ts", "src/engine/playbooks.ts", "test/probe.ts"]) {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await writeFile(join(root, path), PROBE);
		}
		const run = spawnSync(BIOME, ["lint", "--vcs-enabled=false", "--max-diagnostics=50", "."], { cwd: root, encoding: "utf8" });
		const output = `${run.stdout}${run.stderr}`;
		assert.equal(run.status, 1, output);
		assert.match(output, /src\/ledger\/probe\.ts/);
		assert.match(output, /src\/engine\/runtime\.ts/);
		assert.doesNotMatch(output, /src\/engine\/playbooks\.ts/);
		assert.doesNotMatch(output, /test\/probe\.ts/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
