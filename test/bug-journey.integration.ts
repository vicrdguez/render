// BJ16: owned Linux execution proves the regression red on the reported behavior and correct on prepared X.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { accepted, captureFile, fixture } from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";

type Step = { exitCode: number; stdout: string; stderr: string; platform: { os: string } };
type Retained = { verification: { results: { name: string; status: string; steps: Step[] }[] } };

test("BJ16 a missing tool is reported, the real failure is red-on-the-bug, and prepared X carries the correction", async () => {
	const t = await fixture({ bug: true });
	try {
		const opening = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
		const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
		await t.wait(() => /^awaiting_watchdog/.test(passes()[0]?.handoff?.blocker ?? ""), "bug pass prepared and checked");
		const read = async (ref: string) => {
			const value = await t.f.ledger.artifact(admin, { read: ref });
			assert.ok("content" in value, `read ${ref}`);
			return value.content.toString();
		};
		const writer = t.assignments().find((a) => a.id === opening.assignment)!;
		assert.equal(writer.status, "submitted");
		const pass = passes()[0]!;
		assert.equal(pass.reproduction?.red, true, "the second reproduction is red-on-the-bug");
		const red = JSON.parse(await read(pass.reproduction!.source)) as Retained;
		const suite = red.verification.results.find((r) => r.name === "full-suite")!;
		assert.equal(suite.status, "failed");
		assert.equal(suite.steps[0]!.exitCode, 1);
		assert.equal(suite.steps[0]!.platform.os, "linux");
		assert.match(suite.steps[0]!.stdout, /value is A/, "actual Linux output shows the reported wrong behavior");
		assert.equal(t.assignments().filter((a) => a.parent === writer.id).length, 2, "the refused early Audit staged no reviewers");
		const history = await t.f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in history);
		const reproductions = Object.values(history.content)
			.map((b) => Buffer.from(b, "base64").toString())
			.filter((text) => text.includes('"verification"') && text.includes("missing-tool"))
			.map((text) => JSON.parse(text) as Retained)
			.filter((r) => r.verification?.results?.some((x) => x.name === "full-suite" && x.steps[0]?.exitCode === 127));
		assert.ok(reproductions.length >= 1, "the missing-tool reproduction (exit 127) is retained, not discarded");
		assert.equal(captureFile(await read(pass.captureA!), "value"), "A\n", "A was captured only after the red reproduction, before the fix");
		const prepared = JSON.parse(await read(pass.handoff!.preparations!.at(-1)!)) as {
			outcome: string;
			checks: { results: { name: string; status: string }[] };
		};
		assert.equal(prepared.outcome, "checked");
		assert.equal(prepared.checks.results.find((r) => r.name === "full-suite")?.status, "completed", "correct on final prepared source");
	} finally {
		await t.close();
	}
});
