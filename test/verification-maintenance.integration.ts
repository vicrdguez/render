import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import type { CommandReply } from "../src/ledger/ledger.ts";
import { type AuthenticatedContext as Context, mintContext } from "../src/ledger/principals.ts";
import { settled } from "./support/catalog.ts";
import { admin, packet, roleFixture, scheduler } from "./support/roles.ts";
import { git, sourceFixture } from "./support/source.ts";

type Row = { run: string; expectations: string };
const asset = (rows: Partial<Record<"stale" | "moved" | "product", Partial<Row>>> = {}) => {
	const row = (name: string, base: Row) => ({ ...base, ...rows[name as keyof typeof rows] });
	const stale = row("stale", { run: "`sh checks/old-name.sh`", expectations: "ADD OK" });
	const moved = row("moved", { run: "`.render/journeys/moved.md`", expectations: "STEP OK and golden fixture present" });
	const product = row("product", { run: "`sh checks/product.sh`", expectations: "product.js prints 4" });
	return `# Maintained catalog
## Ranks
1. \`process\`: real processes
2. \`tests\`: executable oracles
3. \`build\`: static compatibility
## Launch
Owned fixture only.
## Doctor
Linux with sh and node; the golden fixture tool is optional.
## Channels
Process, Tests and Static are channels, not ranks.
## Catalog
| Name | Channel | Kind | Run | Expectations | Rank |
|---|---|---|---|---|---|
| discover | Process | generated | \`ls checks\` | Lists the check scripts | - |
| full-suite | Tests | executed | \`sh checks/suite.sh\` | SUITE OK | tests |
| typecheck | Static | executed | \`true\` | Types compatible | build |
| lint | Static | executed | \`true\` | Lint clean | build |
| stale | Tests | executed | ${stale.run} | ${stale.expectations} | tests |
| product | Tests | executed | ${product.run} | ${product.expectations} | tests |
| fixture | Process | journey | \`.render/journeys/fixture.md\` | STEP OK and golden fixture present | process |
| moved | Process | journey | ${moved.run} | ${moved.expectations} | process |
| human | Human-observed | human | Observe the output | Advisory | - |
## Cleanup
\`\`\`sh
true
\`\`\`
## Extend
Keep literal expected outcomes.
## Traps
Never borrow a live service.
`;
};
const ALL = ["discover", "full-suite", "typecheck", "lint", "stale", "product", "fixture", "moved", "human"];
const product = (sum: string) => `console.log(${sum});\n`;
const base = {
	".render/journeys/fixture.md": "# Golden fixture journey\n## Steps\n1. `printf 'STEP OK'`\n## Sanity\n`render-golden-fixture --check`\n",
	"checks/add.sh": "printf 'ADD OK'\n",
	"checks/suite.sh": "printf 'SUITE OK'\n",
	"checks/product.sh": 'out=$(node product.js); test "$out" = 4 || { printf \'expected 4, got %s\' "$out"; exit 1; }\n',
	"product.js": product("2 + 3"),
};
const corrected = { stale: { run: "`sh checks/add.sh`" }, moved: { run: "`.render/journeys/fixture.md`" } };
const commits = {
	c0: { ...base, ".render/verify.md": asset() },
	c1: { ...base, ".render/verify.md": asset(corrected) },
	c2: { ...base, ".render/verify.md": asset({ ...corrected, product: { run: "`true`", expectations: "exits zero" } }) },
	c3: { ...base, "product.js": product("2 + 2"), ".render/verify.md": asset(corrected) },
	c4: { ...base, ".render/verify.md": asset({ ...corrected, stale: { run: "`sh checks/add.sh`", expectations: "exits zero" } }) },
};

function writeTree(repo: string, files: Record<string, string>): string {
	const dirs = new Map<string, Record<string, string>>();
	const lines: string[] = [];
	for (const [path, text] of Object.entries(files)) {
		const [head, ...rest] = path.split("/") as [string, ...string[]];
		if (rest.length) dirs.set(head, { ...dirs.get(head), [rest.join("/")]: text });
		else lines.push(`100644 blob ${git(repo, ["hash-object", "-w", "--stdin"], text).toString().trim()}\t${head}`);
	}
	for (const [name, sub] of dirs) lines.push(`040000 tree ${writeTree(repo, sub)}\t${name}`);
	return git(repo, ["mktree"], `${lines.join("\n")}\n`)
		.toString()
		.trim();
}

