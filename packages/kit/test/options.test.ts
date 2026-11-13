import assert from "node:assert/strict";
import { test } from "node:test";
import { defineDoc, type JsonObject } from "@earendil-works/pi-durable";
import { bool, int, obj, str } from "@earendil-works/pi-schema";
import { options } from "tau-kit";
import { context, fixture } from "./fixture.js";

test("options isolate stores and caller document names", async (t) => {
	const a = await fixture(t);
	const b = await fixture(t);
	const first = options("first", obj({ key: str() }));
	const second = options("second", obj({ key: str() }));
	await a.commit((tx) => first.set(tx, { key: "one" }), context);
	assert.deepEqual(await b.commit((tx) => first.get(tx), context), {});
	assert.deepEqual(await a.commit((tx) => second.get(tx), context), {});
	const document = defineDoc<JsonObject>({
		kind: "first.options",
		version: 1,
		scope: "session",
		initial: () => ({}),
		checkpointWhen: () => false,
	});
	assert.deepEqual(await a.snapshot(document, context), { key: "one" });
});

test("get returns detached explicit keys and set replaces them without storing defaults", async (t) => {
	const h = await fixture(t);
	const schema = obj({
		model: str({ format: "model" }),
		base: str({ default: "main" }),
		retries: int({ default: 0 }),
		enabled: bool({ default: false }),
		label: str({ default: "" }),
	});
	const port = options("workflow", schema);
	assert.equal(port.schema, schema);
	await h.commit(
		(tx) => port.set(tx, { model: "local/a", base: "release" }),
		context,
	);
	await h.commit(async (tx) => {
		const value = await port.get(tx);
		value.base = "not stored";
		assert.deepEqual(await port.get(tx), { model: "local/a", base: "release" });
		assert.equal((await port.read(tx)).base, "release");
		await port.set(tx, { model: "local/b" });
		assert.deepEqual(await port.read(tx), {
			model: "local/b",
			base: "main",
			retries: 0,
			enabled: false,
			label: "",
		});
	}, context);
	assert.deepEqual(await h.commit((tx) => port.get(tx), context), {
		model: "local/b",
	});
	const upgraded = options(
		"workflow",
		obj({ model: str(), base: str({ default: "trunk" }) }),
	);
	assert.deepEqual(await h.commit((tx) => upgraded.read(tx), context), {
		model: "local/b",
		base: "trunk",
	});
	await h.commit((tx) => port.set(tx, {}), context);
	assert.deepEqual(await h.commit((tx) => port.get(tx), context), {});
});

test("read rejects missing, invalid, unknown and newly required keys", async (t) => {
	const h = await fixture(t);
	const port = options("checked", obj({ key: str({ minLength: 1 }) }));
	await assert.rejects(h.commit((tx) => port.read(tx), context));
	await h.commit((tx) => port.set(tx, { key: "" }), context);
	await assert.rejects(h.commit((tx) => port.read(tx), context));
	const old = options("checked", obj({ key: str(), removed: str() }));
	await h.commit(
		(tx) => old.set(tx, { key: "valid", removed: "old" }),
		context,
	);
	await assert.rejects(h.commit((tx) => port.read(tx), context));
	await h.commit((tx) => port.set(tx, { key: "valid" }), context);
	assert.deepEqual(await h.commit((tx) => port.read(tx), context), {
		key: "valid",
	});
	const upgraded = options("checked", obj({ key: str(), added: str() }));
	await assert.rejects(h.commit((tx) => upgraded.read(tx), context));
});

test("options changes roll back with the caller commit", async (t) => {
	const h = await fixture(t);
	const port = options("rollback", obj({ key: str() }));
	await h.commit((tx) => port.set(tx, { key: "before" }), context);
	await assert.rejects(
		h.commit(async (tx) => {
			await port.set(tx, { key: "after" });
			throw new Error("caller failed");
		}, context),
		/caller failed/,
	);
	assert.deepEqual(await h.commit((tx) => port.read(tx), context), {
		key: "before",
	});
});
