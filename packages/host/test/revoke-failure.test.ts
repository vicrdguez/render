import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

for (const alreadyRevoked of [false, true]) {
	test(
		alreadyRevoked
			? "a failed repeated revoke preserves the earlier revocation across restart"
			: "concurrent revokes serialize rollback before a successful write",
		() => {
			const child = spawnSync(
				process.execPath,
				[
					"--input-type=module",
					"-e",
					`
			import assert from "node:assert/strict";
			import fs from "node:fs/promises";
			import { syncBuiltinESMExports } from "node:module";
			import { tmpdir } from "node:os";
			import { join } from "node:path";
			const { Devices } = await import(${JSON.stringify(new URL("../src/devices.js", import.meta.url).href)});
			const home = await fs.mkdtemp(join(tmpdir(), "tau-revoke-"));
			try {
				const devices = await Devices.load(home, () => 123);
				const issued = devices.issue("phone");
				const paired = await devices.pair(issued.code);
				const auth = "Bearer " + paired.token;
				const ends = [];
				devices.attach("phone", (reason) => ends.push(reason));
				if (${alreadyRevoked}) await devices.revoke("phone");
				const write = fs.writeFile;
				let failures = 1;
				fs.writeFile = async (...args) => {
					if (failures-- > 0) throw Object.assign(new Error("EIO injected"), { code: "EIO" });
					return write(...args);
				};
				syncBuiltinESMExports();
				const failed = assert.rejects(devices.revoke("phone"), /EIO injected/);
				if (${alreadyRevoked}) {
					await failed;
				} else {
					const succeeded = devices.revoke("phone");
					await failed;
					assert.deepEqual(await succeeded, { done: true });
				}
				assert.deepEqual(ends, ["revoked"]);
				assert.equal(devices.authenticate(auth), undefined);
				assert.equal(devices.list()[0]?.revokedAt, 123);
				assert.equal((await Devices.load(home, () => 456)).authenticate(auth), undefined);
			} finally { await fs.rm(home, { recursive: true, force: true }); }
		`,
				],
				{ encoding: "utf8", timeout: 10000 },
			);
			assert.equal(child.status, 0, child.stderr);
		},
	);
}
