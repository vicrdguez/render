// A coordinator's investigation source comes from a private GitHub project through the trusted forge token.
import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { assignments, investigationPacket, saveGround, sourceFiles, until } from "./support/investigation.ts";
import { admin, roleFixture } from "./support/roles.ts";
import { git, gitSourceFixture } from "./support/source.ts";

test("investigation source resolves from a private GitHub remote with the forge token, which no record carries", async () => {
	const source = await gitSourceFixture(sourceFiles);
	const gh = await fakeGitHub();
	git(source.repo, ["push", "-q", gh.repo, `${source.commit}:refs/heads/main`]);
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
	const gate = Promise.withResolvers<void>();
	p.setResponses([
		async () => {
			await gate.promise;
			return fauxAssistantMessage("Done");
		},
	]);
	const f = await roleFixture(
		new Engine({
			provider: p.provider,
			apiKey: "fixture",
			families: { "claude-sonnet-4-6": "claude" },
			investigations: { root: join(source.root, "investigation") },
			forge: gh.config,
		}),
		{ remote: `${gh.config.git}/${gh.owner}/${gh.name}.git`, defaultBranch: "main" },
	);
	try {
		const ref = await saveGround(f.ledger);
		const reply = await f.command({
			type: "assignTask",
			slice: "workflow:3",
			delivery: false,
			packet: investigationPacket(ref, source.commit),
		});
		assert.equal(reply.status, "accepted", JSON.stringify(reply));
		await until(() => !!assignments(f.ledger)[0]?.investigationSource || !!assignments(f.ledger)[0]?.blocker);
		const a = assignments(f.ledger)[0]!;
		assert.equal(a.blocker, null, "the private remote was fetched");
		assert.ok(a.investigationSource);
		assert.ok(
			gh.requests.some((r) => r.path.startsWith("/git/") && r.authorization?.startsWith("Basic ")),
			"Git carried the token",
		);
		assert.ok(!JSON.stringify(f.ledger.snapshot(admin)).includes(TOKEN), "no record carries the token");
	} finally {
		gate.resolve();
		await f.close();
		await gh.close();
		await source.close();
	}
});
