import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isSecretName, SECRET_NAMES, secretsFile } from "../src/host/secrets.ts";

const VALUE = "ghp_secretsFileTestValue0123456789";

async function dir() {
	const path = await mkdtemp(join(tmpdir(), "render-secrets-"));
	return { path, file: join(path, "secrets.json"), remove: () => rm(path, { recursive: true, force: true }) };
}

test("the secret names are a closed set with one API key per provider", () => {
	assert.deepEqual([...SECRET_NAMES].sort(), ["api-key:anthropic", "api-key:deepseek", "api-key:openai", "exa", "github-token", "tavily"]);
	for (const name of ["api-key:mistral", "GITHUB-TOKEN", "", "github-token ", "__proto__"]) assert.equal(isSecretName(name), false, name);
});

test("a set secret is listed as set without its value and the file is 0600", async () => {
	const d = await dir();
	try {
		const secrets = secretsFile(d.file);
		assert.deepEqual(
			(await secrets.list()).map((s) => [s.name, s.set, s.updatedAt]),
			SECRET_NAMES.map((name) => [name, false, null]),
		);
		assert.equal(await secrets.read("github-token"), undefined);
		const reply = await secrets.set("github-token", VALUE);
		assert.equal(reply.name, "github-token");
		assert.equal(reply.set, true);
		assert.ok(!Number.isNaN(Date.parse(reply.updatedAt)));
		const listed = await secrets.list();
		assert.deepEqual(
			listed.find((s) => s.name === "github-token"),
			reply,
		);
		assert.ok(!JSON.stringify(listed).includes(VALUE), "list never returns a value");
		assert.equal((await stat(d.file)).mode & 0o777, 0o600);
		assert.equal(await secretsFile(d.file).read("github-token"), VALUE, "a fresh reader sees the new value");
		await secrets.set("api-key:deepseek", "sk-deepseek");
		assert.equal(await secrets.read("github-token"), VALUE, "setting one secret keeps the others");
		await secrets.set("github-token", "replaced");
		assert.equal(await secrets.read("github-token"), "replaced");
		assert.deepEqual(await readdir(d.path), ["secrets.json"], "no temporary file remains");
	} finally {
		await d.remove();
	}
});

test("a world-readable secrets file becomes 0600 on the next write", async () => {
	const d = await dir();
	try {
		await writeFile(d.file, "{}", { mode: 0o644 });
		await secretsFile(d.file).set("exa", "exa-key");
		assert.equal((await stat(d.file)).mode & 0o777, 0o600);
	} finally {
		await d.remove();
	}
});

test("an unknown name or a non-string value is refused and the file is unchanged", async () => {
	const d = await dir();
	try {
		const secrets = secretsFile(d.file);
		await secrets.set("tavily", "t");
		const before = (await stat(d.file)).mtimeMs;
		await assert.rejects(secrets.set("api-key:mistral" as never, "x"));
		await assert.rejects(secrets.set("tavily", "" as string));
		assert.equal((await stat(d.file)).mtimeMs, before);
		assert.equal(await secrets.read("tavily"), "t");
	} finally {
		await d.remove();
	}
});
