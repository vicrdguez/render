import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
	approved,
	call,
	commitStep,
	git,
	named,
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
