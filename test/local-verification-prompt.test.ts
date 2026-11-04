import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { deviceServer } from "../src/ledger/http.ts";
import type { CommandReply } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { assignments, finding, investigationPacket, saveGround, sourceFiles, until } from "./support/investigation.ts";
import { admin, roleFixture, scheduler } from "./support/roles.ts";
import { git, gitSourceFixture } from "./support/source.ts";

async function fixture() {
	const source = await gitSourceFixture({
		...sourceFiles,
		"verify.md": { text: "Setup: npm ci --ignore-scripts\nRun: npm test\nMissing: signing credentials, Mac fixtures and permissions.\n" },
	});
	const provider = fauxProvider({
		provider: "anthropic",
		api: "anthropic-messages",
		models: [{ id: "claude-sonnet-4-6", reasoning: true }],
	});
	provider.setResponses([
		(transcript) => {
			const prompt = JSON.parse(transcript.messages.filter((m) => m.role === "user").at(-1)!.content as string);
			const input = prompt.inputs.find((i: { text: string }) => i.text.includes('"kind":"investigation-source"'));
			return fauxAssistantMessage(
				fauxToolCall("submit_role_result", { text: JSON.stringify(finding(input.ref, prompt.packet.investigation.ground)), supports: [] }),
				{ stopReason: "toolUse" },
			);
		},
	]);
	const f = await roleFixture(
		new Engine({
			provider: provider.provider,
			apiKey: "owned-fixture",
			families: { "claude-sonnet-4-6": "claude" },
			investigations: { root: join(source.root, "investigation"), repositories: { owned: source.repo } },
		}),
	);
	const ground = await saveGround(f.ledger);
	assert.equal(
		(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: investigationPacket(ground, source.commit) }))
			.status,
		"accepted",
	);
	await until(() => assignments(f.ledger)[0]?.status === "submitted" && !assignments(f.ledger)[0]?.executing);
	const a = assignments(f.ledger)[0]!;
	const request = () => ({
		type: "requestLocalVerificationPrompt",
		source: a.investigationSource!,
		expectedSequence: f.ledger.status().sequence,
	});
	return {
		...f,
		get ledger() {
			return f.ledger;
		},
		source,
		a,
		request,
		async close() {
			await f.close();
			await source.close();
		},
	};
}
for (const failure of ["missing_content", "content_corrupt", "unsupported_schema"])
	test(`LP6 ${failure} requires exact input restoration`, async () => {
		const f = await fixture();
		try {
			await f.harness.close(ctx);
			const db = new DatabaseSync(join(f.data, "render.db"));
			try {
				const row = db.prepare("SELECT id, record FROM entries WHERE json_extract(record, '$.data.revision') = ?").get(f.a.report!) as {
					id: number;
					record: string;
				};
				assert.ok(row);
				if (failure === "missing_content") db.prepare("DELETE FROM entries WHERE id = ?").run(row.id);
				else {
					const record = JSON.parse(row.record);
					if (failure === "unsupported_schema") record.data.schema = 999;
					else record.data.text = "replacement finding";
					db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
				}
			} finally {
				db.close();
			}
			await f.reopen();
			const before = f.ledger.status().sequence;
			const reply = await f.command(f.request(), admin);
			assert.ok(reply.status === "refused");
			assert.equal(reply.code, failure);
			assert.ok(reply.reason.includes(f.a.report!));
			assert.equal(f.ledger.status().sequence, before);
		} finally {
			await f.close();
		}
	});

function accepted(reply: CommandReply) {
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	assert.ok(reply.status === "accepted");
	return reply;
}

