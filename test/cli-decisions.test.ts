// Human decisions from the CLI, over the device route, against a real Ledger and transport. Failure cases first: a CLI
// that computes or alters a basis instead of sending the host's (K1), one that retries or exits 0 after `stale_basis`
// (K2), a rerun with the same command id that sends a second command instead of showing the original receipt (K3), a
// decision accepted as any principal other than the enrolled device, a decision sent when the host offers a different
// next action, and a client that imports Kernel code.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { deviceServer } from "../src/host/transport.ts";
import type { Checkpoints } from "../src/kernel/checkpoints.ts";
import type { RoleAssignment } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { mintContext } from "../src/ledger/principals.ts";
import { device } from "./support/chat.ts";
import { cli, ROOT, tempDir } from "./support/host.ts";
import { accepted, LedgerOnlyEngine, reviewedIntake } from "./support/implementation.ts";
import { launcher } from "./support/launcher.ts";
import { admin, allowSameFamily, packet, roleFixture } from "./support/roles.ts";

const WORKFLOW = "workflow:3";
type Fixture = Awaited<ReturnType<typeof roleFixture>>;

/** The real device transport over the fixture's Ledger, and an enrolled all-workflow device's CLI arguments. */
async function serve(f: Fixture, proxy?: (forward: () => Promise<void>) => Promise<void>) {
	const host: Server = deviceServer({ ledger: f.ledger, engine: f.engine }, f.principals);
	await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
	const target = `http://127.0.0.1:${(host.address() as AddressInfo).port}`;
	const posts: string[] = [];
	// An optional interposer between the CLI and the host: it can change Ledger state just before a command arrives.
	const front = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", async () => {
			const body = Buffer.concat(chunks);
			if (req.method === "POST") posts.push(body.toString());
			const forward = async () => {
				const reply = await fetch(`${target}${req.url}`, {
					method: req.method,
					headers: req.headers as Record<string, string>,
					body: req.method === "GET" ? undefined : body,
				});
				res.writeHead(reply.status, { "content-type": reply.headers.get("content-type") ?? "application/json" });
				res.end(Buffer.from(await reply.arrayBuffer()));
			};
			await (req.method === "POST" && proxy ? proxy(forward) : forward());
		});
	});
	await new Promise<void>((resolve) => front.listen(0, "127.0.0.1", resolve));
	const laptop = await device(f);
	const dir = await tempDir("cli-decisions");
	const token = join(dir.path, "laptop.token");
	await writeFile(token, laptop.bearer, { mode: 0o600 });
	return {
		laptop,
		posts,
		as: ["--url", `http://127.0.0.1:${(front.address() as AddressInfo).port}`, "--token-file", token],
		async close() {
			for (const server of [front, host]) {
				server.closeAllConnections();
				await new Promise<void>((resolve) => server.close(() => resolve()));
			}
			await dir.remove();
		},
	};
}

function view(f: Fixture) {
	return ((f.ledger.snapshot(admin) as Frame).workflows as { workflow: string; nextHumanAction: Record<string, unknown> }[]).find(
		(w) => w.workflow === WORKFLOW,
	)!;
}
const assignments = (f: Fixture) => (f.ledger.snapshot(admin) as Frame).assignments as RoleAssignment[];
const receipt = async (f: Fixture, id: string) => Effect.runPromise(f.ledger.receipt(admin, id));

