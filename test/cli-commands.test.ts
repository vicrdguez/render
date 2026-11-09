// Projects, settings, secrets and chat from the CLI, as an enrolled device against a real host. Failure cases first: an
// edit that drops fields the human did not name or ignores a stale revision, a settings change without an expected
// revision, a secret value that reaches argv, stdout, stderr or the host's output, a message whose busy mode the CLI
// changes, a withdrawal or interrupt sent as another principal, and a terminal chat that misses the coordinator's reply
// or an interrupted run.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { stat, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai/providers/faux";
import { deviceServer } from "../src/host/transport.ts";
import { chatFixture, device, held, until, WORKFLOW } from "./support/chat.ts";
import { CLIENT_CLI, cli, type HostProcess, snapshot, startHost, tempDir, track } from "./support/host.ts";

describe("against a spawned host", () => {
	let dir: Awaited<ReturnType<typeof tempDir>>;
	let host: HostProcess;
	let as: string[];
	let bearer: string;
	before(async () => {
		dir = await tempDir("cli-commands");
		host = await startHost(join(dir.path, "data"));
		const enrolled = await cli(["admin", "--data", host.data, "enroll", "--label", "laptop"]);
		bearer = String(enrolled.json.bearer);
		const token = join(dir.path, "laptop.token");
		await writeFile(token, bearer, { mode: 0o600 });
		as = ["--url", host.url, "--token-file", token];
	});
	after(async () => {
		await host.stop();
		await dir.remove();
	});
	const projects = async () => (await snapshot(host, bearer)).body.projects as Record<string, unknown>[];

	test("add-project and edit-project: an edit keeps the fields it does not name and refuses a stale revision", async () => {
		const added = await cli([
			...as,
			"add-project",
			"--name",
			"Render",
			"--remote",
			"https://github.com/octo/render.git",
			"--default-branch",
			"main",
			"--check-image",
			"render-check:node24",
		]);
		assert.equal(added.code, 0, added.stdout + added.stderr);
		const project = String((added.json.result as { project: string }).project);
		const edited = await cli([...as, "edit-project", "--project", project, "--expected", "1", "--check-image", "render-check:node26"]);
		assert.equal(edited.code, 0, edited.stdout + edited.stderr);
		const current = (await projects()).find((p) => p.id === project);
		assert.deepEqual(
			{ ...current, createdAtSequence: 0 },
			{
				id: project,
				revision: 2,
				name: "Render",
				remote: "https://github.com/octo/render.git",
				defaultBranch: "main",
				checkImage: "render-check:node26",
				principles: "AGENTS.md",
				createdAtSequence: 0,
			},
		);
		const stale = await cli([...as, "edit-project", "--project", project, "--expected", "1", "--name", "Other"]);
		assert.equal(stale.code, 1);
		assert.equal(stale.json.code, "stale_basis");
		assert.equal((await projects()).find((p) => p.id === project)?.name, "Render");
	});

	test("settings show and change: a change names the revision it was edited from", async () => {
		const shown = await cli([...as, "settings", "show"]);
		assert.equal(shown.code, 0, shown.stdout + shown.stderr);
		assert.equal(shown.json.revision, 1);
		const value = shown.json.value as { forge: { actor: string | null } };
		const file = join(dir.path, "settings.json");
		await writeFile(file, JSON.stringify({ ...value, forge: { actor: "octo-bot" } }));
		const changed = await cli([...as, "settings", "change", "--file", file, "--expected", "1"]);
		assert.equal(changed.code, 0, changed.stdout + changed.stderr);
		const now = await cli([...as, "settings", "show"]);
		assert.equal(now.json.revision, 2);
		assert.deepEqual((now.json.value as typeof value).forge, { actor: "octo-bot" });
		const stale = await cli([...as, "settings", "change", "--file", file, "--expected", "1"]);
		assert.equal(stale.code, 1);
		assert.equal(stale.json.code, "stale_basis");
	});

	test("secrets set reads the value from stdin and nothing prints it; secrets list shows only whether it is set", async () => {
		const value = "ghp_cliSECRETvalue0123456789";
		const set = await cli([...as, "secrets", "set", "github-token"], { input: `${value}\n` });
		assert.equal(set.code, 0, set.stdout + set.stderr);
		assert.equal(set.json.set, true);
		const listed = await cli([...as, "secrets", "list"]);
		assert.equal(listed.code, 0);
		assert.deepEqual((listed.json.secrets as { name: string; set: boolean }[]).find((s) => s.name === "github-token")?.set, true);
		const empty = await cli([...as, "secrets", "set", "exa"], { input: "" });
		assert.notEqual(empty.code, 0, "an empty value is refused");
		for (const output of [set.stdout, set.stderr, listed.stdout, listed.stderr, host.stdout.join("\n"), host.stderr.join("\n")])
			assert.equal(output.includes(value), false, "no output carries the value");
		assert.equal((await stat(join(host.data, "secrets.json"))).mode & 0o777, 0o600);
	});

	test("send pins the busy mode the human chose; withdraw names the message by command id", async () => {
		const project = String((await projects())[0]?.id);
		const created = await cli([...as, "create-workflow", "--title", "Chat", "--project", project]);
		const workflow = String((created.json.result as { workflow: string }).workflow);
		const steer = await cli([...as, "send", "--workflow", workflow, "--text", "Look here.", "--steer", "--command-id", "m-steer"]);
		assert.equal(steer.code, 0, steer.stdout + steer.stderr);
		const follow = await cli([...as, "send", "--workflow", workflow, "--text", "Then this.", "--follow-up", "--command-id", "m-follow"]);
		assert.equal(follow.code, 0, follow.stdout + follow.stderr);
		const both = await cli([...as, "send", "--workflow", workflow, "--text", "?", "--steer", "--follow-up"]);
		assert.equal(both.code, 2, "one busy mode");
		const inbox = async () =>
			((await snapshot(host, bearer)).body.workflows as { workflow: string; messages: { inbox: unknown[] } }[]).find(
				(w) => w.workflow === workflow,
			)!.messages.inbox;
		assert.deepEqual(await inbox(), [
			{ commandId: "m-steer", whenBusy: "steer", status: "accepted" },
			{ commandId: "m-follow", whenBusy: "followUp", status: "accepted" },
		]);
		const withdrawn = await cli([...as, "withdraw", "--workflow", workflow, "--message", "m-follow"]);
		assert.equal(withdrawn.code, 0, withdrawn.stdout + withdrawn.stderr);
		assert.equal((withdrawn.json.acceptedBy as { route: string }).route, "device");
		assert.deepEqual(await inbox(), [{ commandId: "m-steer", whenBusy: "steer", status: "accepted" }]);
	});
});

