import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { startServer } from "../src/index.js";
import { modules, WEEK } from "./extensions.js";
import { faux, start, until } from "./helpers.js";

test("invalid device configuration refuses startup before any due task runs", async () => {
	let clock = Date.UTC(2026, 10, 14);
	const s = await start({ modules, now: () => clock });
	try {
		await s.call("bind", { project: "p", workdir: "/tmp", extensions: ["flow"] });
		await s.call("setOptions", { project: "p", extension: "flow", patch: { designer: "faux/a" } });
		const conversation = (await s.call("create", { project: "p", workflow: "flow" })).body.result.conversation;
		s.faux.setResponses([
			fauxAssistantMessage([fauxToolCall("schedule", {})], { stopReason: "toolUse" }),
			fauxAssistantMessage("Scheduled."),
		]);
		await s.call("input", { project: "p", conversation, text: "Schedule.", requestId: "schedule" });
		await until("the timer sleeps", async () => JSON.stringify((await s.call("history", { project: "p", conversation })).body).includes("Scheduled."));
		await s.close();
		clock += WEEK + 1;
		const file = path.join(s.home, "devices.json");
		const good = await readFile(file, "utf8");
		await writeFile(file, "{broken");
		await assert.rejects(startServer({ home: s.home, modules, models: faux().models, port: 0, now: () => clock }));
		await writeFile(file, good);
		const missing = await s.restart({ modules: {}, now: () => clock });
		try {
			const history = await missing.call("history", { project: "p", conversation });
			assert.ok(!history.body.result.items.some((entry: { kind: string }) => entry.kind === "flow.woke"), "nothing runs during a refused start");
		} finally { await missing.close(); }
		const ready = await s.restart({ now: () => clock });
		try {
			await until("the installed extension wakes the timer", async () => (await ready.call("history", { project: "p", conversation })).body.result.items.some((entry: { kind: string }) => entry.kind === "flow.woke"));
		} finally { await ready.close(); }
	} finally { await s.close(); }
});