test("K1 accept-intake sends the host's intake basis unchanged as the enrolled device; K3 a rerun with its command id shows the original receipt", async () => {
	const t = await reviewedIntake();
	const s = await serve(t.f);
	try {
		const draft = t.state().drafts[0]!;
		assert.deepEqual(view(t.f).nextHumanAction, {
			type: "reviewIntake",
			intake: t.intake,
			annotations: 0,
			basis: { intake: t.intake, review: t.report, annotations: 0, policyBinding: draft.policyBinding, decisions: [] },
		});
		const first = await cli([...s.as, "accept-intake", "--workflow", WORKFLOW, "--command-id", "accept-1"]);
		assert.equal(first.code, 0, first.stdout + first.stderr);
		assert.equal(first.json.status, "accepted");
		assert.deepEqual(JSON.parse(s.posts[0]!).command, {
			type: "acceptIntake",
			intake: t.intake,
			review: t.report,
			annotations: 0,
			policyBinding: draft.policyBinding,
			decisions: [],
		});
		assert.ok(t.state().drafts[0]!.acceptance, "the intake is accepted");
		assert.deepEqual(
			t.state().slices.map((x) => [x.id, x.status]),
			[["read-fix", "accepted"]],
		);
		const stored = await receipt(t.f, "accept-1");
		assert.ok(!("code" in stored));
		assert.deepEqual(stored.acceptedBy, { principal: "human", route: "device", device: s.laptop.id });

		const again = await cli([...s.as, "accept-intake", "--workflow", WORKFLOW, "--command-id", "accept-1"]);
		assert.equal(again.code, 0, again.stdout + again.stderr);
		const { duplicate: _, ...original } = first.json;
		assert.deepEqual(again.json, original, "the original receipt");
		assert.equal(s.posts.length, 1, "no second command");

		const fresh = await cli([...s.as, "accept-intake", "--workflow", WORKFLOW]);
		assert.equal(fresh.code, 1, "no intake awaits review");
		assert.equal((fresh.json.nextHumanAction as { type: string }).type, view(t.f).nextHumanAction.type);
		assert.equal(s.posts.length, 1);
	} finally {
		await s.close();
		await t.f.close();
	}
});

test("K2 a basis that changes before the command arrives: the CLI prints the new basis and exits nonzero without retrying", async () => {
	const t = await reviewedIntake();
	let raced = false;
	const s = await serve(t.f, async (forward) => {
		if (!raced) {
			raced = true;
			accepted(await t.f.command({ type: "saveIntakeConcern", intake: t.intake, text: "Keep the old name." }, admin, "race-concern"));
		}
		await forward();
	});
	try {
		const r = await cli([...s.as, "accept-intake", "--workflow", WORKFLOW]);
		assert.equal(r.code, 1, r.stdout + r.stderr);
		assert.equal((r.json.refused as { code: string }).code, "stale_basis");
		assert.deepEqual(r.json.nextHumanAction, view(t.f).nextHumanAction, "the current host-authored action");
		assert.equal((r.json.nextHumanAction as { annotations: number }).annotations, 1);
		assert.equal(s.posts.length, 1, "no retry");
		assert.equal(t.state().drafts[0]!.acceptance, null);
	} finally {
		await s.close();
		await t.f.close();
	}
});

const MANIFEST = {
	schema: 1,
	stage: "seams",
	nodes: [
		{
			id: "N1",
			decision: "Authority boundary",
			rationale: "Keep legality local",
			alternatives: ["combined", "separate"],
			evidence: [],
			classification: "judgment",
			default: "separate",
		},
	],
	decompositions: [
		{
			id: "combined",
			modules: ["Runner"],
			dependencies: ["execution"],
			verificationSeams: ["run"],
			depth: "one interface",
			locality: "coupled",
			deletion: "removes legality boundary",
		},
		{
			id: "separate",
			modules: ["Authority", "Runner"],
			dependencies: ["authority", "execution"],
			verificationSeams: ["change", "execute"],
			depth: "hide persistence",
			locality: "separate reasons",
			deletion: "spreads legality into callers",
		},
	],
	verificationStrategy: "Pure legality schedules.",
	incidentalChoices: ["None."],
	responses: [],
};

