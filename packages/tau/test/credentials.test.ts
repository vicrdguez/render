import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	utimes,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import lockfile from "proper-lockfile";
import { piLogins } from "../src/credentials.js";

const key = (value: string) => ({ type: "api_key" as const, key: value });

for (const contents of [
	"",
	"\uFEFF{}",
	`\uFEFF${JSON.stringify({ anthropic: key("pi") })}`,
]) {
	test(`reads pi auth contents ${JSON.stringify(contents)}`, async () => {
		const home = await mkdtemp(path.join(tmpdir(), "tau-logins-"));
		const file = path.join(home, "auth.json");
		await writeFile(file, contents);
		const store = piLogins(file);
		assert.deepEqual(
			await store.read("anthropic"),
			contents.includes("anthropic") ? key("pi") : undefined,
		);
		await store.modify("openai", async () => key("new"));
		assert.deepEqual(
			JSON.parse(await readFile(file, "utf8")).openai,
			key("new"),
		);
	});
}

for (const old of [false, true]) {
	test(`reading logins waits for pi's ${old ? "15 second old" : "current"} lock`, async () => {
		const home = await mkdtemp(path.join(tmpdir(), "tau-logins-"));
		const file = path.join(home, "auth.json");
		await writeFile(file, JSON.stringify({ anthropic: key("old") }));
		await mkdir(`${file}.lock`);
		if (old) {
			const time = new Date(Date.now() - 15_000);
			await utimes(`${file}.lock`, time, time);
		}
		let completed = false;
		const reading = piLogins(file)
			.read("anthropic")
			.then((result) => {
				completed = true;
				return result;
			});
		try {
			await new Promise((resolve) => setTimeout(resolve, 100));
			assert.equal(completed, false, "reading must not take over pi's lock");
			await writeFile(file, JSON.stringify({ anthropic: key("latest") }));
		} finally {
			await rm(`${file}.lock`, { recursive: true, force: true });
			await reading;
		}
		assert.deepEqual(await reading, key("latest"));
	});
}

test("a compromised auth lock refuses the write", async (t) => {
	const home = await mkdtemp(path.join(tmpdir(), "tau-logins-"));
	const file = path.join(home, "auth.json");
	const contents = JSON.stringify({ anthropic: key("old") });
	await writeFile(file, contents);
	t.mock.timers.enable({ apis: ["setTimeout"] });
	let enter!: () => void;
	const entered = new Promise<void>((resolve) => {
		enter = resolve;
	});
	let resume!: () => void;
	const paused = new Promise<void>((resolve) => {
		resume = resolve;
	});
	const updating = piLogins(file).modify("anthropic", async () => {
		enter();
		await paused;
		return key("must not write");
	});
	const refused = assert.rejects(updating, { code: "ECOMPROMISED" });
	try {
		await entered;
		await rm(`${file}.lock`, { recursive: true });
		t.mock.timers.tick(15_000);
		for (let i = 0; i < 100; i++)
			await new Promise((resolve) => setImmediate(resolve));
		resume();
		await refused;
		assert.equal(await readFile(file, "utf8"), contents);
	} finally {
		resume();
		t.mock.timers.reset();
	}
});

test("refresh holds pi's auth lock and preserves concurrent login and logout through aliases", async () => {
	const home = await mkdtemp(path.join(tmpdir(), "tau-logins-"));
	const file = path.join(home, "auth.json");
	const alias = path.join(home, "alias.json");
	await writeFile(
		file,
		JSON.stringify({ anthropic: key("old"), remove: key("gone") }),
	);
	await symlink(file, alias);
	const store = piLogins(alias);
	let entered!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	let release!: () => void;
	const paused = new Promise<void>((resolve) => {
		release = resolve;
	});
	const refresh = store.modify("anthropic", async (current) => {
		assert.deepEqual(current, key("old"));
		entered();
		await paused;
		return key("refreshed");
	});
	await started;
	let locked = false;
	try {
		await assert.rejects(lockfile.lock(file, { retries: 0 }), {
			code: "ELOCKED",
		});
		locked = true;
	} finally {
		release();
		await refresh;
	}
	assert.ok(locked);
	const unlock = await lockfile.lock(file);
	try {
		const data = JSON.parse(await readFile(file, "utf8"));
		delete data.remove;
		data.openai = key("new login");
		await writeFile(file, JSON.stringify(data));
	} finally {
		await unlock();
	}
	assert.deepEqual(await store.read("anthropic"), key("refreshed"));
	assert.deepEqual(await store.read("openai"), key("new login"));
	assert.equal(await store.read("remove"), undefined);
	await store.modify("anthropic", async () => key("again"));
	await store.delete("anthropic");
	assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
		openai: key("new login"),
	});
});

test("refresh reads the latest credentials after pi releases its lock", async () => {
	const home = await mkdtemp(path.join(tmpdir(), "tau-logins-"));
	const file = path.join(home, "auth.json");
	await writeFile(
		file,
		JSON.stringify({ anthropic: key("old"), remove: key("gone") }),
	);
	const unlock = await lockfile.lock(file);
	let entered = false;
	let observed: unknown;
	const store = piLogins(file);
	const refresh = store.modify("anthropic", async (current) => {
		entered = true;
		observed = current;
		return key("tau refresh");
	});
	await new Promise((resolve) => setTimeout(resolve, 50));
	try {
		assert.equal(entered, false, "the callback must wait for pi's lock");
		await writeFile(
			file,
			JSON.stringify({ anthropic: key("pi refresh"), openai: key("new") }),
		);
	} finally {
		await unlock();
		await refresh;
	}
	assert.deepEqual(observed, key("pi refresh"));
	assert.deepEqual(JSON.parse(await readFile(file, "utf8")), {
		anthropic: key("tau refresh"),
		openai: key("new"),
	});
});
