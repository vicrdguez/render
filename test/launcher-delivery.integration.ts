// The operator's journey with no hand-built `assignTask`: a saved prompt starts the coordinator, which proposes
// Ground; the human confirms it; the coordinator stages the intake and its challenger reviews it; the human accepts;
// the launcher assigns the implementer, whose Audit, preparation and Watchdog run to a qualifying integration.
// Engine, SQLite, Effects Git and Docker Linux checks run for real; a scripted provider stands in for the models.
import assert from "node:assert/strict";
import { test } from "node:test";
import { launcher } from "./support/launcher.ts";

test("a prompt reaches an integrated proposal through the launcher alone", { timeout: 600000 }, async () => {
	const t = await launcher({ linux: true, deliver: true });
	try {
		await t.prompt();
		await t.until(() => t.coordinators().length === 1, "the prompt starts the coordinator");
		await t.confirmGround();
		await t.acceptIntake();
		await t.until(() => t.view().integrated.includes("value"), "qualifying integration recorded", 480000);
		const roles: string[] = t.assignments().map((a) => a.packet.role);
		for (const role of ["coordinator", "challenger", "implementer", "audit-standards", "audit-contracts", "watchdog"])
			assert.ok(roles.includes(role), `${role} ran`);
		assert.equal(roles.filter((r) => r === "implementer").length, 1);
	} finally {
		await t.close();
	}
});