type Fixture = Awaited<ReturnType<typeof roleFixture>>;
let f: Fixture;
let source: Awaited<ReturnType<typeof sourceFixture>>;
const provider = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
const config = { root: "", repositories: {} as Record<string, string>, checks: {} as Record<string, unknown> };
const at: Record<keyof typeof commits, { commit: string; digest: string; profile: string }> = {} as never;
const receipts: Partial<Record<keyof typeof commits, string>> = {};
let basis = "";

function selection(c: keyof typeof commits, receiptRefs: string[], basisRef: string | null = null) {
	return {
		repository: "owned",
		commit: at[c].commit,
		path: ".render/verify.md",
		digest: at[c].digest,
		contract: "revision:3",
		rows: ALL,
		behavioralRows: [],
		receipts: receiptRefs,
		maintenance: { basis: basisRef },
	};
}
function assignments(): RoleAssignment[] {
	const frame = f.ledger.snapshot(admin);
	assert.ok("assignments" in frame);
	return frame.assignments as RoleAssignment[];
}
async function run(c: keyof typeof commits) {
	const reply = await f.command({
		type: "assignTask",
		slice: `maintenance:run:${c}`,
		delivery: false,
		packet: packet({ role: "implementer", execution: "linux-writer", profile: at[c].profile, verification: selection(c, []) }),
	});
	assert.ok(reply.status === "accepted", JSON.stringify(reply));
	const a = await settled(f as never, String(reply.result.assignment));
	assert.equal(a.status, "submitted", a.blocker ?? "maintenance runner should retain a receipt");
	const read = await Effect.runPromise(f.ledger.artifact(admin, { read: a.report! }));
	assert.ok("content" in read);
	receipts[c] = a.report!;
	return JSON.parse(read.content.toString());
}
type Classification = Record<string, { status: string; reason: string; cause?: string; compared?: string[] }>;
let n = 0;
async function classify(
	c: keyof typeof commits,
	rows: Classification,
	refs: string[],
	basisRef: string | null = null,
	options: { others?: Context[]; beforeSubmit?: (context: Context) => Promise<void> } = {},
): Promise<{ reply: CommandReply | { status: "unsubmitted"; reason: string }; others: CommandReply[]; assignment: RoleAssignment }> {
	let reply: CommandReply | undefined;
	const refused: CommandReply[] = [];
	const text = JSON.stringify({ schema: 1, maintenance: rows });
	provider.setResponses([
		async () => {
			const a = assignments().at(-1)!;
			for (const context of options.others ?? []) refused.push(await f.command({ type: "submitRoleResult", text, supports: [] }, context));
			const context = mintContext({
				kind: "assignment-agent",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				role: "implementer",
			});
			await options.beforeSubmit?.(context);
			reply = await f.command({ type: "submitRoleResult", text, supports: [] }, context);
			return fauxAssistantMessage(fauxToolCall("submit_role_result", { text, supports: [] }), { stopReason: "toolUse" });
		},
	]);
	const assigned = await f.command({
		type: "assignTask",
		slice: `maintenance:classify:${++n}`,
		delivery: false,
		packet: { ...packet({ maxInputBytes: 262144 }), role: "implementer", verification: selection(c, refs, basisRef) },
	});
	assert.ok(assigned.status === "accepted", JSON.stringify(assigned));
	const assignment = await settled(f as never, String(assigned.result.assignment));
	return {
		reply: reply ?? { status: "unsubmitted", reason: String(assignment.blocker) },
		others: refused,
		assignment,
	};
}
const honest: Classification = {
	discover: {
		status: "clean",
		reason: "Lists add.sh, product.sh, suite.sh; stale names old-name.sh",
		compared: ["stale", "product", "full-suite"],
	},
	"full-suite": { status: "clean", reason: "SUITE OK" },
	typecheck: { status: "clean", reason: "exit 0" },
	lint: { status: "clean", reason: "exit 0" },
	stale: { status: "changed", reason: "checks/old-name.sh was renamed to checks/add.sh (discovery)" },
	product: { status: "blocked", cause: "product", reason: "product.js prints 5, expected 4: product regression" },
	fixture: { status: "blocked", cause: "prerequisite", reason: "render-golden-fixture is not installed (127)" },
	moved: { status: "changed", reason: ".render/journeys/moved.md does not exist; the journey is .render/journeys/fixture.md" },
};
const outcome: Classification = {
	...honest,
	stale: { status: "changed", reason: "Corrected path re-executed: ADD OK" },
	moved: { status: "blocked", cause: "prerequisite", reason: "Corrected path still needs render-golden-fixture" },
};
const statuses = (a: RoleAssignment) =>
	Object.fromEntries(Object.entries(a.maintenance ?? {}).map(([k, v]) => [k, v.cause ? `${v.status}/${v.cause}` : v.status]));

