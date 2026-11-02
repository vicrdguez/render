// B3-05: a real paused socket must saturate before the host disconnects it, so this is a load workload, not a feedback check.
import assert from "node:assert/strict";
import { connect, type Socket } from "node:net";
import { test } from "node:test";
import { createWorkflow, enroll, envelope, http, percentile, startHost, tempDir } from "./support/host.ts";

test("B3-05 a stalled observer cannot block commits and is disconnected", async () => {
	const dir = await tempDir("stalled-observer");
	const host = await startHost(dir.path);
	let socket: Socket | undefined;
	try {
		const { bearer } = await enroll(host, "stalled");
		const w = await createWorkflow(host, bearer, "slow consumer");
		const url = new URL(host.url);
		socket = connect(Number(url.port), url.hostname);
		// The host destroying the response may surface as a reset; the close below is the observation.
		socket.on("error", () => undefined);
		const closed = new Promise<boolean>((r) => socket?.once("close", () => r(true)));
		await new Promise<void>((r) => socket?.once("connect", () => r()));
		socket.write(`GET /v1/observe?version=1 HTTP/1.1\r\nHost: ${url.host}\r\nAuthorization: Bearer ${bearer}\r\n\r\n`);
		await new Promise<void>((r) => socket?.once("data", () => r()));
		socket.pause();
		const latencies: number[] = [];
		for (let i = 0; i < 1_500; i++) {
			const t0 = performance.now();
			const r = await http(host.url, "POST", "/v1/commands", {
				bearer,
				body: envelope(
					String(host.ready.authorityEpoch),
					{ type: "postCoordinatorMessage", text: `${"backlog ".repeat(40)}${i}` },
					{ workflow: w },
				),
			});
			latencies.push(performance.now() - t0);
			assert.equal(r.status, 200, r.text);
		}
		const p95 = percentile(latencies, 95);
		console.log(JSON.stringify({ measure: "stalled_observer_ack_p95_ms", value: Number(p95.toFixed(2)) }));
		assert.ok(p95 < 250, `p95 ${p95} ms`);
		socket.resume();
		let deadline: ReturnType<typeof setTimeout> | undefined;
		const disconnected = await Promise.race([
			closed,
			new Promise<boolean>((r) => {
				deadline = setTimeout(() => r(false), 5_000);
			}),
		]);
		clearTimeout(deadline);
		assert.ok(disconnected, "the stalled stream must have been disconnected by the host");
	} finally {
		socket?.destroy();
		await host.stop();
		await dir.remove();
	}
});
