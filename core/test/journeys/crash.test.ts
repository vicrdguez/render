import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { decision, journey, post, until } from "./journey.js";
import { answer, build, call, git, pass, setup, stage } from "./w1-steps.js";

test("W1: SIGKILL after an HTTP answer but before its continuation effect resumes once from the second device", {
	timeout: 15_000,
}, async () => {
	const j = await journey();
	try {
		const { repo, conversation, shown } = await setup(j);
		await j.stop();
		const bin = join(j.root, "bin");
		await mkdir(bin);
		const marker = join(j.root, "git-paused");
		const realGit = (process.env.PATH ?? "")
			.split(delimiter)
			.map((dir) => join(dir, "git"))
			.find(existsSync);
		assert.ok(realGit);
		const wrapper = join(bin, "git");
		await writeFile(
			wrapper,
			`#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nimport { execFileSync } from 'node:child_process';\nconst args = process.argv.slice(2);\nif (args[0] === 'rev-parse' && args.includes('main^{commit}')) {\n  writeFileSync(${JSON.stringify(marker)}, String(process.pid));\n  process.kill(process.pid, 'SIGSTOP');\n}\nprocess.stdout.write(execFileSync(${JSON.stringify(realGit)}, args));\n`,
		);
		await chmod(wrapper, 0o755);
		const child = fork(
			new URL("./crash-server.js", import.meta.url),
			[j.home],
			{
				env: {
					...process.env,
					PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
				},
				detached: true,
				stdio: ["ignore", "ignore", "pipe", "ipc"],
			},
		);
		let stderr = "";
		child.stderr?.on("data", (chunk) => {
			stderr += String(chunk);
		});
		try {
			const [address] = await once(child, "message");
			const replied = await post(
				`http://127.0.0.1:${address.port}`,
				"answer",
				answer(shown, "approve"),
				j.phone,
			);
			assert.equal(replied.status, 200, JSON.stringify(replied.body));
			assert.equal(replied.body.result.decision.by, "phone");
			await until(
				`Git continuation is paused before its effect: ${stderr}`,
				() => existsSync(marker),
			);
			assert.equal(
				git(repo, "branch", "--list", `w1/${conversation}`),
				"",
				"the continuation has not created a branch",
			);
			const exit = once(child, "exit");
			assert.ok(child.pid);
			process.kill(-child.pid, "SIGKILL");
			await exit;
		} finally {
			if (child.exitCode === null && child.signalCode === null && child.pid)
				process.kill(-child.pid, "SIGKILL");
		}
		j.faux.setResponses([
			build,
			call("publish_build", { text: "Built after reconnect." }),
			pass,
		]);
		await j.restart();
		const stored = await decision(j, shown.decision.id);
		assert.equal(stored.decision.status, "answered");
		assert.equal(stored.decision.by, "phone");
		const final = await decision(j, `w1:${conversation}:merge#1`);
		const replay = await j.ok("answer", answer(shown, "approve"), j.phone);
		assert.equal(replay.repeated, true);
		assert.equal(replay.decision.continuation, stored.decision.continuation);
		await j.ok("answer", answer(final, "approve"), j.phone);
		const handed = await stage(j, "handed_over");
		assert.equal(git(repo, "rev-parse", `w1/${conversation}`), handed.sha);
		git(repo, "cat-file", "-e", `${handed.sha}^{commit}`);
		const timeline = await j.watch("timeline", { project: "p" }, j.phone);
		assert.equal(
			timeline.value.entries.filter((e: any) => e.data.stage === "preparing")
				.length,
			1,
		);
		const I = (await stage(j, "building")).conversation;
		const builds = await j.ok(
			"history",
			{ project: "p", conversation: I, limit: 1000 },
			j.phone,
		);
		assert.equal(
			builds.items.filter((e: any) => e.kind === "w1.build").length,
			1,
		);
		assert.equal(
			timeline.value.entries.filter((e: any) => e.data.stage === "handed_over")
				.length,
			1,
		);
		timeline.close();
	} finally {
		await j.close();
	}
});
