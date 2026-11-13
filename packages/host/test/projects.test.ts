import assert from "node:assert/strict";
import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { access, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { requestAdmin, startServer } from "../src/index.js";
import { modules, Notes } from "./extensions.js";
import { faux, newHome, send, start } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const exists = (file: string) =>
	access(file).then(
		() => true,
		() => false,
	);

function child(script: string, args: string[]) {
	const process = fork(path.join(here, script), args, { stdio: "ignore" });
	const first = once(process, "message").then(([message]) => message);
	return { process, first };
}
async function kill(process: ChildProcess) {
	if (process.exitCode !== null || process.signalCode !== null) return;
	const exit = once(process, "exit");
	process.kill("SIGKILL");
	await exit;
}

test("bind checks the name and the working directory before it creates anything", async () => {
	const s = await start({ modules });
	try {
		for (const body of [
			{ project: "Bad", workdir: "/srv/p", extensions: [] },
			{ project: "-p", workdir: "/srv/p", extensions: [] },
			{ project: "a".repeat(64), workdir: "/srv/p", extensions: [] },
			{ project: "p", workdir: "srv/p", extensions: [] },
			{ project: "p", workdir: "/srv/p", extensions: [1] },
		]) {
			const reply = await s.call("bind", body);
			assert.equal(reply.status, 400, JSON.stringify(body));
			assert.equal(reply.body.refused?.code, "bad_request");
		}
		assert.ok(!(await exists(path.join(s.home, "projects", "Bad"))));
		assert.ok(!(await exists(path.join(s.home, "projects", "p"))));
	} finally {
		await s.close();
	}
});

test("bind stores the project, repeats on equal fields, and refuses others with conflict", async () => {
	const s = await start({ modules });
	try {
		const body = {
			project: "p",
			workdir: "/home/owner/src/export",
			extensions: ["search", "flow", "gone"],
		};
		const first = await s.call("bind", body);
		assert.equal(first.status, 200);
		assert.deepEqual(first.body, {
			result: {
				project: { ...body, missing: ["gone"] },
				repeated: false,
			},
		});
		assert.ok(await exists(path.join(s.home, "projects", "p", "store.sqlite")));
		assert.deepEqual((await s.call("bind", body)).body.result, {
			project: { ...body, missing: ["gone"] },
			repeated: true,
		});
		for (const changed of [
			{ ...body, workdir: "/elsewhere" },
			{ ...body, extensions: ["search"] },
		]) {
			const reply = await s.call("bind", changed);
			assert.equal(reply.status, 409);
			assert.equal(reply.body.refused?.code, "conflict");
			assert.deepEqual(reply.body.refused?.project, {
				...body,
				missing: ["gone"],
			});
		}
		const both = await Promise.all([
			s.call("bind", { project: "q", workdir: "/q", extensions: [] }),
			s.call("bind", { project: "q", workdir: "/q", extensions: [] }),
		]);
		assert.deepEqual(
			both.map((r) => r.body.result?.repeated).sort(),
			[false, true],
		);
		const listed = await s.call("projects", {});
		assert.deepEqual(listed.body.result.items, [
			{ ...body, missing: ["gone"] },
			{ project: "q", workdir: "/q", extensions: [], missing: [] },
		]);
		const again = await s.restart();
		try {
			assert.deepEqual(
				(await again.call("projects", {})).body.result,
				listed.body.result,
			);
			assert.deepEqual(again.server.skipped, []);
		} finally {
			await again.close();
		}
	} finally {
		await s.close();
	}
});

test("start skips a store that a killed bind left without Project, and a resent bind finishes it", async () => {
	const home = await newHome();
	const half = child("half-bind.js", [home, "p"]);
	try {
		assert.equal(await half.first, "open");
	} finally {
		await kill(half.process);
	}
	const s = await start({ home, modules });
	try {
		assert.deepEqual(
			s.server.skipped.map((x) => x.project),
			["p"],
		);
		assert.deepEqual((await s.call("projects", {})).body.result.items, []);
		const body = { project: "p", workdir: "/p", extensions: ["notes"] };
		const bound = await s.call("bind", body);
		assert.deepEqual(bound.body.result, {
			project: { ...body, missing: [] },
			repeated: false,
		});
		await s.call("bind", { project: "q", workdir: "/q", extensions: [] });
		await s.close();
		await rename(
			path.join(home, "projects", "q"),
			path.join(home, "projects", "r"),
		);
		const again = await s.restart();
		try {
			assert.deepEqual(
				again.server.skipped.map((x) => x.project),
				["r"],
			);
			assert.deepEqual(
				(await again.call("projects", {})).body.result.items.map(
					(p: { project: string }) => p.project,
				),
				["p"],
			);
		} finally {
			await again.close();
		}
	} finally {
		await s.close().catch(() => {});
	}
});

test("addExtensions appends new names once and survives a restart", async () => {
	const s = await start({ modules });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: ["flow"] });
		const added = await s.call("addExtensions", {
			project: "p",
			extensions: ["notes", "flow", "gone"],
		});
		const project = {
			project: "p",
			workdir: "/p",
			extensions: ["flow", "notes", "gone"],
			missing: ["gone"],
		};
		assert.deepEqual(added.body, { result: { project } });
		const same = await s.call("addExtensions", {
			project: "p",
			extensions: ["notes"],
		});
		assert.deepEqual(same.body, { result: { project } });
		const unknown = await s.call("addExtensions", {
			project: "nope",
			extensions: [],
		});
		assert.equal(unknown.status, 404);
		assert.equal(unknown.body.refused?.code, "unknown_project");
		await s.close();
		const again = await s.restart({ modules: { ...modules, gone: { extension: { ...Notes, name: "gone" } } } });
		try {
			assert.deepEqual((await again.call("projects", {})).body.result.items, [
				{ ...project, missing: [] },
			]);
		} finally {
			await again.close();
		}
	} finally {
		await s.close().catch(() => {});
	}
});

test("a module map key that differs from its extension name stops the start", async () => {
	await assert.rejects(
		startServer({
			home: await newHome(),
			modules: { search: modules.notes },
			models: faux().models,
			port: 0,
		}),
		/notes/,
	);
});

test("a second server process is refused while the first holds the lock, and SIGKILL frees it", async () => {
	const home = await newHome();
	const first = child("serve.js", [home]);
	try {
		const ready = (await first.first) as { port: number };
		assert.equal(typeof ready.port, "number");
		const issued = await requestAdmin(home, { command: "pair", device: "cli" });
		assert.ok("code" in issued);
		const url = `http://127.0.0.1:${ready.port}`;
		const paired = await send(url, "/v1/pair", JSON.stringify({ code: issued.code }));
		const auth = { Authorization: `Bearer ${paired.body.result.token}` };
		const bound = await send(
			url,
			"/v1/bind",
			JSON.stringify({ project: "p", workdir: "/p", extensions: [] }),
			auth,
		);
		assert.equal(bound.status, 200);

		const second = child("serve.js", [home]);
		const refused = (await second.first) as { error?: string };
		assert.match(refused.error ?? "", /locked/);
		await kill(second.process);
		await kill(first.process);

		const third = child("serve.js", [home]);
		try {
			const after = (await third.first) as { port: number };
			const listed = await send(
				`http://127.0.0.1:${after.port}`,
				"/v1/projects",
				"{}",
				auth,
			);
			assert.equal(listed.body.result.items[0].project, "p");
		} finally {
			await kill(third.process);
		}
		assert.deepEqual(await readdir(path.join(home, "projects")), ["p"]);
	} finally {
		await kill(first.process);
	}
});