/** An emitted, independently reviewed seams checkpoint with one human concern saved after its review. */
async function reviewedCheckpoint() {
	const f = await roleFixture(new LedgerOnlyEngine());
	await allowSameFamily(f.ledger);
	const start = async (a: RoleAssignment) => {
		accepted(
			await f.command({
				type: "stageTask",
				assignment: a.id,
				generation: a.generation,
				attempt: a.attempt,
				executorEpoch: f.ledger.status().executorEpoch,
			}),
		);
		return mintContext({ kind: "assignment-agent", assignment: a.id, generation: a.generation, attempt: a.attempt, role: a.packet.role });
	};
	const ground = accepted(
		await Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "ground",
					workflow: WORKFLOW,
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "ground",
						mediaType: "text/plain",
						content: Buffer.from(
							JSON.stringify({ schema: 1, shape: { value: "design", origin: "human", confirmed: true }, goal: "Design" }),
						).toString("base64"),
					},
				},
				admin,
			),
		),
	).revision as string;
	const coordinator = accepted(
		await f.command({
			type: "assignTask",
			slice: "design",
			delivery: false,
			packet: packet({ inputs: [ground], requests: [{ key: "challenge", packet: packet({ role: "challenger" }) }] }),
		}),
	).assignment as string;
	const actor = await start(assignments(f).find((a) => a.id === coordinator)!);
	const request = accepted(
		await f.command(
			{ type: "requestCheckpoint", stage: "seams", scope: ground, required: { candidates: false, experiment: false } },
			actor,
		),
	).request as string;
	const manifest = { ...MANIFEST, nodes: MANIFEST.nodes.map((n) => ({ ...n, evidence: [ground] })) };
	accepted(await f.command({ type: "stageCheckpoint", request, text: "# Seams\n", manifest }, actor));
	const review = accepted(await f.command({ type: "requestCheckpointReview", request, key: "challenge" }, actor)).assignment as string;
	const challenger = assignments(f).find((a) => a.id === review)!;
	const report = accepted(
		await f.command(
			{
				type: "submitRoleResult",
				text: JSON.stringify({
					schema: 1,
					...challenger.checkpointReview,
					checks: {
						alternatives: "checked",
						interactions: "checked",
						scale: "checked",
						usage: "checked",
						incidentalChoices: "checked",
						nearbyCopying: "checked",
					},
					objections: [],
				}),
				supports: [],
			},
			await start(challenger),
		),
	).report as string;
	accepted(await f.command({ type: "emitCheckpoint", request, review: report, contested: [] }, actor));
	const checkpoints = () => ((f.ledger.snapshot(admin) as Frame).workflows as { checkpoints: Checkpoints }[])[0]!.checkpoints;
	const emission = checkpoints().requests[0]!.emission!;
	const concern = accepted(
		await f.command({ type: "saveCheckpointConcern", request, base: emission, text: "Please combine these." }, admin, "concern"),
	).concern as string;
	return { f, request, emission, concern, checkpoints };
}

test("K1 approve sends the host's checkpoint basis unchanged with only the human's decisions and nonbinding choices", async () => {
	const t = await reviewedCheckpoint();
	const s = await serve(t.f);
	try {
		const r = t.checkpoints().requests[0]!;
		assert.deepEqual(view(t.f).nextHumanAction, {
			type: "reviewCheckpoint",
			request: t.request,
			emission: t.emission,
			annotations: 1,
			basis: { request: t.request, emission: t.emission, manifest: r.manifest, annotations: 1, policyBinding: r.policyBinding },
			decisions: [{ node: "N1", alternatives: ["combined", "separate"] }],
			concerns: [t.concern],
		});
		const undecided = await cli([...s.as, "approve", "--workflow", WORKFLOW]);
		assert.notEqual(undecided.code, 0, "every node needs the human's decision");
		assert.match(undecided.stderr, /N1: combined \| separate/);
		assert.equal(s.posts.length, 0);

		const approved = await cli([...s.as, "approve", "--workflow", WORKFLOW, "--decide", "N1=separate", "--nonbinding", t.concern]);
		assert.equal(approved.code, 0, approved.stdout + approved.stderr);
		assert.deepEqual(JSON.parse(s.posts[0]!).command, {
			type: "approveCheckpoint",
			request: t.request,
			emission: t.emission,
			manifest: r.manifest,
			annotations: 1,
			policyBinding: r.policyBinding,
			decisions: { N1: "separate" },
			nonbinding: [t.concern],
		});
		assert.equal(t.checkpoints().requests[0]!.status, "approved");
		assert.equal(t.checkpoints().requests[0]!.approved, t.emission);
		assert.deepEqual(approved.json.acceptedBy, { principal: "human", route: "device", device: s.laptop.id });
	} finally {
		await s.close();
		await t.f.close();
	}
});

