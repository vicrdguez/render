import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const tau = fileURLToPath(new URL("../src/main.js", import.meta.url));
const applied = {
	status: "applied",
	extensions: [{ name: "demo", status: "added", projects: ["p"] }],
	tasks: [],
	skipped: [],
	failures: [],
};
const task = {
	project: "p",
	task: 33,
	kind: "demo.timer",
	conversation: 12,
	stored: 1,
	installed: 2,
	status: "blocked",
	reason: "migration_failed",
};

for (const [label, report, code, output] of [
	["applied", applied, 0, /added demo; projects: p/],
	[
		"kept",
		{
			...applied,
			extensions: [{ name: "gone", status: "kept", projects: [] }],
		},
		3,
		/kept gone/,
	],
	[
		"blocked",
		{ ...applied, tasks: [task] },
		3,
		/blocked p task=33 kind=demo.timer conversation=12 version=1->2 migration_failed/,
	],
	[
		"sleeping",
		{
			...applied,
			tasks: [
				{
					...task,
					status: "migration-needed-on-reservation",
					until: 1800000000000,
				},
			],
		},
		3,
		/will block when it next wakes.*no migration from 1.*wake=/,
	],
	[
		"newer stored task",
		{
			...applied,
			tasks: [
				{ ...task, stored: 3, status: "blocked", reason: "task_too_old" },
			],
		},
		3,
		/version=3->2 task_too_old/,
	],
	[
		"skipped",
		{ ...applied, skipped: [{ project: "bad", reason: "no Project" }] },
		3,
		/skipped bad: no Project/,
	],
	...[
		"scan",
		"aliases",
		"import",
		"shape",
		"options",
		"install",
		"compatibility",
	].map(
		(stage) =>
			[
				stage,
				{
					...applied,
					status: "refused",
					extensions: [],
					failures: [{ name: "demo", stage, message: "broken definition" }],
				},
				1,
				/refused.*old code still runs/,
			] as const,
	),
	[
		"restart",
		{
			...applied,
			status: "restart_required",
			failures: [
				{ name: "demo", stage: "publish", message: "Restart required" },
			],
			reached: { project: "p", extension: "demo" },
		},
		1,
		/restart required/i,
	],
] as const) {
	test(`reload command prints ${label} and exits ${code}`, async (t) => {
		const root = await mkdtemp(path.join(tmpdir(), "tau-reload-cli-"));
		const home = path.join(root, ".tau");
		await mkdir(home);
		const server = net.createServer({ allowHalfOpen: true }, (socket) => {
			let input = "";
			socket.on("data", (chunk) => {
				input += String(chunk);
			});
			socket.on("end", () => {
				assert.deepEqual(JSON.parse(input), { command: "extension_reload" });
				socket.end(JSON.stringify({ reload: report }) + "\n");
			});
		});
		await new Promise<void>((resolve) =>
			server.listen(path.join(home, "admin.sock"), resolve),
		);
		t.after(async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(root, { recursive: true, force: true });
		});
		const result = await new Promise<{
			code: number;
			stdout: string;
			stderr: string;
		}>((resolve) =>
			execFile(
				process.execPath,
				[tau, "extension", "reload"],
				{ env: { ...process.env, HOME: root } },
				(error, stdout, stderr) =>
					resolve({
						code: error === null ? 0 : Number(error.code),
						stdout,
						stderr,
					}),
			),
		);
		assert.equal(result.code, code, result.stderr);
		assert.match(result.stdout + result.stderr, output);
		if (code === 0 || code === 3)
			assert.match(result.stdout, /total.*extensions.*tasks.*skipped/i);
	});
}
