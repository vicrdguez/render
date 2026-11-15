import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { JsonObject } from "@earendil-works/pi-durable";
import { decision, type Journey, until } from "./journey.js";

export const identity = {
	GIT_AUTHOR_NAME: "Tau Journey",
	GIT_AUTHOR_EMAIL: "tau@example.invalid",
	GIT_COMMITTER_NAME: "Tau Journey",
	GIT_COMMITTER_EMAIL: "tau@example.invalid",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};
Object.assign(process.env, identity);
export const git = (cwd: string, ...args: string[]) =>
	execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
export const call = (name: string, args: JsonObject = {}) =>
	fauxAssistantMessage([fauxToolCall(name, args)], { stopReason: "toolUse" });
export const build = call("bash", {
	command:
		"printf 'export const format = 42;\n' > export.js && git add export.js && git commit -qm Build",
});
export const pass = call("publish_review", {
	text: "The published commit is correct.",
	verdict: "pass",
	findings: [],
});

export async function setup(j: Journey, base = "main") {
	const repo = join(j.root, "repo");
	await mkdir(repo);
	git(repo, "init", "-q", "-b", "main");
	await writeFile(join(repo, "export.js"), "export const format = 1;\n");
	git(repo, "add", "-A");
	git(repo, "commit", "-qm", "Initial");
	await j.ok("bind", { project: "p", workdir: repo, extensions: ["w1"] });
	await j.ok("setOptions", {
		project: "p",
		extension: "w1",
		patch: {
			designer: "faux/a",
			implementer: "faux/a",
			reviewer: "faux/b",
			base,
		},
	});
	const { conversation } = await j.ok("create", {
		project: "p",
		workflow: "w1",
	});
	j.faux.setResponses([
		call("publish_design", { text: "Change the format to 42." }),
	]);
	await j.ok("input", {
		project: "p",
		conversation,
		text: "Change the format",
		requestId: "design",
	});
	const shown = await decision(j, `w1:${conversation}:design#1`);
	return { repo, conversation: conversation as number, shown };
}

export function answer(shown: any, choice: string, annotations: object[] = []) {
	return {
		project: "p",
		decision: shown.decision.id,
		basis: shown.decision.basis,
		choice,
		annotations,
	};
}

export async function stage(j: Journey, stage: string) {
	const timeline = await j.watch("timeline", { project: "p" }, j.phone);
	try {
		await until(`timeline ${stage}`, () =>
			timeline.value.entries.some((e: any) => e.data.stage === stage),
		);
		const entry = timeline.value.entries.find(
			(e: any) => e.data.stage === stage,
		);
		assert.ok(entry.data.conversation);
		return entry.data;
	} finally {
		timeline.close();
	}
}
