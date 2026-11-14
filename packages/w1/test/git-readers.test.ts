import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { diffAt, ensureWorktree, fileAt, publishedHead } from "../src/git.js";
import type { Plan } from "../src/work.js";
import {
	answered,
	approved,
	call,
	commitStep,
	data,
	git,
	named,
	plannedPath,
	repository,
	toolResults,
	world,
} from "./setup.js";

for (const driver of ["external", "textconv", "environment"] as const) {
	test(`row 13: Git ${driver} cannot expose unpublished files through the reviewer`, async () => {
		const w = await world();
		const previous = process.env.GIT_EXTERNAL_DIFF;
		try {
			w.script(
				"implementer",
				commitStep("export.js", "published", "Build"),
				call("publish_build", { text: "Built." }),
			);
			const secret = join(w.repo, "unpublished-secret.txt");
			const program = join(w.repo, "driver.sh");
			const ran = join(w.repo, "driver-ran");
			w.script(
				"reviewer",
				() => {
					writeFileSync(secret, "UNPUBLISHED_WORKING_FILE_SECRET");
					writeFileSync(
						program,
						`#!/bin/sh\nprintf ran > '${ran}'\ncat '${secret}'\n${driver === "textconv" ? 'cat "$1"\n' : ""}`,
					);
					const command = `/bin/sh '${program}'`;
					if (driver === "textconv") {
						writeFileSync(
							join(w.repo, ".gitattributes"),
							"export.js diff=secret\n",
						);
						git(w.repo, "config", "diff.secret.textconv", command);
					} else if (driver === "environment") {
						process.env.GIT_EXTERNAL_DIFF = command;
					} else {
						git(w.repo, "config", "diff.external", command);
					}
					git(w.repo, "config", "core.fsmonitor", command);
					git(w.repo, "config", "core.pager", command);
					git(w.repo, "config", "pager.diff", "true");
					git(w.repo, "config", "pager.cat-file", "true");
					return call("show_diff");
				},
				call("show_file", { path: "export.js" }),
			);
			await approved(w);
			const R = await named(w, "reviewing");
			const results = await toolResults(w, R);
			assert.equal(results.length, 2);
			assert.ok(results.every((result) => !result.isError));
			assert.ok(
				!results.some((result) =>
					result.text.includes("UNPUBLISHED_WORKING_FILE_SECRET"),
				),
				"a Git driver read an unpublished file",
			);
			assert.match(results[0]?.text ?? "", /\+published/);
			assert.equal(results[1]?.text, "published");
			assert.equal(existsSync(ran), false, "neither reader runs a Git helper");
		} finally {
			if (previous === undefined) delete process.env.GIT_EXTERNAL_DIFF;
			else process.env.GIT_EXTERNAL_DIFF = previous;
			await w.close();
		}
	});
}

function environment(t: import("node:test").TestContext, key: string, value: string) {
	const previous = process.env[key];
	process.env[key] = value;
	t.after(() => {
		if (previous === undefined) delete process.env[key];
		else process.env[key] = previous;
	});
}

function built(t: import("node:test").TestContext) {
	const repo = repository();
	t.after(() => rmSync(join(repo, ".."), { recursive: true, force: true }));
	const baseSha = git(repo, "rev-parse", "HEAD");
	writeFileSync(join(repo, "export.js"), "MALICIOUS_PUBLISHED\n");
	git(repo, "add", ".");
	git(repo, "commit", "-qm", "Build");
	const sha = git(repo, "rev-parse", "HEAD");
	const plan: Plan = { repo, path: repo, branch: "main", base: "main", baseSha };
	return { repo, plan, sha };
}

test("row 13: both readers ignore blob replacements shared from the implementer worktree", async () => {
	const w = await world();
	try {
		w.script("implementer",
			commitStep("export.js", "MALICIOUS_PUBLISHED", "Build"),
			call("bash", { command: "printf '%s' 'BENIGN_REPLACED' > /tmp/tau-benign-blob-$$ && benign=$(git hash-object -w /tmp/tau-benign-blob-$$) && rm /tmp/tau-benign-blob-$$ && git replace $(git rev-parse HEAD:export.js) $benign" }),
			call("publish_build", { text: "Built." }));
		w.script("reviewer", call("show_diff"), call("show_file", { path: "export.js" }));
		await approved(w);
		const results = await toolResults(w, await named(w, "reviewing"));
		assert.equal(results.length, 2);
		for (const result of results) {
			assert.equal(result.isError, false);
			assert.match(result.text, /MALICIOUS_PUBLISHED/);
			assert.doesNotMatch(result.text, /BENIGN_REPLACED/);
		}
	} finally { await w.close(); }
});

test("row 11: publish_build reads the real commit even when its type is replaced", async () => {
	const w = await world();
	try {
		w.script("implementer", commitStep("export.js", "published", "Build"),
			call("bash", { command: "git replace -f HEAD $(git rev-parse HEAD:export.js)" }),
			call("publish_build", { text: "Built." }));
		const { k } = await approved(w);
		const I = await named(w, "building");
		const builds = await w.entries(I, "w1.build");
		assert.equal(builds.length, 1);
		assert.equal(data(builds[0]).sha, git(plannedPath(w.repo, k), "--no-replace-objects", "rev-parse", "HEAD"));
	} finally { await w.close(); }
});