/** A terminal `chat` process; its stdout is the human-readable conversation. */
function chatProcess(args: string[]) {
	const proc = track(spawn(process.execPath, [CLIENT_CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] }));
	let stdout = "";
	let stderr = "";
	proc.stdout?.on("data", (c: Buffer) => {
		stdout += c.toString();
	});
	proc.stderr?.on("data", (c: Buffer) => {
		stderr += c.toString();
	});
	const exited = new Promise<number | null>((resolve) => proc.on("exit", (code) => resolve(code)));
	return { proc, exited, out: () => stdout, err: () => stderr };
}

test("chat streams the conversation to the terminal; interrupt ends the coordinator's run as the device", async () => {
	const f = await chatFixture();
	const server: Server = deviceServer({ ledger: f.ledger, engine: f.engine }, f.principals);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const dir = await tempDir("cli-chat");
	try {
		await until(() => (f.current().status === "idle" && !f.current().executing) || undefined, "an idle coordinator");
		const laptop = await device(f);
		const token = join(dir.path, "laptop.token");
		await writeFile(token, laptop.bearer, { mode: 0o600 });
		const as = ["--url", `http://127.0.0.1:${(server.address() as AddressInfo).port}`, "--token-file", token];
		const chat = chatProcess([...as, "chat", "--workflow", WORKFLOW]);
		f.chat.reply(f.coordinator, () => fauxAssistantMessage("All done."));
		const sent = await cli([...as, "send", "--workflow", WORKFLOW, "--text", "Summarize the plan.", "--follow-up"]);
		assert.equal(sent.code, 0, sent.stdout + sent.stderr);
		await until(() => chat.out().includes("All done.") || undefined, `the reply in: ${chat.out()} ${chat.err()}`);
		assert.match(chat.out(), /you> Summarize the plan\.\n/);
		assert.match(chat.out(), /All done\.\n/);

		const running = held(() => fauxAssistantMessage("never"));
		f.chat.reply(f.coordinator, running);
		await cli([...as, "send", "--workflow", WORKFLOW, "--text", "Take a long time.", "--follow-up"]);
		await running.reached;
		const interrupted = await cli([...as, "interrupt", "--workflow", WORKFLOW]);
		assert.equal(interrupted.code, 0, interrupted.stdout + interrupted.stderr);
		assert.deepEqual(interrupted.json.acceptedBy, { principal: "human", route: "device", device: laptop.id });
		await until(() => chat.out().includes("[run interrupted]") || undefined, `the interrupted run in: ${chat.out()}`);
		chat.proc.kill("SIGTERM");
		await chat.exited;
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await dir.remove();
		await f.close();
	}
});
