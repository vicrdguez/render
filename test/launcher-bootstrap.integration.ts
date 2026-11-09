// A: the ordinary repository has no verification asset. Its intake cites no catalog; the launcher still assigns the
// implementer, which authors `.render/verify.md` through the existing bootstrap path and reaches integration.
import assert from "node:assert/strict";
import { test } from "node:test";
import { launcher } from "./support/launcher.ts";
import { git } from "./support/source.ts";

test("a repository with no verification asset reaches integration through the launcher", { timeout: 600000 }, async () => {
	const t = await launcher({ linux: true, deliver: true, bare: true });
	try {
		assert.equal(git(t.f.source.repo, ["ls-tree", t.pinned, ".render/verify.md"]).toString(), "", "no asset at the base");
		await t.prompt("Change the value file from A to B");
		await t.confirmGround();
		await t.acceptIntake();
		await t.until(() => t.assignments().some((a) => a.packet.role === "implementer"), "implementer launched", 60000);
		const writer = t.assignments().find((a) => a.packet.role === "implementer")!;
		assert.equal(writer.packet.verification?.path, ".render/verify.md");
		assert.deepEqual([...(writer.packet.verification?.rows ?? [])].sort(), ["full-suite", "lint", "typecheck", "value"]);
		await t.until(() => t.view().integrated.includes("value"), "qualifying integration recorded", 480000);
	} finally {
		await t.close();
	}
});
