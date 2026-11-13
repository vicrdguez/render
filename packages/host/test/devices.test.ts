import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { test } from "node:test";
import { requestAdmin, startServer } from "../src/index.js";
import { faux, start } from "./helpers.js";

const MINUTE = 60_000;

test("a pairing code has eight characters, works once, and leaves only a hash", async () => {
	let clock = Date.UTC(2026, 10, 14);
	const s = await start({ now: () => clock });
	try {
		const issued = await requestAdmin(s.home, {
			command: "pair",
			device: "phone",
		});
		assert.ok("code" in issued);
		assert.match(issued.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
		assert.equal(issued.expiresAt, clock + 10 * MINUTE);
		const paired = await s.call("pair", { code: issued.code }, "");
		assert.equal(paired.status, 200);
		assert.equal(paired.body.result.device, "phone");
		const token: string = paired.body.result.token;
		assert.match(token, /^tau\.phone\.[A-Za-z0-9_-]{43}$/);
		assert.equal(paired.headers["tau-protocol"], "1");

		const again = await s.call("pair", { code: issued.code }, "");
		assert.equal(again.status, 401);
		assert.equal(again.body.refused?.code, "unauthorized");

		const file = path.join(s.home, "devices.json");
		assert.equal((await stat(file)).mode & 0o777, 0o600);
		const stored = await readFile(file, "utf8");
		const secret = token.split(".")[2] ?? "";
		assert.ok(!stored.includes(secret));
		assert.ok(
			stored.includes(createHash("sha256").update(secret).digest("hex")),
		);
		assert.equal((await s.call("projects", {}, token)).status, 200);

		const late = await requestAdmin(s.home, {
			command: "pair",
			device: "tablet",
		});
		assert.ok("code" in late);
		clock += 10 * MINUTE;
		const expired = await s.call("pair", { code: late.code }, "");
		assert.equal(expired.body.refused?.code, "unauthorized");
		const extra = await s.call("pair", { code: late.code, device: "x" }, "");
		assert.equal(extra.body.refused?.code, "bad_request");
	} finally {
		await s.close();
	}
});

test("five wrong codes in a row cancel every pending code", async () => {
	const s = await start();
	try {
		const pending = async (device: string) => {
			const issued = await requestAdmin(s.home, { command: "pair", device });
			assert.ok("code" in issued);
			return issued.code;
		};
		const kept = await pending("phone");
		for (let i = 0; i < 4; i++)
			await s.call("pair", { code: "AAAA-AAAA" }, "");
		assert.equal((await s.call("pair", { code: kept }, "")).status, 200);

		const lost = await pending("tablet");
		for (let i = 0; i < 4; i++)
			await s.call("pair", { code: "AAAA-AAAA" }, "");
		const fifth = await s.call("pair", { code: "AAAA-AAAA" }, "");
		assert.equal(fifth.body.refused?.code, "unauthorized");
		assert.equal(
			(await s.call("pair", { code: lost }, "")).body.refused?.code,
			"unauthorized",
		);
		assert.equal(
			(await s.call("pair", { code: await pending("tablet") }, "")).status,
			200,
		);
	} finally {
		await s.close();
	}
});

test("a device name matches its pattern and is never used twice", async () => {
	const s = await start();
	try {
		for (const device of ["Phone", "1phone", "a".repeat(33), "ph_one", ""]) {
			const reply = await requestAdmin(s.home, { command: "pair", device });
			assert.ok("error" in reply, device);
		}
		const taken = await requestAdmin(s.home, {
			command: "pair",
			device: "laptop",
		});
		assert.ok("error" in taken);
		await requestAdmin(s.home, { command: "revoke", device: "laptop" });
		const revoked = await requestAdmin(s.home, {
			command: "pair",
			device: "laptop",
		});
		assert.ok("error" in revoked);
		const unknown = await requestAdmin(s.home, {
			command: "revoke",
			device: "nobody",
		});
		assert.ok("error" in unknown);
	} finally {
		await s.close();
	}
});

test("the admin socket is owner-only and refuses a message that does not fit", async () => {
	const s = await start();
	try {
		const socket = path.join(s.home, "admin.sock");
		assert.equal((await stat(socket)).mode & 0o777, 0o600);
		assert.equal((await stat(s.home)).mode & 0o777, 0o700);
		const raw = (line: string) =>
			new Promise<string>((resolve, reject) => {
				const client = net.connect(socket);
				let reply = "";
				client.setEncoding("utf8");
				client.on("data", (chunk) => {
					reply += chunk;
				});
				client.on("end", () => resolve(reply));
				client.on("error", reject);
				client.end(`${line}\n`);
			});
		for (const line of [
			'{"command":"pair","device":"phone","extra":1}',
			'{"command":"delete","device":"phone"}',
			"not json",
		]) {
			const reply = JSON.parse(await raw(line));
			assert.equal(typeof reply.error, "string", line);
		}
		const listed = JSON.parse(await raw('{"command":"list"}'));
		assert.deepEqual(
			listed.devices.map((d: { device: string }) => d.device),
			["laptop"],
		);
	} finally {
		await s.close();
	}
});

test("revoking a device refuses its next call and the list shows it", async () => {
	let clock = Date.UTC(2026, 10, 14);
	const s = await start({ now: () => clock });
	try {
		const phone = await s.pair("phone");
		assert.equal((await s.call("projects", {}, phone)).status, 200);
		clock += 5;
		assert.deepEqual(
			await requestAdmin(s.home, { command: "revoke", device: "phone" }),
			{ done: true },
		);
		const refused = await s.call("projects", {}, phone);
		assert.equal(refused.status, 401);
		assert.equal(refused.body.refused?.code, "unauthorized");
		assert.equal((await s.call("projects", {})).status, 200);
		const list = await requestAdmin(s.home, { command: "list" });
		assert.ok("devices" in list);
		assert.deepEqual(
			list.devices.map((d) => [d.device, d.revokedAt]),
			[
				["laptop", undefined],
				["phone", clock],
			],
		);
	} finally {
		await s.close();
	}
});

test("devices survive a restart and a second server on the same home is refused", async () => {
	const s = await start();
	await assert.rejects(
		startServer({ home: s.home, modules: {}, models: faux().models, port: 0 }),
	);
	const again = await s.restart();
	try {
		assert.equal((await again.call("projects", {})).status, 200);
	} finally {
		await again.close();
	}
});
