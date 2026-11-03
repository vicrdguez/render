import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import type { RoleAssignment, RolePacket } from "../../src/kernel/roles.ts";
import type { Ledger } from "../../src/ledger/ledger.ts";
import { admin, packet } from "./roles.ts";

export const ground = {
	schema: 1,
	goal: "Investigate why the fixture rejects zero; do not change source.",
	constraints: ["Read-only", "No implementation commitment"],
	clarifications: ["Inspect the zero boundary only."],
	shape: { value: "investigation", origin: "human", confirmed: false },
	donePredicate: "Identify the exact zero branch, with a cited finding or an honest escalation.",
};
export function investigationPacket(groundRef: string, commit = "1".repeat(40), overrides: Partial<RolePacket> = {}): RolePacket {
	return packet({
		...overrides,
		investigation: { ground: groundRef, repository: "owned", commit, paths: ["boundary.ts", "CONTEXT.md", "ADR.md", "verify.md"] },
	});
}
export async function saveGround(ledger: Ledger, value: unknown = ground, expected: string | null = null, id = "ground") {
	const result = await ledger.command(
		{
			version: 1,
			authorityEpoch: ledger.status().authorityEpoch,
			commandId: id,
			workflow: "workflow:2",
			expected: { document: expected },
			command: {
				type: "saveDocument",
				document: "ground",
				mediaType: "text/plain",
				content: Buffer.from(JSON.stringify(value)).toString("base64"),
			},
		},
		admin,
	);
	assert.ok(result.status === "accepted", JSON.stringify(result));
	return String(result.result.revision);
}
export function assignments(ledger: Ledger): RoleAssignment[] {
	const frame = ledger.snapshot(admin);
	assert.ok("assignments" in frame);
	return frame.assignments as RoleAssignment[];
}
export async function until(check: () => boolean | Promise<boolean>) {
	const end = Date.now() + 5000;
	while (!(await check())) {
		assert.ok(Date.now() < end, "investigation did not settle within 5s");
		await setTimeout(10);
	}
}
export function finding(source: string, groundRef: string, escalation = false) {
	return {
		schema: 1,
		outcome: escalation ? "escalation" : "finding",
		summary: "The strict positive predicate excludes zero.",
		facts: [{ text: "Zero is rejected by x > 0.", citations: [{ ref: source, path: "boundary.ts" }, { ref: groundRef }] }],
		uncertainties: ["Whether zero should be accepted is a product question."],
		limits: ["Source inspection only; no verifier or model judgment trial executed."],
		next: escalation
			? {
					playbook: "experiment",
					reason: "Need an isolated comparison.",
					question: "Provide the experiment capability or choose a read-only conclusion.",
				}
			: null,
	};
}
export const sourceFiles = {
	"boundary.ts": { text: "export const accepts = (x: number) => x > 0;\r\n" },
	"CONTEXT.md": { text: "Zero boundary.\n" },
	"ADR.md": { text: "Preserve explicit product decisions.\n" },
	"verify.md": { text: "Check accepts(0) against the agreed expectation.\n" },
	"private.txt": { text: "FOREIGN-SOURCE-CANARY" },
};