for (const source of ["info", "file", "environment"] as const) {
	test(`row 13: ${source} attributes cannot hide a text change`, async (t) => {
		const { repo, plan, sha } = built(t);
		const attributes = join(repo, source === "info" ? ".git/info/attributes" : "attributes");
		writeFileSync(attributes, "* -diff\n");
		if (source === "file") git(repo, "config", "core.attributesFile", attributes);
		if (source === "environment") {
			environment(t, "GIT_CONFIG_COUNT", "1");
			environment(t, "GIT_CONFIG_KEY_0", "core.attributesFile");
			environment(t, "GIT_CONFIG_VALUE_0", attributes);
		}
		assert.match(await diffAt(plan, sha), /\+MALICIOUS_PUBLISHED/);
	});
}

test("row 13: diff output pins color prefixes renames algorithm quoting and context", async (t) => {
	const { repo, plan, sha } = built(t);
	const expected = await diffAt(plan, sha);
	for (const [key, value] of [
		["color.diff", "always"], ["diff.noprefix", "true"],
		["diff.mnemonicPrefix", "true"], ["diff.renames", "copies"],
		["diff.algorithm", "histogram"], ["core.quotePath", "false"],
		["diff.context", "0"], ["diff.relative", "true"],
		["diff.suppressBlankEmpty", "true"],
	] as const) git(repo, "config", key, value);
	assert.equal(await diffAt(plan, sha), expected);
});

test("row 13: submodule diffs show only the gitlink, not nested repository content", async (t) => {
	const { repo, plan } = built(t);
	const sub = repository();
	t.after(() => rmSync(join(sub, ".."), { recursive: true, force: true }));
	git(repo, "-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "sm");
	git(repo, "commit", "-qam", "Submodule");
	const baseSha = git(repo, "rev-parse", "HEAD");
	writeFileSync(join(repo, "sm/export.js"), "UNPUBLISHED_SUBMODULE_CONTENT\n");
	git(join(repo, "sm"), "commit", "-qam", "Nested change");
	git(repo, "add", "sm");
	git(repo, "commit", "-qm", "Move submodule");
	const sha = git(repo, "rev-parse", "HEAD");
	git(repo, "config", "diff.submodule", "diff");
	const diff = await diffAt({ ...plan, baseSha }, sha);
	assert.match(diff, /Subproject commit/);
	assert.doesNotMatch(diff, /UNPUBLISHED_SUBMODULE_CONTENT/);
});

test("row 13: every missing file has the same refusal without disk details", async (t) => {
	const { repo, plan, sha } = built(t);
	writeFileSync(join(repo, "disk-only"), "PRIVATE");
	for (const path of ["disk-only", "/etc/hosts", "/tau-missing-file", "missing", "../missing"]) {
		await assert.rejects(fileAt(plan, sha, path), {
			message: "The path is not a file in the published commit.",
		});
	}
});

for (const variable of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG_PARAMETERS"]) {
	test(`W1 Git ignores inherited ${variable}`, async (t) => {
		const { repo, plan, sha } = built(t);
		const expected = await diffAt(plan, sha);
		const value = variable === "GIT_DIR" ? join(repo, "missing") :
			variable === "GIT_CONFIG_PARAMETERS" ? "'color.diff=always'" : join(repo, "missing");
		environment(t, variable, value);
		assert.equal(await diffAt(plan, sha), expected);
		assert.equal(await fileAt(plan, sha, "export.js"), "MALICIOUS_PUBLISHED\n");
		assert.deepEqual(await publishedHead(plan), { sha });
	});
}

test("row 9: a legacy graft cannot hide the planned base ancestry", async (t) => {
	const { repo, plan, sha } = built(t);
	writeFileSync(join(repo, ".git/info/grafts"), `${sha}\n`);
	assert.equal(await ensureWorktree(plan), undefined);
});

for (const change of ["replace", "graft"] as const) {
	test(`row 19: the hand-over head check ignores a ${change}`, async () => {
		const w = await world();
		try {
			w.script("implementer", commitStep("export.js", "published", "Build"), call("publish_build", { text: "Built." }));
			w.script("reviewer", call("publish_review", { text: "Good.", verdict: "pass", findings: [] }));
			const { k, s } = await approved(w);
			await w.open(s.merge(1));
			const path = plannedPath(w.repo, k);
			const sha = git(path, "rev-parse", "HEAD");
			if (change === "replace") {
				const blob = git(path, "rev-parse", "HEAD:export.js");
				git(path, "replace", "-f", sha, blob);
			} else {
				writeFileSync(join(w.repo, ".git/info/grafts"), `${sha}\n`);
			}
			answered(await w.reply(s.merge(1), "approve"));
			await w.settle();
			assert.equal((await w.events()).at(-1)?.stage, "handed_over");
			assert.equal(data((await w.entries(k, "w1.merge"))[0]).sha, sha);
		} finally { await w.close(); }
	});
}