before(async () => {
	source = await sourceFixture({ placeholder: { text: "x\n" } });
	config.root = join(source.root, "maintenance-owned");
	config.repositories.owned = source.repo;
	const engine = new Engine({
		ownedChecks: config as never,
		provider: provider.provider,
		apiKey: "fixture",
		families: { "claude-sonnet-4-6": "claude" },
	});
	f = await roleFixture(engine);
	for (const [name, files] of Object.entries(commits) as [keyof typeof commits, Record<string, string>][]) {
		const commit = git(source.repo, ["commit-tree", writeTree(source.repo, files)], `Maintenance ${name}\n`)
			.toString()
			.trim();
		git(source.repo, ["update-ref", `refs/heads/${name}`, commit]);
		const saved = await Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: `profile-${name}`,
					workflow: "workflow:2",
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: `profile-${name}`,
						mediaType: "text/plain",
						content: Buffer.from(name).toString("base64"),
					},
				},
				admin,
			),
		);
		assert.ok(saved.status === "accepted", JSON.stringify(saved));
		const profile = String(saved.result.revision);
		at[name] = { commit, digest: createHash("sha256").update(files[".render/verify.md"]!).digest("hex"), profile };
		config.checks[profile] = { repository: "owned", commit, profile: source.profile, timeoutMs: 10000, catalog: true };
	}
});
after(async () => {
	await f?.close();
	await source?.close();
});

test("VM01 maintenance runs every non-human row and keeps an unresolvable row as its own invalid result", async () => {
	const receipt = await run("c0");
	const result = (name: string) => receipt.results.find((r: { name: string }) => r.name === name);
	assert.deepEqual(
		receipt.results.map((r: { name: string }) => r.name),
		ALL,
	);
	assert.equal(result("discover").status, "completed");
	assert.equal(result("discover").steps[0].stdout, "add.sh\nproduct.sh\nsuite.sh\n");
	assert.equal(result("full-suite").steps[0].stdout, "SUITE OK");
	assert.equal(result("stale").status, "failed");
	assert.equal(result("product").status, "failed");
	assert.equal(result("product").steps[0].stdout, "expected 4, got 5");
	assert.equal(result("fixture").steps[0].stdout, "STEP OK");
	assert.equal(result("fixture").sanity.exitCode, 127);
	assert.equal(result("fixture").status, "unrun");
	assert.equal(result("moved").status, "invalid");
	assert.deepEqual(result("moved").steps, []);
	assert.equal(result("human").status, "advisory");
	assert.deepEqual(receipt.catalog.selection.maintenance, { basis: null });
});

