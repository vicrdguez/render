import assert from "node:assert/strict";
import { test } from "node:test";
import { requestAdmin } from "../src/index.js";
import { start } from "./helpers.js";

test("the inbox holds each project under its name, and a project bound later joins it", async () => {
	const s = await start();
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: [] });
		await s.call("bind", { project: "q", workdir: "/q", extensions: [] });
		const inbox = s.watch("inbox", {});
		await inbox.until((w) => w.value !== undefined, "the first frame");
		assert.equal(inbox.status, 200);
		assert.equal(inbox.headers["content-type"], "text/event-stream");
		assert.equal(inbox.headers["cache-control"], "no-store");
		assert.equal(inbox.headers["tau-protocol"], "1");
		assert.deepEqual(inbox.value, { p: {}, q: {} });
		await s.call("bind", { project: "r", workdir: "/r", extensions: [] });
		await inbox.until((w) => w.value.r !== undefined, "r to join");
		assert.deepEqual(inbox.value, { p: {}, q: {}, r: {} });
		assert.equal(inbox.frames, 2);
		inbox.close();
	} finally {
		await s.close();
	}
});

test("a clean stop ends each stream with stopping, and a revoke ends only that device's", async () => {
	const s = await start();
	try {
		const phone = await s.pair("phone");
		const mine = s.watch("inbox", {});
		const theirs = s.watch("inbox", {}, phone);
		await mine.until((w) => w.value !== undefined);
		await theirs.until((w) => w.value !== undefined);
		await requestAdmin(s.home, { command: "revoke", device: "phone" });
		await theirs.until((w) => w.closed, "the phone's stream to close");
		assert.equal(theirs.end, "revoked");
		assert.equal(mine.end, undefined);
		await s.close();
		await mine.until((w) => w.closed, "the laptop's stream to close");
		assert.equal(mine.end, "stopping");
	} finally {
		await s.close();
	}
});
