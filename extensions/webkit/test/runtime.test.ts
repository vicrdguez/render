import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { WebkitError } from "../src/domain.ts";
import { nativeTool, runNative } from "../src/runtime.ts";

const node = process.execPath;
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const isFailure = (kind: string) => (error: unknown) =>
	error instanceof WebkitError && error.failure.kind === kind;
const scratch = await mkdtemp(join(tmpdir(), "webkit-runtime-test-"));
after(() => rm(scratch, { recursive: true, force: true }));

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

async function eventually(
	check: () => boolean | Promise<boolean>,
	label: string,
	ms = 3000,
): Promise<void> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await check()) return;
		await sleep(20);
	}
	assert.fail(label);
}

function within<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined;
	const late = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(label)), ms);
	});
	return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function pidsFrom(file: string): Promise<number[]> {
	let pids: number[] = [];
	await eventually(async () => {
		pids = (await readFile(file, "utf8").catch(() => ""))
			.split(/\s+/)
			.filter(Boolean)
			.map(Number);
		return pids.length >= 2;
	}, "the command reported its process ids");
	return pids;
}

test("returns stdout bytes, stderr text and a failing exit status without rejecting", async () => {
	const result = await runNative(
		node,
		[
			"-e",
			"process.stdout.write('out\\u00e9'); process.stderr.write('err'); process.exitCode = 3",
		],
		{
			signal: new AbortController().signal,
			maxBytes: 100,
		},
	);
	assert.ok(result.stdout instanceof Uint8Array);
	assert.equal(text(result.stdout), "outé");
	assert.equal(result.stderr, "err");
	assert.equal(result.status, 3);
});

test("passes arguments literally without a shell", async () => {
	const args = [
		"$(touch injected)",
		"a b; touch injected2",
		"*",
		"`touch injected3`",
	];
	const result = await runNative(
		node,
		[
			"-e",
			"process.stdout.write(JSON.stringify(process.argv.slice(1)))",
			...args,
		],
		{
			signal: new AbortController().signal,
			maxBytes: 10_000,
			cwd: scratch,
		},
	);
	assert.deepEqual(JSON.parse(text(result.stdout)), args);
	for (const name of ["injected", "injected2", "injected3"])
		await assert.rejects(
			readFile(join(scratch, name)),
			`no shell created ${name}`,
		);
});

test("runs in cwd with inherited environment, overrides and unset variables", async () => {
	const result = await runNative(
		node,
		[
			"-e",
			"process.stdout.write(JSON.stringify({ cwd: process.cwd(), extra: process.env.WEBKIT_EXTRA, home: process.env.HOME ?? null, path: Boolean(process.env.PATH) }))",
		],
		{
			signal: new AbortController().signal,
			maxBytes: 10_000,
			cwd: scratch,
			env: { WEBKIT_EXTRA: "set", HOME: undefined },
		},
	);
	assert.deepEqual(JSON.parse(text(result.stdout)), {
		cwd: await realpath(scratch),
		extra: "set",
		home: null,
		path: true,
	});
});

test("output over maxBytes rejects and kills the command", async () => {
	const pidFile = join(scratch, "oversize.pid");
	const script = `require("fs").writeFileSync(${JSON.stringify(pidFile)}, process.pid + " " + process.pid); const chunk = Buffer.alloc(4096, 120); for (;;) require("fs").writeSync(1, chunk);`;
	const started = Date.now();
	await assert.rejects(
		runNative(node, ["-e", script], {
			signal: new AbortController().signal,
			maxBytes: 10_000,
		}),
		isFailure("invalid-response"),
	);
	assert.ok(
		Date.now() - started < 3000,
		"the limit stops the command promptly",
	);
	const [pid] = await pidsFrom(pidFile);
	await eventually(() => !alive(pid!), "the oversized command was killed");
});

test("output exactly at maxBytes is returned", async () => {
	const result = await runNative(
		node,
		["-e", "process.stdout.write('x'.repeat(64))"],
		{ signal: new AbortController().signal, maxBytes: 64 },
	);
	assert.equal(result.stdout.byteLength, 64);
});

test("stderr is bounded while the command still completes", async () => {
	const result = await runNative(
		node,
		[
			"-e",
			"const fs = require('fs'); for (let i = 0; i < 256; i++) fs.writeSync(2, Buffer.alloc(4096, 101)); process.stdout.write('done')",
		],
		{
			signal: new AbortController().signal,
			maxBytes: 100,
		},
	);
	assert.equal(text(result.stdout), "done");
	assert.equal(result.status, 0);
	assert.ok(
		result.stderr.length > 0 && result.stderr.length <= 16_384,
		`stderr kept ${result.stderr.length} characters`,
	);
});

