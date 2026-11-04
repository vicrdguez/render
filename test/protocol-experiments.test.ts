import assert from "node:assert/strict";
import { test } from "node:test";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { assignments, saveGround, until } from "./support/investigation.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { gitSourceFixture } from "./support/source.ts";

const protocol = {
	schema: 1,
	question: "Does the favored candidate stay at or below 10?",
	hypothesis: "The favorite measures at most 10",
	falsifier: "A measurement greater than 10",
	decisionRule: "Accept the hypothesis only when every measured value is at most 10; otherwise negative",
	controls: ["Same input for both candidates"],
	fixtures: ["fixture.txt at the pinned source commit"],
	failureCases: ["Missing measurement is inconclusive, not success"],
	retainedOutputs: ["Exact candidate source, fixture, raw measurement, limitations and comparison"],
	budget: { maxCommands: 4, timeoutMs: 1000 },
	profile: { image: `sha256:${"0".repeat(64)}`, exclusions: [".git"], maxBytes: 1048576, maxEntries: 1000 },
	source: { repository: "owned", commit: "1".repeat(40) },
	candidates: ["favorite", "control"],
};
function code(reply: { status: string; code?: string }) {
	return reply.code ?? reply.status;
}
async function save(f: Awaited<ReturnType<typeof roleFixture>>, name: string, value: unknown) {
	const reply = await f.ledger.command(
		{
			version: 1,
			authorityEpoch: f.ledger.status().authorityEpoch,
			commandId: name,
			workflow: "workflow:2",
			expected: { document: null },
			command: {
				type: "saveDocument",
				document: name.toLowerCase(),
				mediaType: "text/plain",
				content: Buffer.from(JSON.stringify(value)).toString("base64"),
			},
		},
		admin,
	);
	assert.equal(code(reply), "accepted", JSON.stringify(reply));
	if (reply.status !== "accepted") throw new Error("unreachable");
	return reply.result.revision as string;
}
function candidate(ref: string, overrides: Record<string, unknown> = {}) {
	return {
		...packet({ role: "experiment-candidate", execution: "linux-writer" }),
		experiment: { protocol: ref, candidate: "favorite" },
		...overrides,
	};
}

test("E01 protocol criteria and exact retained inputs precede candidate assignment", async () => {
	const f = await roleFixture();
	try {
		const ground = await saveGround(f.ledger);
		for (const role of ["experiment-candidate", "experiment-parent"] as const)
			assert.equal(
				code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: packet({ role }) })),
				"invalid_content",
				"experiment roles cannot bypass preregistration",
			);
		for (const field of [
			"question",
			"hypothesis",
			"falsifier",
			"decisionRule",
			"controls",
			"fixtures",
			"failureCases",
			"budget",
			"retainedOutputs",
		]) {
			const value: Record<string, unknown> = { ...protocol, ground };
			delete value[field];
			const ref = await save(f, `protocol-${field}`, value);
			assert.equal(
				code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: candidate(ref) })),
				"invalid_content",
				`missing ${field} must not execute`,
			);
		}
		assert.equal(assignments(f.ledger).length, 0);
		const ref = await save(f, "protocol-complete", { ...protocol, ground });
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: candidate(ref) })),
			"accepted",
			"complete preregistration must admit candidate ownership",
		);
		await until(() => assignments(f.ledger)[0]?.status === "blocked");
		assert.match(assignments(f.ledger)[0]!.blocker!, /experiment.*capability_unavailable/);
		assert.equal(assignments(f.ledger)[0]!.executing, false);
		const rendered = JSON.parse(await f.engine.render(assignments(f.ledger)[0]!));
		assert.match(rendered.experiment.instructions, /immutable protocol/);
		assert.match(rendered.experiment.instructions, /sealed read-only \/candidates\//);
		assert.match(rendered.experiment.instructions, /No criteria changes, original repairs, adoption or publication/);
		assert.equal(rendered.checkpointCandidate, undefined, "experiment roles do not receive design-candidate authority");
	} finally {
		await f.close();
	}
});

test("E03/E04 experiment ownership cannot adopt results or duplicate a round candidate", async () => {
	const f = await roleFixture();
	try {
		const ground = await saveGround(f.ledger);
		const ref = await save(f, "protocol", { ...protocol, ground });
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: true, packet: candidate(ref) })),
			"forbidden_scope",
			"experiment must not authorize adoption",
		);
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: candidate(ref, { role: "implementer" }) })),
			"forbidden_scope",
		);
		assert.equal(code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: candidate(ref) })), "accepted");
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "other-slice", delivery: false, packet: candidate(ref) })),
			"ownership_conflict",
			"one candidate identity cannot get two writers",
		);
		assert.equal(assignments(f.ledger).length, 1);
	} finally {
		await f.close();
	}
});

test("E14 exact source refusal before allocation does not consume executing capacity", async () => {
	const source = await gitSourceFixture();
	const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	let calls = 0;
	provider.setResponses([
		() => {
			calls++;
			throw new Error("Missing source must precede provider execution");
		},
	]);
	const f = await roleFixture(
		new Engine({
			provider: provider.provider,
			apiKey: "fixture",
			families: { "claude-sonnet-4-6": "claude" },
			experiments: { root: `${source.root}/experiments`, repositories: { owned: source.repo } },
		}),
	);
	try {
		const ground = await saveGround(f.ledger);
		const ref = await save(f, "protocol", { ...protocol, ground });
		assert.equal(code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: candidate(ref) })), "accepted");
		await until(() => assignments(f.ledger)[0]?.status === "blocked");
		await until(() => !assignments(f.ledger)[0]?.executing);
		assert.match(assignments(f.ledger)[0]!.blocker!, /experiment_prepare_blocked/);
		assert.equal(calls, 0, "missing exact source must not invoke a model");
	} finally {
		await f.close();
		await source.close();
	}
});

test("E05 independent parent cannot compare unsealed or missing candidates", async () => {
	const f = await roleFixture();
	try {
		const ground = await saveGround(f.ledger);
		const ref = await save(f, "protocol", { ...protocol, ground });
		const parent = { ...packet({ role: "experiment-parent", execution: "linux-writer" }), experiment: { protocol: ref, candidate: null } };
		assert.equal(
			code(await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: parent })),
			"missing_content",
			"parent must not compare mutable candidates",
		);
		assert.equal(assignments(f.ledger).length, 0);
	} finally {
		await f.close();
	}
});
