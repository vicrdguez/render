import assert from "node:assert/strict";
import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AssistantMessage,
	fauxAssistantMessage,
} from "@earendil-works/pi-ai";
import { requestAdmin } from "tau-host";
import { post, watch } from "./journey.js";

export async function processJourney(
	config: { now?: () => number; searchUrl?: string } = {},
) {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "tau-process-journey-")),
	);
	const home = join(root, "home");
	let child: ChildProcess;
	let url = "";
	const wire: string[] = [];
	const stdout: string[] = [];
	const stderr: string[] = [];
	const requests: unknown[] = [];
	const exits: unknown[][] = [];
	let responses: AssistantMessage[] = [];
	const faux = {
		state: { callCount: 0 },
		setResponses(next: AssistantMessage[]) {
			responses = [...next];
		},
	};
	async function start() {
		child = fork(
			new URL("./journey-server.js", import.meta.url),
			[
				home,
				JSON.stringify({ now: config.now?.(), searchUrl: config.searchUrl }),
			],
			{
				stdio: ["ignore", "pipe", "pipe", "ipc"],
			},
		);
		assert.ok(child.stdout && child.stderr);
		child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
		child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
		child.on(
			"message",
			(message: { id: number; request: unknown } | { port: number }) => {
				if (!("request" in message)) return;
				requests.push(message.request);
				faux.state.callCount++;
				child.send({
					id: message.id,
					response: responses.shift() ?? fauxAssistantMessage(""),
				});
			},
		);
		const address = await Promise.race([
			once(child, "message").then(([message]) => message),
			once(child, "exit").then(() => {
				throw new Error(`Journey server exited: ${stderr.join("")}`);
			}),
		]);
		url = `http://127.0.0.1:${address.port}`;
	}
	async function stop() {
		if (child.exitCode !== null || child.signalCode !== null) return;
		const exited = once(child, "close");
		child.kill("SIGKILL");
		const result = await exited;
		exits.push(result);
		assert.deepEqual(result, [null, "SIGKILL"]);
	}
	await start();
	const pair = async (device: string) => {
		const issued = await requestAdmin(home, { command: "pair", device });
		assert.ok("code" in issued);
		const reply = await post(url, "pair", { code: issued.code });
		assert.equal(reply.status, 200);
		return reply.body.result.token as string;
	};
	const laptop = await pair("laptop");
	const phone = await pair("phone");
	const call = async (name: string, body: object, token = laptop) => {
		const reply = await post(url, name, body, token);
		wire.push(JSON.stringify(reply));
		return reply;
	};
	return {
		root,
		home,
		laptop,
		phone,
		faux,
		wire,
		stdout,
		stderr,
		requests,
		exits,
		call,
		async ok(name: string, body: object, token = laptop) {
			const reply = await call(name, body, token);
			assert.equal(reply.status, 200, JSON.stringify(reply.body));
			return reply.body.result;
		},
		watch: (name: string, body: object, token = laptop) =>
			watch(url, name, body, token),
		stop,
		async restart() {
			await stop();
			await start();
		},
		async close() {
			await stop();
			await rm(root, { recursive: true, force: true });
		},
	};
}