test("cancellation kills the command and its child processes, then rejects as cancelled", async () => {
	const pidFile = join(scratch, "tree.pid");
	const script = `
		const { spawn } = require("child_process");
		const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "inherit" });
		require("fs").writeFileSync(${JSON.stringify(pidFile)}, process.pid + " " + child.pid);
		setTimeout(() => {}, 60000);
	`;
	const controller = new AbortController();
	const running = runNative(node, ["-e", script], {
		signal: controller.signal,
		maxBytes: 1000,
	});
	const [parent, child] = await pidsFrom(pidFile);
	const started = Date.now();
	controller.abort();
	await assert.rejects(running, isFailure("cancelled"));
	assert.ok(
		Date.now() - started < 3000,
		"cancellation does not wait for the child to finish",
	);
	await eventually(
		() => !alive(parent!) && !alive(child!),
		"the command and its child were killed",
	);
	assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("cancelling a real git clone ends its HTTP helper, releases its pipes and closes the connection", async () => {
	let arrived!: () => void;
	const reached = new Promise<void>((resolve) => {
		arrived = resolve;
	});
	let closed!: Promise<void>;
	const server = http.createServer((_request, response) => {
		closed = new Promise((resolve) => response.once("close", () => resolve()));
		response.writeHead(200, {
			"content-type": "application/x-git-upload-pack-advertisement",
		});
		response.write("001e# service=git-upload-pack\n");
		arrived();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/stalled.git`;
		const controller = new AbortController();
		const cloning = runNative(
			nativeTool("git"),
			["clone", "--quiet", url, join(scratch, "stalled")],
			{
				signal: controller.signal,
				maxBytes: 100_000,
				env: {
					HOME: scratch,
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_CONFIG_GLOBAL: "/dev/null",
					GIT_TERMINAL_PROMPT: "0",
					no_proxy: "*",
					NO_PROXY: "*",
				},
			},
		);
		await Promise.race([
			reached,
			cloning.then(() =>
				assert.fail("git finished before the stalled transfer"),
			),
		]);
		controller.abort();
		await within(
			assert.rejects(cloning, isFailure("cancelled")),
			3000,
			"cancellation waited for git's helpers to release the pipes",
		);
		await within(closed, 2000, "git's HTTP helper kept the connection open");
	} finally {
		server.closeAllConnections();
		server.close();
	}
});

test("an aborted signal's timeout reason passes through cancellation", async () => {
	const controller = new AbortController();
	const running = runNative(node, ["-e", "setTimeout(() => {}, 60000)"], {
		signal: controller.signal,
		maxBytes: 1000,
	});
	await sleep(50);
	controller.abort(new WebkitError("timeout", "The web request timed out."));
	await assert.rejects(running, isFailure("timeout"));
});

test("an already-aborted signal rejects without starting the command", async () => {
	const marker = join(scratch, "started");
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		runNative(
			node,
			["-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "x")`],
			{ signal: controller.signal, maxBytes: 100 },
		),
		isFailure("cancelled"),
	);
	await sleep(200);
	await assert.rejects(readFile(marker), "the command never started");
});

test("a missing executable is a configuration failure", async () => {
	await assert.rejects(
		runNative(join(scratch, "missing-tool"), ["--version"], {
			signal: new AbortController().signal,
			maxBytes: 100,
		}),
		isFailure("config"),
	);
});

test("finished commands leave no abort listener on the caller's signal", async () => {
	const signal = new AbortController().signal;
	await runNative(node, ["-e", "process.exitCode = 1"], {
		signal,
		maxBytes: 100,
	});
	await assert.rejects(
		runNative(node, ["-e", "process.stdout.write('x'.repeat(500))"], {
			signal,
			maxBytes: 10,
		}),
	);
	await assert.rejects(
		runNative(join(scratch, "missing-tool"), [], { signal, maxBytes: 10 }),
	);
	assert.equal(getEventListeners(signal, "abort").length, 0);
});

test("declared native tools resolve to runnable git and curl", async () => {
	for (const name of ["git", "curl"] as const) {
		const result = await runNative(nativeTool(name), ["--version"], {
			signal: new AbortController().signal,
			maxBytes: 100_000,
		});
		assert.equal(result.status, 0, `${name} --version exits cleanly`);
		assert.match(text(result.stdout), new RegExp(`^${name} `));
	}
});
