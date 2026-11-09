import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import { secretsFile } from "../src/host/secrets.ts";
import { deviceServer } from "../src/host/transport.ts";
import { openLedger } from "../src/ledger/startup.ts";
import { admin } from "./support/roles.ts";

const VALUE = "ghp_routeSecretValueNeverDisclosed0123";

async function host() {
	const data = await mkdtemp(join(tmpdir(), "render-secrets-route-"));
	const opened = await Effect.runPromise(openLedger({ data, runtime: (report) => new Engine().options(report), onFatal: () => {} }));
	const file = join(data, "secrets.json");
	const server: Server = deviceServer({ ledger: opened.ledger, secrets: secretsFile(file) }, opened.principals);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const enroll = async (label: string, workflows: "all" | string[]) => {
		const r = await Effect.runPromise(
			opened.ledger.command(
				{
					version: 1,
					authorityEpoch: opened.ledger.status().authorityEpoch,
					commandId: `enroll:${label}`,
					command: { type: "enrollDevice", label, scope: { workflows } },
				},
				admin,
			),
		);
		assert.ok(r.status === "accepted" && r.credential);
		return r.credential.bearer;
	};
	const request = async (method: string, path: string, bearer?: string, body?: unknown) => {
		const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
			method,
			headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), "content-type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const text = await response.text();
		return { status: response.status, text, body: JSON.parse(text) as Record<string, unknown> };
	};
	return {
		data,
		file,
		ledger: opened.ledger,
		enroll,
		request,
		async close() {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await Effect.runPromise(opened.close());
			await rm(data, { recursive: true, force: true });
		},
	};
}

test("S5 a project-wide human sets a secret that is listed as set and appears in no record or export", async () => {
	const h = await host();
	try {
		const all = await h.enroll("desktop", "all");
		const put = await h.request("PUT", "/v1/secrets/github-token", all, { value: VALUE });
		assert.equal(put.status, 200, put.text);
		assert.equal(put.body.name, "github-token");
		assert.equal(put.body.set, true);
		assert.ok(typeof put.body.updatedAt === "string");
		const listed = await h.request("GET", "/v1/secrets", all);
		assert.equal(listed.status, 200);
		const secrets = listed.body.secrets as { name: string; set: boolean; updatedAt: string | null }[];
		assert.deepEqual(
			secrets.find((s) => s.name === "github-token"),
			{ name: "github-token", set: true, updatedAt: put.body.updatedAt },
		);
		assert.ok(!listed.text.includes(VALUE), "nobody reads a secret back");
		assert.equal(statSync(h.file).mode & 0o777, 0o600);
		const exported = await Effect.runPromise(h.ledger.artifact(admin, { export: {} }));
		assert.ok("manifest" in exported);
		assert.ok(!JSON.stringify(exported).includes(VALUE), "export never carries a secret");
		for (const name of readdirSync(h.data))
			if (name.startsWith("render.db")) assert.ok(!readFileSync(join(h.data, name)).includes(VALUE), `${name} never carries a secret`);
		assert.ok(!JSON.stringify(h.ledger.snapshot(admin)).includes(VALUE));
		assert.equal((await h.request("PUT", "/v1/secrets/api-key:mistral", all, { value: "x" })).status, 404);
		assert.equal((await h.request("PUT", "/v1/secrets/exa", all, { value: 3 })).status, 400);
	} finally {
		await h.close();
	}
});

test("S6 a narrow device or an unauthenticated request cannot use either secrets route", async () => {
	const h = await host();
	try {
		const narrow = await h.enroll("phone", []);
		const refusedPut = await h.request("PUT", "/v1/secrets/github-token", narrow, { value: VALUE });
		assert.deepEqual([refusedPut.status, refusedPut.body.code], [403, "forbidden_scope"]);
		const refusedGet = await h.request("GET", "/v1/secrets", narrow);
		assert.deepEqual([refusedGet.status, refusedGet.body.code], [403, "forbidden_scope"]);
		for (const [method, path] of [
			["PUT", "/v1/secrets/github-token"],
			["GET", "/v1/secrets"],
		] as const) {
			const r = await h.request(method, path, undefined, method === "PUT" ? { value: VALUE } : undefined);
			assert.deepEqual([r.status, r.body.code], [401, "unauthorized"]);
		}
		assert.equal(existsSync(h.file), false, "the secrets file is unchanged");
	} finally {
		await h.close();
	}
});
