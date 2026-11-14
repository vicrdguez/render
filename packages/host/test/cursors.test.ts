import assert from "node:assert/strict";
import { test } from "node:test";
import { start } from "./helpers.js";

test("each paged call refuses malformed cursor payloads without poisoning storage", async () => {
	const s = await start();
	try {
		await s.call("bind", { project: "p", workdir: "/tmp", extensions: [] });
		const conversation = (await s.call("create", { project: "p", model: "faux/a" })).body.result.conversation;
		for (const call of ["faults", "conversations", "history"]) {
			const body = call === "history" ? { project: "p", conversation } : { project: "p" };
			const query = call === "history" ? { conversation } : {};
			for (const position of [null, "not-a-cursor", [], { after: "bad" }, { after: 1.5 }, { after: 1, order: "sideways" }, { "flow.broken": { after: "bad", order: "descending" } }]) {
				const cursor = Buffer.from(JSON.stringify({ call, project: "p", query, position })).toString("base64url");
				const reply = await s.call(call, { ...body, cursor });
				assert.equal(reply.status, 400, `${call} ${JSON.stringify(position)}`);
				assert.equal(reply.body.refused?.code, "bad_cursor");
			}
			const position = call === "faults" ? {} : { after: 1, order: "ascending" };
			for (const badQuery of [{ unknown: true }, { ...query, minEntryId: -1 }, { ...query, order: "sideways" }]) {
				const cursor = Buffer.from(JSON.stringify({ call, project: "p", query: badQuery, position })).toString("base64url");
				assert.equal((await s.call(call, { ...body, cursor })).body.refused?.code, "bad_cursor");
			}
			assert.equal((await s.call(call, body)).status, 200, "malformed cursors must not fail the session");
		}
	} finally { await s.close(); }
});