const invalidClassifications = [
	["an omitted row", { ...honest, lint: undefined }, "missing_content", /Classify every non-human row/],
	["an unknown row", { ...honest, absent: { status: "clean", reason: "x" } }, "missing_content", /Classify every non-human row/],
	[
		"a classified human row",
		{ ...honest, human: { status: "clean", reason: "looked" } },
		"missing_content",
		/Classify every non-human row/,
	],
	[
		"discovery without compared rows",
		{ ...honest, discover: { status: "clean", reason: "listed" } },
		"missing_content",
		/Compare discovery discover/,
	],
	[
		"discovery compared with a non-row",
		{ ...honest, discover: { ...honest.discover!, compared: ["absent"] } },
		"missing_content",
		/Compare discovery discover/,
	],
	[
		"a failed row called clean",
		{ ...honest, stale: { status: "clean", reason: "looks fine" } },
		"missing_content",
		/Row stale did not execute successfully/,
	],
	[
		"a product failure called clean",
		{ ...honest, product: { status: "clean", reason: "close enough" } },
		"missing_content",
		/Row product did not execute successfully/,
	],
	[
		"an unrun sanity called clean",
		{ ...honest, fixture: { status: "clean", reason: "steps passed" } },
		"missing_content",
		/Row fixture did not execute successfully/,
	],
	[
		"an invalid row called clean",
		{ ...honest, moved: { status: "clean", reason: "skipped" } },
		"missing_content",
		/Row moved did not execute successfully/,
	],
	[
		"blocked without a cause",
		{ ...honest, product: { status: "blocked", reason: "fails" } },
		"invalid_content",
		/cause:product\|prerequisite when blocked/,
	],
] as const;

test("VM02 classification refuses each invalid row or classification", async () => {
	const attempts: CommandReply[] = [];
	const { reply } = await classify("c0", honest, [receipts.c0!], null, {
		beforeSubmit: async (context) => {
			for (const [, rows] of invalidClassifications) {
				const text = JSON.stringify({ schema: 1, maintenance: rows });
				attempts.push(await f.command({ type: "submitRoleResult", text, supports: [] }, context));
			}
		},
	});
	assert.equal(attempts.length, invalidClassifications.length);
	for (const [index, [label, , code, reason]] of invalidClassifications.entries()) {
		const attempt = attempts[index]!;
		assert.equal(attempt.status, "refused", `${label} must not be retained as a classification`);
		if (attempt.status !== "refused") throw new Error("unreachable");
		assert.equal(attempt.code, code, label);
		assert.match(attempt.reason, reason, label);
	}
	assert.equal(reply.status, "accepted", "the assignment remains usable after the refused submissions");
});

test("VM02 classification refuses without an exact maintenance receipt", async () => {
	assert.equal((await classify("c0", honest, [])).reply.status, "refused", "no observed basis");
});

test("VM03/VM11 only the agent retains the honest pre-edit classification per row", async () => {
	const { reply, others, assignment } = await classify("c0", honest, [receipts.c0!], null, { others: [admin, scheduler] });
	assert.deepEqual(
		others.map((r) => r.status),
		["refused", "refused"],
	);
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	basis = assignment.id;
	assert.deepEqual(statuses(assignment), {
		discover: "clean",
		"full-suite": "clean",
		typecheck: "clean",
		lint: "clean",
		stale: "changed",
		product: "blocked/product",
		fixture: "blocked/prerequisite",
		moved: "changed",
	});
	const frame = f.ledger.snapshot(admin);
	assert.deepEqual("implementationPasses" in frame ? frame.implementationPasses : [], [], "a finding opens no pass");
});

test("VM10 findings without edits are no corrected-run outcome on the basis's own commit", async () => {
	const unedited = { ...outcome, stale: { status: "blocked", cause: "prerequisite", reason: "Not yet corrected" } };
	const { reply } = await classify("c0", unedited, [receipts.c0!], basis);
	assert.equal(reply.status, "refused", "no corrected source, no corrected-run outcome");
});

