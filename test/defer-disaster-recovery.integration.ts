import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { HOST_MAIN, startHost, tempDir } from "./support/host.ts";

test("host rejects removed management arguments and starts ordinarily", async () => {
	const dir = await tempDir("no-disaster");
	try {
		for (const args of [
			["restore", "--data", dir.path],
			["backup-receive", "--data", dir.path],
			["serve", "--data", dir.path, "--package", "unused"],
		]) {
			const result = spawnSync(process.execPath, [HOST_MAIN, ...args], { encoding: "utf8", timeout: 5000 });
			assert.notEqual(result.status, 0, "removed CLI must not succeed");
			assert.match(result.stderr, /usage:|Unknown option/, "removed CLI must use ordinary argument refusal");
		}
		const h = await startHost(dir.path);
		await h.stop();
	} finally {
		await dir.remove();
	}
});
