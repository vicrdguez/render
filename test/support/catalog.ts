import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import type { ForgeConfig } from "../../src/effects/forge.ts";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import type { CommandReply } from "../../src/ledger/ledger.ts";
import { mintContext } from "../../src/ledger/principals.ts";
import type { LinuxProfile } from "../../src/sandboxes/sandboxes.ts";
import { admin, claudeFixture, packet, roleFixture } from "./roles.ts";
import { git, gitSourceFixture, sourceFixture } from "./source.ts";

export const catalog = (_sanity = "exit 0", cleanup = "true") => `# Owned catalog
## Ranks
1. \`live\`: stronger project evidence
2. \`endpoint\`: actual driven behavior
3. \`static\`: static compatibility
## Launch
Owned fixture only.
## Doctor
Linux with sh; no host fallback.
## Channels
Process and Static are channels, not ranks.
## Catalog
| Name | Channel | Kind | Run | Expectations | Rank |
|---|---|---|---|---|---|
| discover | Process | generated | \`printf 'INDEX ONLY'\` | Index only | - |
| behavior | Process | journey | \`.skl/journey.md\` | STEP OK and independent sanity | endpoint |
| full-suite | Process | executed | \`printf 'SUITE OK'\` | SUITE OK | endpoint |
| typecheck | Static | executed | \`true\` | Types compatible | static |
| lint | Static | executed | \`true\` | Lint clean | static |
| human | Human-observed | human | Observe independently | Advisory | - |
## Cleanup
\`\`\`sh
${cleanup}
\`\`\`
## Extend
Keep literal expected outcomes.
## Traps
Never borrow a live service.
`;
export const journey = (sanity = "exit 0") => `# Independent journey
## Steps
1. \`printf 'STEP OK'\`
## Sanity
\`${sanity}\`
`;
export const rows = ["behavior", "full-suite", "typecheck", "lint"];
export async function catalogFixture(
	linux = false,
	options: { sanity?: string; cleanup?: string; text?: string; forge?: ForgeConfig } = {},
) {
	const text = options.text ?? catalog(options.sanity, options.cleanup);
	const files = { "verify.md": { text }, "journey.md": { text: journey(options.sanity) } };
	const source = linux ? await sourceFixture(files) : await gitSourceFixture(files);
	// Two real repository assets, but only the explicitly selected legacy asset is usable.
	const inner = git(source.repo, ["rev-parse", `${source.commit}^{tree}`])
		.toString()
		.trim();
	const decoy = git(source.repo, ["hash-object", "-w", "--stdin"], "NOT THE SELECTED CATALOG").toString().trim();
	const modern = git(source.repo, ["mktree"], `100644 blob ${decoy}\tverify.md\n`).toString().trim();
	const tree = git(source.repo, ["mktree"], `040000 tree ${inner}\t.skl\n040000 tree ${modern}\t.render\n`).toString().trim();
	const commit = git(source.repo, ["commit-tree", tree], "Selected legacy asset\n").toString().trim();
	git(source.repo, ["update-ref", "refs/heads/fixture", commit]);
	const selection = {
		repository: "owned",
		commit,
		path: ".skl/verify.md",
		digest: createHash("sha256").update(text).digest("hex"),
		contract: "revision:3",
		rows,
		behavioralRows: ["behavior"],
		receipts: [] as string[],
	};
	const config = {
		root: join(source.root, "catalog-owned"),
		repositories: { owned: source.repo },
		checks: {
			"revision:3": {
				repository: "owned",
				commit,
				profile:
					"profile" in source
						? (source.profile as LinuxProfile)
						: { image: `sha256:${"a".repeat(64)}`, exclusions: [".git"], maxBytes: 1048576, maxEntries: 100 },
				timeoutMs: 10000,
				catalog: true as const,
			},
		},
	};
	const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	const engine = new Engine({
		ownedChecks: config,
		provider: provider.provider,
		...claudeFixture,
		...(options.forge ? { forge: options.forge } : {}),
	});
	const f = await roleFixture(engine);
	return {
		...f,
		get ledger() {
			return f.ledger;
		},
		source,
		selection,
		config,
		text,
		provider,
		async close() {
			await f.close();
			await source.close();
		},
	};
}
export async function settled(f: Awaited<ReturnType<typeof catalogFixture>>, id: string): Promise<RoleAssignment> {
	const deadline = Date.now() + 25000;
	for (;;) {
		const frame = f.ledger.snapshot(admin);
		assert.ok("assignments" in frame);
		const a = (frame.assignments as RoleAssignment[]).find((a) => a.id === id)!;
		if (!a.executing && (a.report || a.status === "blocked")) return a;
		assert.ok(Date.now() < deadline, JSON.stringify(a));
		await setTimeout(20);
	}
}
export async function runCatalog(f: Awaited<ReturnType<typeof catalogFixture>>, extraRows: string[] = [], required = extraRows) {
	const reply = await f.command({
		type: "assignTask",
		slice: "catalog:run",
		delivery: false,
		packet: packet({
			role: "implementer",
			execution: "linux-writer",
			verification: { ...f.selection, rows: [...rows, ...extraRows], behavioralRows: ["behavior", ...required] },
		}),
	});
	assert.equal(reply.status, "accepted", "selected catalog packet must be admitted");
	assert.ok(reply.status === "accepted");
	const a = await settled(f, String(reply.result.assignment));
	assert.equal(a.status, "submitted", a.blocker ?? "catalog execution should retain a receipt");
	const read = await Effect.runPromise(f.ledger.artifact(admin, { read: a.report! }));
	assert.ok("content" in read);
	return { a, read, receipt: JSON.parse(read.content.toString()) };
}
export async function assess(
	f: Awaited<ReturnType<typeof catalogFixture>>,
	receipts: string[],
	overrides: Record<string, unknown> = {},
	rank = "endpoint",
	role = "implementer",
) {
	const selected = { ...f.selection, receipts, ...overrides };
	let result: CommandReply | undefined;
	f.provider.setResponses([
		async () => {
			const frame = f.ledger.snapshot(admin);
			assert.ok("assignments" in frame);
			const a = (frame.assignments as RoleAssignment[]).at(-1)!;
			const context = mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role });
			result = await f.command(
				{
					type: "submitRoleResult",
					text: "Independent adequacy assessment",
					supports: [],
					verification: { outcome: "pass", rank, reason: "Literal expectations satisfy this Contract." },
				},
				context,
			);
			return fauxAssistantMessage(
				fauxToolCall("submit_role_result", {
					text: "Retained gaps",
					supports: [],
					verification: { outcome: "non-pass", rank: null, reason: "Required checks unavailable or insufficient." },
				}),
				{ stopReason: "toolUse" },
			);
		},
	]);
	const assigned = await f.command({
		type: "assignTask",
		slice: `catalog:assessment:${receipts.length}:${rank}`,
		delivery: false,
		packet: { ...packet({ maxInputBytes: 262144 }), role, verification: selected },
	});
	assert.equal(assigned.status, "accepted");
	assert.ok(assigned.status === "accepted");
	const a = await settled(f, String(assigned.result.assignment));
	return result ?? { status: "blocked" as const, code: "capability_unavailable", reason: a.blocker };
}
