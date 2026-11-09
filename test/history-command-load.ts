// Extended real-store regression: separate from the cheap suite, not the full V9 workload.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import { createWorkflow, enroll, envelope, http, percentile, startHost, tempDir } from "./support/host.ts";

test("history-command-load: retained messages scale without quadratic rescans or multi-second acknowledgement stalls", async () => {
	const dir = await tempDir("history-load");
	const host = await startHost(dir.path);
	try {
		const device = await enroll(host, "Writer and reader");
		const workflows: string[] = [];
		for (let i = 0; i < 10; i++) workflows.push(await createWorkflow(host, device.bearer, `Messages ${i}`));
		const refs: string[] = [];
		const post = (i: number) =>
			http(host.url, "POST", "/v1/commands", {
				bearer: device.bearer,
				body: envelope(
					String(host.ready.authorityEpoch),
					{ type: "postCoordinatorMessage", whenBusy: "followUp", text: `message ${i}\r\n☃` },
					{ workflow: workflows[i % 10], commandId: `load-${i}` },
				),
			});
		const durations: number[] = [];
		for (const count of [300, 1200]) {
			while (refs.length < count) {
				const reply = await post(refs.length);
				assert.equal(reply.status, 200, reply.text);
				refs.push(String((reply.body.result as Record<string, unknown>).message));
			}
			const samples: number[] = [];
			for (let run = 0; run < 3; run++) {
				const started = performance.now();
				const bundle = await http(host.url, "GET", "/v1/export?kind=message", { bearer: device.bearer });
				samples.push(performance.now() - started);
				assert.equal(bundle.status, 200, bundle.text);
				assert.equal((bundle.body.manifest as { complete: boolean }).complete, true);
				const content = bundle.body.content as Record<string, string>;
				assert.deepEqual(new Set(Object.keys(content)), new Set(refs));
				for (const i of [0, count - 1])
					assert.equal(Buffer.from(content[refs[i] as string] as string, "base64").toString(), `message ${i}\r\n☃`);
			}
			durations.push(Math.min(...samples));
		}
		console.log(JSON.stringify({ messages: [300, 1200], exportMs: durations }));
		const acknowledgements: number[] = [];
		for (let run = 0; run < 12; run++) {
			const reading = http(host.url, "GET", run % 2 ? "/v1/history?limit=3" : "/v1/export", { bearer: device.bearer });
			const started = performance.now();
			const written = await post(1200 + run);
			acknowledgements.push(performance.now() - started);
			assert.equal(written.status, 200, written.text);
			assert.equal((await reading).status, 200);
		}
		const ackP95 = percentile(acknowledgements, 95);
		console.log(JSON.stringify({ concurrentHistoryAckP95Ms: ackP95 }));
		assert.ok(
			(durations[1] as number) < Math.max(600, (durations[0] as number) * 8),
			"fourfold history must not cause quadratic export cost",
		);
		assert.ok(ackP95 < 250, `concurrent history acknowledgement p95 ${ackP95} ms must stay below 250 ms in this local workload`);
	} finally {
		await host.stop();
		await dir.remove();
	}
});
