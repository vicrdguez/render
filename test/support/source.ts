import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effects } from "../../src/effects/source.ts";
import { Sandboxes } from "../../src/sandboxes/sandboxes.ts";

async function cleanup(path: string): Promise<void> {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		const child = join(path, entry.name);
		if (entry.isDirectory()) await cleanup(child);
		else if (entry.name === "state.json") {
			const state = JSON.parse(await readFile(child, "utf8"));
			if (state.handle?.runtime) {
				try {
					execFileSync("docker", ["rm", "-f", state.handle.runtime], { stdio: "ignore" });
				} catch {
					/* already removed by an uncertainty fixture */
				}
			}
		}
	}
}
export function git(repo: string, args: string[], input?: string | Buffer): Buffer {
	return execFileSync("git", ["--git-dir", repo, ...args], {
		input,
		env: {
			PATH: process.env.PATH,
			HOME: repo,
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_AUTHOR_NAME: "Fixture",
			GIT_AUTHOR_EMAIL: "fixture@example.invalid",
			GIT_COMMITTER_NAME: "Fixture",
			GIT_COMMITTER_EMAIL: "fixture@example.invalid",
		},
	});
}
/** Real Git and Effects only: for refusals that happen before any sandbox preparation. */
export async function gitSourceFixture(
	files: Record<string, { mode?: string; text: string }> = {
		".gitattributes": { text: "crlf text eol=lf\nignored export-ignore\nsubst export-subst\n*.txt filter=hostile\n" },
		crlf: { text: "literal\r\nbytes\r\n" },
		ignored: { text: "must not disappear\n" },
		subst: { text: "$Format:%H$\n" },
		link: { mode: "120000", text: "/outside/never-follow" },
		run: { mode: "100755", text: "#!/bin/sh\nexit 0\n" },
	},
) {
	const root = await mkdtemp(join(tmpdir(), "render-source-"));
	const repo = join(root, "upstream.git");
	execFileSync("git", ["init", "--bare", repo], { stdio: "ignore" });
	const tree = git(
		repo,
		["mktree", "-z"],
		Buffer.concat(
			Object.entries(files).map(([name, file]) => {
				const oid = git(repo, ["hash-object", "-w", "--stdin"], file.text).toString().trim();
				return Buffer.from(`${file.mode ?? "100644"} blob ${oid}\t${name}\0`);
			}),
		),
	)
		.toString()
		.trim();
	const commit = git(repo, ["commit-tree", tree], "Owned literal fixture\n").toString().trim();
	git(repo, ["update-ref", "refs/heads/fixture", commit]);
	const effects = new Effects({ root: join(root, "effects"), repositories: { owned: repo } });
	return { root, repo, commit, effects, close: () => rm(root, { recursive: true, force: true }) };
}

export async function sourceFixture(files?: Record<string, { mode?: string; text: string }>) {
	// Before any fixture directory exists: a missing runtime or image fails here and leaves nothing behind.
	const image = execFileSync("docker", ["image", "inspect", "node:24-alpine", "--format", "{{.Id}}"], { encoding: "utf8" }).trim();
	const source = await gitSourceFixture(files);
	const { root } = source;
	let current = true;
	const scope = { assignment: "assignment:owned", generation: 1, attempt: "attempt:owned", executorEpoch: "executor:owned" };
	const sandboxes = new Sandboxes({
		root: join(root, "sandboxes"),
		authorize: (s) => current && JSON.stringify(s) === JSON.stringify(scope),
	});
	const profile = { image, exclusions: [".git"], maxBytes: 64 * 1024 * 1024, maxEntries: 10000 };
	return {
		...source,
		sandboxes,
		profile,
		scope,
		fence: () => {
			current = false;
		},
		close: async () => {
			await cleanup(root);
			await source.close();
		},
	};
}