test("VM04/VM08 a corrected path is substantiated only by its re-execution; an unrunnable correction stays blocked", async () => {
	const receipt = await run("c1");
	const stale = receipt.results.find((r: { name: string }) => r.name === "stale");
	assert.equal(stale.steps[0].stdout, "ADD OK");
	assert.equal(stale.steps[0].exitCode, 0);
	assert.equal(receipt.results.find((r: { name: string }) => r.name === "moved").sanity.exitCode, 127);
	const refs = [receipts.c0!, receipts.c1!];
	const unsubstantiated = await classify("c1", { ...outcome, moved: { status: "changed", reason: "Path corrected" } }, refs, basis);
	assert.equal(unsubstantiated.reply.status, "refused", "a correction that cannot run is not a successful change");
	const { reply, assignment } = await classify("c1", outcome, refs, basis);
	assert.equal(reply.status, "accepted", JSON.stringify(reply));
	assert.deepEqual(statuses(assignment), {
		discover: "clean",
		"full-suite": "clean",
		typecheck: "clean",
		lint: "clean",
		stale: "changed",
		product: "blocked/product",
		fixture: "blocked/prerequisite",
		moved: "blocked/prerequisite",
	});
});

test("VM09 a changed claim needs the basis receipt and a basis change", async () => {
	assert.equal((await classify("c1", outcome, [receipts.c1!], basis)).reply.status, "refused", "basis receipt is required");
	const relabeled = { ...outcome, lint: { status: "changed", reason: "rewrote it" } };
	assert.equal((await classify("c1", relabeled, [receipts.c0!, receipts.c1!], basis)).reply.status, "refused", "lint was not drift");
	const notBasis = assignments().find((a) => a.report === receipts.c0)!.id;
	assert.equal((await classify("c1", outcome, [receipts.c0!, receipts.c1!], notBasis)).reply.status, "refused", "runner is no basis");
});

test("VM05 maintenance cannot lower a product expectation", async () => {
	await run("c2");
	const { reply } = await classify(
		"c2",
		{ ...outcome, product: { status: "clean", reason: "exits zero" } },
		[receipts.c0!, receipts.c2!],
		basis,
	);
	assert.equal(reply.status, "refused", "a blocked row's definition is not maintenance's to change");
	const kept = await classify("c2", outcome, [receipts.c0!, receipts.c2!], basis);
	assert.equal(kept.reply.status, "refused", "the lowered row refuses whatever it is classified");
});

test("VM06 maintenance cannot modify product code", async () => {
	await run("c3");
	const { reply } = await classify(
		"c3",
		{ ...outcome, product: { status: "clean", reason: "prints 4 now" } },
		[receipts.c0!, receipts.c3!],
		basis,
	);
	assert.equal(reply.status, "refused", "product.js is not a verifier file");
	const kept = await classify("c3", outcome, [receipts.c0!, receipts.c3!], basis);
	assert.equal(kept.reply.status, "refused", "the product edit refuses whatever the classification");
});

test("VM07 a drift correction keeps the row's expectations", async () => {
	await run("c4");
	const { reply } = await classify("c4", outcome, [receipts.c0!, receipts.c4!], basis);
	assert.equal(reply.status, "refused", "stale's expectations stay ADD OK");
});

test("VM12 receipts and classifications survive export and reopen exactly", async () => {
	const reports = assignments().filter((a) => a.report && a.slice.startsWith("maintenance:"));
	const classified = reports.filter((a) => (a as { maintenance?: unknown }).maintenance);
	assert.equal(classified.length, 3, "VM02, VM03/VM11 and VM04 classifications");
	const exported = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:2" } }));
	assert.ok("manifest" in exported);
	const bytes = new Map<string, string>();
	for (const a of reports) {
		const read = await Effect.runPromise(f.ledger.artifact(admin, { read: a.report! }));
		assert.ok("content" in read);
		bytes.set(a.report!, read.content.toString());
		assert.equal(Buffer.from(exported.content[a.report!]!, "base64").toString(), read.content.toString());
	}
	const before = Object.fromEntries(classified.map((a) => [a.id, statuses(a)]));
	await f.reopen(new Engine({ ownedChecks: config as never }));
	for (const [ref, text] of bytes) {
		const read = await Effect.runPromise(f.ledger.artifact(admin, { read: ref }));
		assert.ok("content" in read);
		assert.equal(read.content.toString(), text);
	}
	assert.deepEqual(
		Object.fromEntries(
			assignments()
				.filter((a) => before[a.id])
				.map((a) => [a.id, statuses(a)]),
		),
		before,
		"retained per-row statuses survive reopen",
	);
});
