// P4/P5 and X10 on the real Engine, SQLite, Effects Git and Docker Linux checks: preparation fetches the project's
// remote before it observes T, and checks run on the project's image tag, recorded as the digest it resolved to.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rename } from "node:fs/promises";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import type { ImplementationSource } from "../src/kernel/implementation.ts";
import type { ImplementationPass } from "../src/kernel/roles.ts";
import type { Frame } from "../src/ledger/ledger.ts";
import { accepted, fixture, holdAt, parked, releaseBarrier } from "./support/implementation-engine.ts";
import { admin } from "./support/roles.ts";
import { git } from "./support/source.ts";

type Prepared = {
	target: { commit: string };
	outcome: string;
	preparation: null | { result: string };
	checks: null | { results: { steps: { image?: string }[] }[] };
};

async function handedOff(t: Awaited<ReturnType<typeof fixture>>) {
	const passes = () => (t.f.ledger.snapshot(admin) as Frame).implementationPasses as ImplementationPass[];
	const read = async (ref: string) => {
		const value = await Effect.runPromise(t.f.ledger.artifact(admin, { read: ref }));
		assert.ok("content" in value, `read ${ref}`);
		return value.content.toString();
	};
	const P1 = accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer })).passRef as string;
	holdAt("before-target-observe", `preparation-observe:${P1}:0`);
	await parked("first target observation");
	const B = (JSON.parse(await read(passes()[0]!.handoff!.source)) as ImplementationSource).source.source;
	return { passes, read, base: t.writer.verification!.commit, B };
}

test("P4/X10 preparation fetches first, so T is the remote's advanced default branch; checks record the tag's digest", async () => {
	const t = await fixture({ successorStops: true, checkImage: "node:24-alpine" });
	try {
		const h = await handedOff(t);
		const repo = t.f.source.repo;
		const blob = git(repo, ["hash-object", "-w", "--stdin"], "T1\n").toString().trim();
		const tree = git(repo, ["mktree"], `${git(repo, ["ls-tree", h.base]).toString()}100644 blob ${blob}\ttarget\n`)
			.toString()
			.trim();
		const T1 = git(repo, ["commit-tree", tree, "-p", h.base], "Upstream moved\n").toString().trim();
		git(repo, ["update-ref", "refs/heads/fixture", T1]);
		releaseBarrier();
		await t.wait(() => !!h.passes()[0]?.handoff?.preparations?.length, "the first preparation is recorded");
		const x = JSON.parse(await h.read(h.passes()[0]!.handoff!.preparations![0]!)) as Prepared;
		assert.equal(x.target.commit, T1, "T is the fetched default branch, not the configured base");
		const digest = execFileSync("docker", ["image", "inspect", "--format", "{{.Id}}", "node:24-alpine"], { encoding: "utf8" }).trim();
		const images = new Set(x.checks?.results.flatMap((r) => r.steps.map((s) => s.image)) ?? []);
		assert.deepEqual([...images], [digest], "the project names the image by tag; each execution records its digest");
	} finally {
		releaseBarrier();
		await t.close();
	}
});

test("P5 an unreachable remote blocks preparation with project_fetch_failed and no T; the handed-off implementation stays", async () => {
	const t = await fixture({ successorStops: true });
	const repo = t.f.source.repo;
	try {
		const h = await handedOff(t);
		await rename(repo, `${repo}.unreachable`);
		releaseBarrier();
		await t.wait(() => /^project_fetch_failed: /.test(t.assignments().find((a) => a.passRef)?.blocker ?? ""), "preparation blocks");
		const pass = h.passes()[0]!;
		assert.deepEqual(pass.handoff?.preparations ?? [], [], "no preparation ran against a stale T");
		assert.equal(pass.handoff?.source !== undefined && h.B.commit.length > 0, true, "the sealed implementation is retained");
	} finally {
		releaseBarrier();
		await rename(`${repo}.unreachable`, repo).catch(() => {});
		await t.close();
	}
});
