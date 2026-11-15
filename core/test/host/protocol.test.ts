import assert from "node:assert/strict";
import { test } from "node:test";
import { send, start, TWENTY_CALLS } from "./helpers.js";

const bodies: Record<(typeof TWENTY_CALLS)[number], object> = {
	extensions: {},
	models: {},
	projects: {},
	bind: { project: "p", workdir: "/tmp/p", extensions: [] },
	addExtensions: { project: "nope", extensions: [] },
	options: { project: "nope" },
	setOptions: { project: "nope", extension: "x", patch: {} },
	create: { project: "nope", model: "faux/a" },
	conversations: { project: "nope" },
	open: { project: "nope", conversation: 1 },
	history: { project: "nope", conversation: 1 },
	input: { project: "nope", conversation: 1, text: "hi", requestId: "r1" },
	continue: { project: "nope", conversation: 1, requestId: "r1" },
	stop: { project: "nope", conversation: 1 },
	setModel: { project: "nope", conversation: 1, model: "faux/a" },
	inbox: {},
	decision: { project: "nope", decision: "w:k#1" },
	answer: {
		project: "nope",
		decision: "w:k#1",
		basis: 1,
		choice: "ok",
		annotations: [],
	},
	timeline: { project: "nope" },
	faults: { project: "nope" },
};

test("every call refuses one unknown field beside a valid body", async () => {
	const s = await start();
	try {
		for (const name of TWENTY_CALLS) {
			const valid = bodies[name];
			if (name === "inbox") {
				const stream = s.watch(name, valid);
				await stream.until((w) => w.value !== undefined, "inbox");
				stream.close();
			} else {
				const reply = await s.call(name, valid);
				assert.notEqual(reply.body.refused?.code, "bad_request", name);
				assert.ok(reply.body.result ?? reply.body.refused, name);
			}
			const extra = await s.call(name, { ...valid, by: "phone" });
			assert.equal(extra.status, 400, name);
			assert.equal(extra.body.refused?.code, "bad_request", name);
			assert.ok(
				extra.body.refused?.errors.some(
					(e: { path: string }) => e.path === "/by" || e.path === "",
				),
				`${name}: ${JSON.stringify(extra.body.refused?.errors)}`,
			);
		}
	} finally {
		await s.close();
	}
});

test("a reply has one of three bodies and the protocol header", async () => {
	const s = await start();
	try {
		const done = await s.call("projects", {});
		assert.equal(done.status, 200);
		assert.deepEqual(Object.keys(done.body), ["result"]);
		assert.equal(done.headers["tau-protocol"], "1");
		assert.equal(done.headers["content-type"], "application/json");

		const missing = await s.call("projects", {}, "");
		assert.equal(missing.status, 401);
		assert.deepEqual(Object.keys(missing.body), ["refused"]);
		assert.equal(missing.body.refused?.code, "unauthorized");
		assert.equal(typeof missing.body.refused?.message, "string");
		assert.equal(missing.headers["tau-protocol"], "1");

		const noHeader = await send(s.url, "/v1/projects", "{}");
		assert.equal(noHeader.body.refused?.code, "unauthorized");
		const forged = `${s.token.slice(0, -2)}AA`;
		assert.equal(
			(await s.call("projects", {}, forged)).body.refused?.code,
			"unauthorized",
		);
		assert.equal(
			(await s.call("projects", {}, "tau.nobody.secret")).body.refused?.code,
			"unauthorized",
		);
	} finally {
		await s.close();
	}
});

test("unknown_call lists exactly the twenty calls", async () => {
	const s = await start();
	try {
		const auth = { Authorization: `Bearer ${s.token}` };
		for (const [pathname, method] of [
			["/v1/", "POST"],
			["/v1/workflows", "POST"],
			["/v1/projects", "GET"],
			["/v2/projects", "POST"],
			["/", "POST"],
		] as const) {
			const reply = await send(s.url, pathname, "{}", auth, method);
			assert.equal(reply.status, 404, pathname);
			assert.equal(reply.body.refused?.code, "unknown_call", pathname);
			assert.deepEqual(
				[...(reply.body.refused?.calls ?? [])].sort(),
				[...TWENTY_CALLS].sort(),
			);
			assert.equal(reply.headers["tau-protocol"], "1");
		}
	} finally {
		await s.close();
	}
});

test("a body over 1 MiB is too_large and a body that is not an object is bad_request", async () => {
	const s = await start();
	try {
		const auth = { Authorization: `Bearer ${s.token}` };
		const big = JSON.stringify({ text: "x".repeat(1024 * 1024) });
		const large = await send(s.url, "/v1/projects", big, auth);
		assert.equal(large.status, 413);
		assert.equal(large.body.refused?.code, "too_large");
		for (const body of ["", "not json", "[]", "3", "null"]) {
			const reply = await send(s.url, "/v1/projects", body, auth);
			assert.equal(reply.status, 400, body);
			assert.equal(reply.body.refused?.code, "bad_request", body);
		}
	} finally {
		await s.close();
	}
});

test("an unexpected Host or another site's Origin is refused with no CORS", async () => {
	const s = await start({ allowedHosts: ["tau.example.ts.net"] });
	try {
		const auth = { Authorization: `Bearer ${s.token}` };
		const ok = async (headers: Record<string, string>) =>
			send(s.url, "/v1/projects", "{}", { ...auth, ...headers });
		for (const host of [
			"localhost:6283",
			`127.0.0.1:${s.server.address.port}`,
			"tau.example.ts.net",
		]) {
			assert.equal((await ok({ Host: host })).status, 200, host);
		}
		const foreign = await ok({ Host: "evil.example" });
		assert.equal(foreign.status, 401);
		assert.equal(foreign.body.refused?.code, "unauthorized");
		const sameSite = await ok({
			Host: "tau.example.ts.net",
			Origin: "https://tau.example.ts.net",
		});
		assert.equal(sameSite.status, 200);
		const crossSite = await ok({ Origin: "https://evil.example" });
		assert.equal(crossSite.status, 401);
		assert.equal(crossSite.body.refused?.code, "unauthorized");
		const preflight = await send(
			s.url,
			"/v1/projects",
			undefined,
			{ Origin: "https://evil.example" },
			"OPTIONS",
		);
		for (const reply of [foreign, crossSite, preflight, sameSite]) {
			assert.ok(
				!Object.keys(reply.headers).some((h) => h.startsWith("access-control")),
			);
			assert.ok(reply.status < 300 || reply.status >= 400);
		}
	} finally {
		await s.close();
	}
});
