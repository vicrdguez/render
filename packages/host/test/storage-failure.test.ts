import assert from "node:assert/strict";
import { test } from "node:test";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { start } from "./helpers.js";

test("a real Storage rejection over HTTP has only unknown storage_failed with status 500", async () => {
	let fail = false;
	const storage = async (file: string) => {
		const backing = await openNodeSqliteStorage(file);
		return new Proxy(backing, {
			get(target, property) {
				if (property === "scanConversations" && fail) return async () => { throw new Error("disk read failed"); };
				const value = Reflect.get(target, property);
				return typeof value === "function" ? value.bind(target) : value;
			},
		});
	};
	const s = await start({ modules: {}, ...{ storage } });
	try {
		await s.call("bind", { project: "p", workdir: "/tmp", extensions: [] });
		assert.equal((await s.call("conversations", { project: "p" })).status, 200);
		fail = true;
		const reply = await s.call("conversations", { project: "p" });
		assert.equal(reply.status, 500);
		assert.equal(reply.headers["tau-protocol"], "1");
		assert.deepEqual(Object.keys(reply.body), ["unknown"]);
		assert.equal(reply.body.unknown?.code, "storage_failed");
		assert.equal(typeof reply.body.unknown?.message, "string");
	} finally { await s.close(); }
});