test("failure paths: concerns and checkpoint cancellation name the revision the host offers", async () => {
	const t = await reviewedCheckpoint();
	const s = await serve(t.f);
	try {
		const concern = await cli([...s.as, "checkpoint-concern", "--workflow", WORKFLOW, "--text", "Split the runner."]);
		assert.equal(concern.code, 0, concern.stdout + concern.stderr);
		assert.deepEqual(JSON.parse(s.posts[0]!).command, {
			type: "saveCheckpointConcern",
			request: t.request,
			base: t.emission,
			text: "Split the runner.",
			kind: "reason",
		});
		assert.equal(t.checkpoints().concerns.length, 2);
		const canceled = await cli([...s.as, "cancel-checkpoint", "--workflow", WORKFLOW, "--reason", "Out of scope."]);
		assert.equal(canceled.code, 0, canceled.stdout + canceled.stderr);
		assert.deepEqual(JSON.parse(s.posts[1]!).command, {
			type: "cancelCheckpoint",
			request: t.request,
			expectedEmission: t.emission,
			reason: "Out of scope.",
		});
		assert.equal(t.checkpoints().requests[0]!.status, "canceled");
	} finally {
		await s.close();
		await t.f.close();
	}
	const i = await reviewedIntake();
	const si = await serve(i.f);
	try {
		const concern = await cli([...si.as, "intake-concern", "--workflow", WORKFLOW, "--text", "Keep the old name."]);
		assert.equal(concern.code, 0, concern.stdout + concern.stderr);
		assert.deepEqual(JSON.parse(si.posts[0]!).command, { type: "saveIntakeConcern", intake: i.intake, text: "Keep the old name." });
		assert.equal(i.state().drafts[0]!.annotations, 1);
		assert.equal(i.state().drafts[0]!.acceptance, null);
	} finally {
		await si.close();
		await i.f.close();
	}
});

test("cancel names the blocked assignment, generation and Attempt the host offers", async () => {
	const f = await roleFixture(new LedgerOnlyEngine());
	const s = await serve(f);
	try {
		const id = accepted(await f.command({ type: "assignTask", slice: "stuck", delivery: false, packet: packet() })).assignment as string;
		const a = assignments(f).find((x) => x.id === id)!;
		accepted(
			await f.command({ type: "recordBlocker", assignment: a.id, generation: a.generation, attempt: a.attempt, reason: "provider_down" }),
		);
		assert.equal(view(f).nextHumanAction.type, "cancelWork");
		const r = await cli([...s.as, "cancel", "--workflow", WORKFLOW]);
		assert.equal(r.code, 0, r.stdout + r.stderr);
		assert.deepEqual(JSON.parse(s.posts[0]!).command, {
			type: "cancelWork",
			assignment: a.id,
			generation: a.generation,
			attempt: a.attempt,
		});
		assert.equal(assignments(f).find((x) => x.id === id)!.generation, a.generation + 1);
	} finally {
		await s.close();
		await f.close();
	}
});

test("the client imports nothing from Kernel", async () => {
	const dir = join(ROOT, "src/client");
	for (const file of await readdir(dir)) {
		const text = await readFile(join(dir, file), "utf8");
		assert.equal(/from\s+"[^"]*\/kernel\//.test(text), false, `${file} imports Kernel`);
	}
});

test("confirm-ground and accept-intake drive a launched workflow from the CLI with the host's bases", async () => {
	const t = await launcher();
	const s = await serve(t.f);
	try {
		await t.prompt();
		await t.until(() => t.view().nextHumanAction.type === "confirmGround", "Ground proposal offered");
		const action = t.view().nextHumanAction as { expected: string | null; content: string };
		const confirmed = await cli([...s.as, "confirm-ground", "--workflow", WORKFLOW]);
		assert.equal(confirmed.code, 0, confirmed.stdout + confirmed.stderr);
		const sent = JSON.parse(s.posts[0]!);
		assert.deepEqual(sent.expected, { document: action.expected });
		assert.equal(Buffer.from(sent.command.content, "base64").toString(), action.content);
		await t.until(() => !!(t.view().nextHumanAction as { basis?: unknown }).basis, "a reviewed intake");
		const acceptedIntake = await cli([...s.as, "accept-intake", "--workflow", WORKFLOW]);
		assert.equal(acceptedIntake.code, 0, acceptedIntake.stdout + acceptedIntake.stderr);
		await t.until(() => t.assignments().some((a) => a.packet.role === "implementer"), "the launched implementer");
	} finally {
		await s.close();
		await t.close();
	}
});