test("LP1/LP5 two clients retain one exact advisory receipt; stale requests do not generate", async () => {
	const f = await fixture();
	const server = deviceServer(f.ledger);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		assert.ok(address && typeof address !== "string");
		const devices: Extract<CommandReply, { status: "accepted" }>[] = [];
		for (const label of ["A", "B", "foreign"]) {
			const enrollment = accepted(
				await f.ledger.command(
					{
						version: 1,
						authorityEpoch: f.ledger.status().authorityEpoch,
						commandId: `enroll-${label}`,
						command: { type: "enrollDevice", label, scope: { workflows: label === "foreign" ? [] : ["workflow:2"] } },
					},
					admin,
				),
			);
			devices.push(enrollment);
		}
		const send = async (device: number, command: Record<string, unknown>, id: string) => {
			const response = await fetch(`http://127.0.0.1:${address.port}/v1/commands`, {
				method: "POST",
				headers: { authorization: `Bearer ${devices[device]!.credential!.bearer}`, "content-type": "application/json" },
				body: JSON.stringify({
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: id,
					workflow: "workflow:2",
					command,
				}),
			});
			return (await response.json()) as CommandReply;
		};
		const command = f.request();
		const before = f.ledger.snapshot(admin);
		assert.ok("workflows" in before);
		const refs = git(f.source.repo, ["show-ref"]).toString();
		const first = accepted(await send(0, command, "lost-reply"));
		const retry = accepted(await send(1, command, "lost-reply"));
		assert.deepEqual(retry.result, first.result);
		assert.equal(retry.sequence, first.sequence);
		assert.equal(retry.duplicate, true);
		const stale = await send(1, command, "stale");
		assert.ok(stale.status === "refused", "stale prompt basis must refuse before generation");
		assert.equal(stale.code, "stale_basis", "stale prompt basis must refuse before generation");
		assert.equal(f.ledger.status().sequence, first.sequence);
		assert.equal((await send(2, command, "lost-reply")).status, "refused");
		const text = await f.ledger.artifact(admin, { read: String(first.result.textArtifact) });
		assert.ok("content" in text);
		const prompt = text.content.toString();
		for (const expected of [
			f.source.commit,
			"owned",
			"npm ci --ignore-scripts",
			"npm test",
			"verify.md",
			"signing credentials",
			"The strict positive predicate excludes zero.",
			"Verify identity first",
			"human-chosen",
			"no automatic main merge",
			"no automatic import",
			"expected",
			"observed",
			"accessibility",
			"not yet published/unavailable",
			"Unknown",
			"unrun",
			"secrets",
		])
			assert.ok(prompt.includes(expected), `prompt missing ${expected}`);
		assert.ok(prompt.includes("Same CPU does not make Linux binaries portable to macOS"), "Linux evidence must not imply Mac equivalence");
		assert.ok(!prompt.includes("FOREIGN-SOURCE-CANARY"));
		const after = f.ledger.snapshot(admin);
		assert.ok("workflows" in after);
		assert.deepEqual(after.assignments, before.assignments, "advisory absence must not gate or complete work");
		assert.deepEqual(after.policy, before.policy);
		assert.deepEqual(after.workflows, before.workflows);
		assert.equal(git(f.source.repo, ["show-ref"]).toString(), refs);
		accepted(
			await f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "revoke",
					command: { type: "revokeDevice", device: devices[0]!.result.device },
				},
				admin,
			),
		);
		assert.equal((await send(0, command, "lost-reply")).status, "refused");
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await f.close();
	}
});

test("LP2 source observations cannot be forged and non-human requests refuse", async () => {
	const f = await fixture();
	try {
		const own = mintContext({
			kind: "assignment-agent",
			assignment: f.a.id,
			generation: f.a.generation,
			attempt: f.a.attempt,
			role: f.a.packet.role,
		});
		for (const principal of [own, scheduler, mintContext({ kind: "host", scope: "effects" })]) {
			const reply = await f.command(f.request(), principal);
			assert.ok(reply.status === "refused");
			assert.equal(reply.code, "forbidden_principal");
		}
		for (const ref of ["revision:3", "revision:missing", "main"]) {
			const reply = await f.command({ ...f.request(), source: ref }, admin);
			assert.ok(reply.status === "refused");
			assert.equal(reply.code, "missing_content");
		}
	} finally {
		await f.close();
	}
});

test("LP3/LP6/LP7 regeneration preserves exact history across message feedback and restart", async () => {
	const f = await fixture();
	try {
		const firstCommand = f.request();
		const first = accepted(await f.command(firstCommand, admin, "original-prompt"));
		const original = await f.ledger.artifact(admin, { read: String(first.result.textArtifact) });
		assert.ok("content" in original);
		accepted(await f.command({ type: "postCoordinatorMessage", text: "Local observation: signing is unrun; no credentials." }, admin));
		const offer = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "release-offer",
				workflow: "workflow:2",
				expected: { document: null },
				command: {
					type: "saveDocument",
					document: "release-offer",
					mediaType: "text/plain",
					content: Buffer.from(
						"Release v0.9, macOS arm64, digest sha256:abcdef; source mapping unknown. This is an offered artifact, not verification.",
					).toString("base64"),
				},
			},
			admin,
		);
		accepted(offer);
		const second = accepted(await f.command(f.request(), admin));
		assert.notEqual(second.result.textArtifact, first.result.textArtifact);
		const regenerated = await f.ledger.artifact(admin, { read: String(second.result.textArtifact) });
		assert.ok("content" in regenerated);
		assert.match(regenerated.content.toString(), /Release v0.9, macOS arm64/);
		assert.match(regenerated.content.toString(), /Local observation: signing is unrun/);
		assert.match(regenerated.content.toString(), /unverified assertion/);
		assert.match(regenerated.content.toString(), /not an exact-source pass/);
		await f.reopen();
		const retry = accepted(await f.command(firstCommand, admin, "original-prompt"));
		assert.equal(retry.duplicate, true);
		assert.deepEqual(retry.result, first.result);
		const exportAfter = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in exportAfter && exportAfter.manifest.complete);
		assert.equal(Buffer.from(exportAfter.content[String(first.result.textArtifact)]!, "base64").toString(), original.content.toString());
		assert.equal(
			Buffer.from(exportAfter.content[String(second.result.textArtifact)]!, "base64").toString(),
			regenerated.content.toString(),
		);
		assert.ok(
			Object.values(exportAfter.content).some((content) =>
				Buffer.from(content, "base64").toString().includes("Local observation: signing is unrun"),
			),
		);
		assert.equal(assignments(f.ledger)[0]!.report, f.a.report);
		const refreshed = accepted(await f.command(f.request(), admin));
		assert.notEqual(refreshed.result.textArtifact, first.result.textArtifact);
	} finally {
		await f.close();
	}
});
