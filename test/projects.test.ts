// P1, P2, P3 and P6: human-added Project records over the real host protocol, and the Kernel principal matrix.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as kernel from "../src/kernel/kernel.ts";
import { adminRequest, enroll, envelope, http, type Reply, snapshot, startHost, tempDir } from "./support/host.ts";

const PROJECT = { name: "Render", remote: "https://github.com/octo/render.git", defaultBranch: "main", checkImage: "render-check:node24" };

async function command(host: { url: string; ready: { authorityEpoch?: unknown } }, bearer: string, c: Record<string, unknown>) {
	return http(host.url, "POST", "/v1/commands", { bearer, body: envelope(String(host.ready.authorityEpoch), c) });
}
const result = (r: Reply) => r.body.result as Record<string, unknown>;

test("P1 a project-wide human adds a project; a narrow device is refused forbidden_scope", async () => {
	const dir = await tempDir("projects-p1");
	const host = await startHost(dir.path);
	try {
		const wide = await enroll(host, "wide");
		const added = await command(host, wide.bearer, { type: "addProject", ...PROJECT });
		assert.equal(added.status, 200, added.text);
		assert.match(String(result(added).project), /^project:\d+$/);
		assert.equal(result(added).revision, 1);
		const local = await adminRequest(
			host.admin,
			"POST",
			"/v1/admin/commands",
			envelope(String(host.ready.authorityEpoch), { type: "addProject", ...PROJECT, name: "Local" }),
		);
		assert.equal(local.status, 200, local.text);
		const workflow = String(result(await command(host, wide.bearer, { type: "createWorkflow", title: "W", project: result(added).project })).workflow);
		const narrow = await enroll(host, "narrow", [workflow]);
		const refused = await command(host, narrow.bearer, { type: "addProject", ...PROJECT, name: "Narrow" });
		assert.equal(refused.status, 403, refused.text);
		assert.equal(refused.body.code, "forbidden_scope");
		const projects = (await snapshot(host, wide.bearer)).body.projects as { name: string; principles: string }[];
		assert.deepEqual(
			projects.map((p) => p.name),
			["Render", "Local"],
			"the refused command added nothing",
		);
		assert.equal(projects[0]!.principles, "AGENTS.md", "principles default to AGENTS.md");
	} finally {
		await host.stop();
		await dir.remove();
	}
});

test("P1 an assignment agent or the host cannot add or edit a project", () => {
	const add = { type: "addProject", ...PROJECT } as const;
	const edit = { type: "editProject", project: "project:2", expectedRevision: 1, ...PROJECT, principles: "AGENTS.md" } as const;
	const principals: kernel.Principal[] = [
		{ kind: "assignment-agent", assignment: "assignment:3", generation: 1, attempt: "attempt:3", role: "coordinator" },
		{ kind: "host", scope: "scheduling" },
		{ kind: "host", scope: "effects" },
	];
	for (const principal of principals)
		for (const c of [add, edit]) {
			const refusal = Effect.runSync(
				Effect.flip(
					kernel.change({ workflow: null, document: null, device: null }, c, { principal, sequence: 9, ids: { fact: "fact:9" } }),
				),
			);
			assert.equal(refusal.code, "forbidden_principal", `${principal.kind} ${c.type}`);
		}
});

test("P2 createWorkflow needs an existing project, and nothing changes a workflow's project", async () => {
	const dir = await tempDir("projects-p2");
	const host = await startHost(dir.path);
	try {
		const { bearer } = await enroll(host, "wide");
		const missing = await command(host, bearer, { type: "createWorkflow", title: "No project" });
		assert.equal(missing.body.code, "invalid_content", missing.text);
		const unknown = await command(host, bearer, { type: "createWorkflow", title: "Unknown", project: "project:999" });
		assert.equal(unknown.body.code, "not_found", unknown.text);
		const project = String(result(await command(host, bearer, { type: "addProject", ...PROJECT })).project);
		const created = await command(host, bearer, { type: "createWorkflow", title: "W", project });
		assert.equal(created.status, 200, created.text);
		const workflow = String(result(created).workflow);
		const other = String(result(await command(host, bearer, { type: "addProject", ...PROJECT, name: "Other" })).project);
		const save = await http(host.url, "POST", "/v1/commands", {
			bearer,
			body: envelope(
				String(host.ready.authorityEpoch),
				{ type: "saveDocument", document: "ground", mediaType: "text/plain", content: "", project: other },
				{ workflow, expected: { document: null } },
			),
		});
		assert.equal(save.body.code, "malformed_envelope", "no workflow command carries a project");
		const edited = await command(host, bearer, {
			type: "editProject",
			project,
			expectedRevision: 1,
			name: "Renamed",
			defaultBranch: "trunk",
			checkImage: "render-check:node26",
			principles: "docs/AGENTS.md",
		});
		assert.equal(edited.status, 200, edited.text);
		const view = ((await snapshot(host, bearer)).body.workflows as { workflow: string; project: string }[]).find(
			(w) => w.workflow === workflow,
		);
		assert.equal(view?.project, project);
	} finally {
		await host.stop();
		await dir.remove();
	}
});

