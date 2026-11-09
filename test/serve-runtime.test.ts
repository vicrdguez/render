// `render serve` wires the runtime from its data directory and flags. Failure cases first: a host that starts with no
// owned Effects or Sandboxes, one that refuses to start without Docker, a GitHub token or a pi login instead of
// reporting what is missing, a token read once at startup so a later one never applies, a forge that reports ready
// with no token, and a token that reaches the host's or the CLI's output.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { until } from "./support/chat.ts";
import { fakeGitHub, TOKEN } from "./support/github.ts";
import { cli, startHost, tempDir } from "./support/host.ts";
import { git } from "./support/source.ts";

const PI_AUTH = fileURLToPath(new URL("./support/fixture-auth.json", import.meta.url));
const dockerUp = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"]).status === 0;

test("serve wires Effects, Sandboxes, the GitHub forge and pi logins; a token set later applies without a restart", async () => {
	const gh = await fakeGitHub();
	const dir = await tempDir("serve-runtime");
	const started = startHost(join(dir.path, "data"), {}, [
		"--pi-auth",
		PI_AUTH,
		"--github-api",
		gh.config.api,
		"--github-git",
		gh.config.git,
	]);
	try {
		const host = await started;
		assert.deepEqual(host.ready.runtime, {
			effects: "ready",
			sandboxes: dockerUp ? "ready" : (host.ready.runtime as { sandboxes: unknown }).sandboxes,
			forge: { blocked: "github_token_missing: set the github-token secret" },
			logins: "ready",
		});
		if (!dockerUp)
			assert.match(String((host.ready.runtime as { sandboxes: { blocked: string } }).sandboxes.blocked), /^docker_unavailable: /);

		const enrolled = await cli(["admin", "--data", host.data, "enroll", "--label", "laptop"]);
		const token = join(dir.path, "laptop.token");
		await writeFile(token, String(enrolled.json.bearer), { mode: 0o600 });
		const set = await cli(["--url", host.url, "--token-file", token, "secrets", "set", "github-token"], { input: TOKEN });
		assert.equal(set.code, 0, set.stdout + set.stderr);
		const status = await cli(["admin", "--data", host.data, "status"]);
		assert.equal(status.code, 0, status.stderr);
		assert.equal((status.json.runtime as { forge: unknown }).forge, "ready", "the token set after startup applies");
		assert.ok(
			gh.requests.some((r) => r.method === "GET" && r.path === "/user" && r.authorization === `Bearer ${TOKEN}`),
			"the forge asked GitHub whose token it is",
		);
		for (const output of [host.stdout.join("\n"), host.stderr.join("\n"), set.stdout, set.stderr, status.stdout])
			assert.equal(output.includes(TOKEN), false);
	} finally {
		await started.then(
			(host) => host.stop(),
			() => undefined,
		);
		await dir.remove();
		await gh.close();
	}
});

test("serve starts without Docker, a GitHub token or pi logins and reports each as blocked", async () => {
	const dir = await tempDir("serve-bare");
	// Git stays reachable; Docker does not.
	const started = startHost(join(dir.path, "data"), { PATH: "/usr/bin:/bin" });
	try {
		const host = await started;
		const runtime = host.ready.runtime as Record<string, { blocked: string } | string>;
		assert.equal(runtime.effects, "ready");
		assert.match((runtime.sandboxes as { blocked: string }).blocked, /^docker_unavailable: /);
		assert.deepEqual(runtime.forge, { blocked: "github_token_missing: set the github-token secret" });
		assert.match((runtime.logins as { blocked: string }).blocked, /^native_provider_configuration_missing: /);
		const status = await cli(["admin", "--data", host.data, "status"]);
		assert.equal(status.code, 0, "the host serves");
	} finally {
		await started.then(
			(host) => host.stop(),
			() => undefined,
		);
		await dir.remove();
	}
});

/** A bare repository with one commit on `main`. */
function bareRemote(root: string): { url: string; commit: string } {
	const repo = join(root, "remote.git");
	spawnSync("git", ["init", "--bare", "-q", repo]);
	const blob = git(repo, ["hash-object", "-w", "--stdin"], "# Render\n").toString().trim();
	const tree = git(repo, ["mktree"], `100644 blob ${blob}\tREADME.md\n`).toString().trim();
	const commit = git(repo, ["commit-tree", tree, "-m", "First"]).toString().trim();
	git(repo, ["update-ref", "refs/heads/main", commit]);
	return { url: `file://${repo}`, commit };
}

test("a typed message launches the coordinator on the project's fetched commit; a GitHub project without a token shows a blocker", async () => {
	const gh = await fakeGitHub();
	const dir = await tempDir("serve-launch");
	const remote = bareRemote(dir.path);
	const started = startHost(join(dir.path, "data"), {}, ["--github-api", gh.config.api, "--github-git", gh.config.git]);
	try {
		const host = await started;
		const enrolled = await cli(["admin", "--data", host.data, "enroll", "--label", "laptop"]);
		const token = join(dir.path, "laptop.token");
		await writeFile(token, String(enrolled.json.bearer), { mode: 0o600 });
		const as = ["--url", host.url, "--token-file", token];
		const workflowOn = async (remoteUrl: string) => {
			const added = await cli([
				...as,
				"add-project",
				"--name",
				"P",
				"--remote",
				remoteUrl,
				"--default-branch",
				"main",
				"--check-image",
				"render-check:x",
			]);
			const project = String((added.json.result as { project: string }).project);
			const created = await cli([...as, "create-workflow", "--title", "Work", "--project", project]);
			const workflow = String((created.json.result as { workflow: string }).workflow);
			const sent = await cli([...as, "send", "--workflow", workflow, "--text", "Fix the README.", "--follow-up"]);
			assert.equal(sent.code, 0, sent.stdout + sent.stderr);
			return workflow;
		};
		const view = async (workflow: string) =>
			(
				(await cli([...as, "snapshot"])).json.workflows as {
					workflow: string;
					blocker: { reason: string } | null;
					messages: { coordinator: unknown };
				}[]
			).find((w) => w.workflow === workflow)!;
		const local = await workflowOn(remote.url);
		const github = await workflowOn(`${gh.config.git}/${gh.owner}/${gh.name}.git`);
		const launched = await until(async () => (await view(local)).messages.coordinator ?? undefined, "the launched coordinator", 30_000);
		assert.ok(launched, "Effects fetched the local remote and the launcher assigned the coordinator");
		const snap = await cli([...as, "snapshot"]);
		const profile = (snap.json.assignments as { packet: { profile: string; role: string; slice?: string } }[]).find(
			(a) => a.packet.role === "coordinator",
		);
		assert.ok(profile);
		const pinned = await cli([...as, "read", "--revision", profile.packet.profile, "--out", join(dir.path, "profile.json")]);
		assert.equal(pinned.code, 0, pinned.stdout);
		assert.match(await readFile(join(dir.path, "profile.json"), "utf8"), new RegExp(remote.commit));
		const blocked = await until(async () => (await view(github)).blocker ?? undefined, "the GitHub project's blocker", 30_000);
		assert.match(blocked.reason, /github_token_missing/);
	} finally {
		await started.then(
			(host) => host.stop(),
			() => undefined,
		);
		await dir.remove();
		await gh.close();
	}
});