test("P3 a stale editProject refuses stale_basis naming the current revision, and the remote never changes", async () => {
	const dir = await tempDir("projects-p3");
	const host = await startHost(dir.path);
	try {
		const { bearer } = await enroll(host, "wide");
		const project = String(result(await command(host, bearer, { type: "addProject", ...PROJECT })).project);
		const edit = (expectedRevision: number, name: string) =>
			command(host, bearer, {
				type: "editProject",
				project,
				expectedRevision,
				name,
				defaultBranch: "main",
				checkImage: PROJECT.checkImage,
				principles: "AGENTS.md",
			});
		assert.equal(result(await edit(1, "Second")).revision, 2);
		const stale = await edit(1, "Lost");
		assert.equal(stale.status, 409, stale.text);
		assert.equal(stale.body.code, "stale_basis");
		assert.deepEqual(stale.body.refs, { project, current: "2", expected: "1" });
		const remote = await command(host, bearer, {
			type: "editProject",
			project,
			expectedRevision: 2,
			name: "Moved",
			remote: "https://github.com/octo/other.git",
			defaultBranch: "main",
			checkImage: PROJECT.checkImage,
			principles: "AGENTS.md",
		});
		assert.equal(remote.body.code, "malformed_envelope", "a remote edit is not a command (X1)");
		const current = ((await snapshot(host, bearer)).body.projects as { id: string; name: string; remote: string; revision: number }[]).find(
			(p) => p.id === project,
		);
		assert.deepEqual([current?.name, current?.remote, current?.revision], ["Second", PROJECT.remote, 2]);
	} finally {
		await host.stop();
		await dir.remove();
	}
});

test("P6 a device scoped to a workflow of project A sees neither project B in its snapshot nor in its export", async () => {
	const dir = await tempDir("projects-p6");
	const host = await startHost(dir.path);
	try {
		const { bearer } = await enroll(host, "wide");
		const a = String(result(await command(host, bearer, { type: "addProject", ...PROJECT, name: "Alpha" })).project);
		const b = String(result(await command(host, bearer, { type: "addProject", ...PROJECT, name: "Beta" })).project);
		const workflow = String(result(await command(host, bearer, { type: "createWorkflow", title: "A work", project: a })).workflow);
		await command(host, bearer, { type: "createWorkflow", title: "B work", project: b });
		const narrow = await enroll(host, "narrow", [workflow]);
		const seen = (await snapshot(host, narrow.bearer)).body.projects as { id: string }[];
		assert.deepEqual(
			seen.map((p) => p.id),
			[a],
		);
		const exported = await http(host.url, "GET", `/v1/export?workflow=${encodeURIComponent(workflow)}`, { bearer: narrow.bearer });
		assert.equal(exported.status, 200, exported.text);
		const rows = (exported.body.jsonl as string)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { kind: string; project?: { id: string; name: string } });
		assert.deepEqual(
			rows.filter((r) => r.kind === "project").map((r) => r.project?.name),
			["Alpha"],
		);
		assert.ok(!exported.text.includes("Beta"), "nothing of project B reaches the narrow export");
		const all = await http(host.url, "GET", "/v1/export", { bearer });
		assert.equal(all.status, 200, all.text);
		const projects = (all.body.jsonl as string)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { kind: string; digest: string; byteLength: number; project: { name: string } })
			.filter((r) => r.kind === "project");
		assert.deepEqual(
			projects.map((r) => r.project.name),
			["Alpha", "Beta"],
		);
		assert.ok(projects.every((r) => /^sha256:[0-9a-f]{64}$/.test(r.digest) && r.byteLength > 0), "revisions keep digest and length");
	} finally {
		await host.stop();
		await dir.remove();
	}
});
