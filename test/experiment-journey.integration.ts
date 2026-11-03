import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Engine } from "../src/engine/runtime.ts";
import { assignments, saveGround, until } from "./support/investigation.ts";
import { admin, packet, roleFixture } from "./support/roles.ts";
import { sourceFixture } from "./support/source.ts";

test("E02/E09/E10 disproved favorite retains protocol, exact negative evidence and independent comparison after cleanup", async () => {
	const source = await sourceFixture({ "fixture.txt": { text: "fixed-input\r\n" } });
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
	const engine = new Engine({
		provider: p.provider,
		apiKey: "owned-fixture",
		families: { "claude-sonnet-4-6": "claude" },
		experiments: { root: join(source.root, "experiments"), repositories: { owned: source.repo } },
	});
	const f = await roleFixture(engine);
	let sourceClosed = false;
	try {
		const ground = await saveGround(f.ledger);
		const original = JSON.stringify({
			schema: 1,
			ground,
			question: "Is the favorite at most 10?",
			hypothesis: "favorite <= 10",
			falsifier: "favorite > 10",
			decisionRule: "Any measurement greater than 10 is negative; missing measurement is inconclusive",
			controls: ["same fixture"],
			fixtures: ["fixture.txt"],
			failureCases: ["missing measurement"],
			retainedOutputs: ["measurement.txt", "raw stdout", "source and fixture", "report"],
			budget: { maxCommands: 2, timeoutMs: 2000 },
			profile: { ...source.profile, maxBytes: 1048576 },
			source: { repository: "owned", commit: source.commit },
			candidates: ["favorite", "control"],
		});
		const saved = await f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: "protocol",
				workflow: "workflow:2",
				expected: { document: null },
				command: { type: "saveDocument", document: "protocol", mediaType: "text/plain", content: Buffer.from(original).toString("base64") },
			},
			admin,
		);
		assert.ok(saved.status === "accepted", JSON.stringify(saved));
		const protocol = String(saved.result.revision);
		for (const candidate of ["favorite", "control", null]) {
			const script = candidate
				? `const fs=require('fs'); if(fs.existsSync('/candidates')) throw Error('other candidate exposed'); if(fs.readFileSync('fixture.txt','utf8')!=='fixed-input\\r\\n') throw Error('fixture changed'); fs.writeFileSync('measurement.txt', '${candidate === "favorite" ? 12 : 8}'); console.log('${candidate === "favorite" ? 12 : 8}');`
				: `const fs=require('fs'); const n=Number(fs.readFileSync('/candidates/favorite/measurement.txt')); try { fs.writeFileSync('/candidates/favorite/measurement.txt','9'); throw Error('repair succeeded'); } catch(e) { if(e.code!=='EROFS') throw e; } fs.writeFileSync('independent.txt',String(n)); console.log('negative:'+n);`;
			const outcome = JSON.stringify({
				schema: 1,
				protocol,
				outcome: candidate === "control" ? "positive" : "negative",
				summary: "Preregistered rule applied without repair",
				measurements: [{ name: candidate ?? "independent favorite", value: candidate === "control" ? 8 : 12, unit: "units" }],
				failures: [],
				limits: ["Scripted provider; not model judgment"],
			});
			p.setResponses([
				() => fauxAssistantMessage(fauxToolCall("experiment_run", { argv: ["node", "-e", script] }), { stopReason: "toolUse" }),
				() => fauxAssistantMessage(fauxToolCall("submit_role_result", { text: outcome, supports: [] }), { stopReason: "toolUse" }),
			]);
			const input = {
				...packet({ role: candidate ? "experiment-candidate" : "experiment-parent", execution: "linux-writer", maxInputBytes: 1048576 }),
				experiment: { protocol, candidate },
			};
			const reply = await f.command({ type: "assignTask", slice: "workflow:2", delivery: false, packet: input });
			assert.ok(reply.status === "accepted", JSON.stringify(reply));
			const id = String(reply.result.assignment);
			await until(() => {
				const a = assignments(f.ledger).find((a) => a.id === id);
				assert.notEqual(a?.status, "blocked", JSON.stringify(a));
				return a?.status === "submitted" && !a.executing;
			});
		}
		const all = assignments(f.ledger);
		assert.equal(all.length, 3, "experiment must not create adoption or publication work");
		assert.ok(all.every((a) => !a.delivery));
		const inherited = await f.command({
			type: "assignTask",
			slice: "independent",
			delivery: false,
			packet: packet({ role: "watchdog", inputs: [all[0]!.report!] }),
		});
		assert.ok(
			inherited.status === "refused" && inherited.code === "forbidden_scope",
			`watchdog cannot inherit earlier experiment-candidate report: ${JSON.stringify(inherited)}`,
		);
		const before = await f.ledger.artifact(admin, { export: { workflow: "workflow:2" } });
		assert.ok("manifest" in before && before.manifest.complete);
		const parent = all[2]!;
		assert.equal(
			JSON.parse(Buffer.from(before.content[parent.report!]!, "base64").toString()).outcome,
			"negative",
			"disproved favorite remains negative evidence",
		);
		assert.equal(Buffer.from(before.content[protocol]!, "base64").toString(), original, "post-result criteria must remain immutable");
		const snapshots = all.map((a) => a.experimentSource!);
		for (const ref of snapshots) assert.ok(before.content[ref], "exact source and raw evidence must precede cleanup");
		const negative = Buffer.from(before.content[snapshots[0]!]!, "base64").toString();
		assert.match(negative, /"stdout":"12\\n"/, "retain raw decisive negative measurement");
		assert.match(negative, /"path":"measurement.txt"/);
		await source.close();
		sourceClosed = true;
		await f.reopen();
		for (const ref of [protocol, ...snapshots, ...all.map((a) => a.report!)]) {
			const retained = await f.ledger.artifact(admin, { read: ref });
			assert.ok("content" in retained, "negative evidence survives cleanup");
			assert.equal(retained.content.toString("base64"), before.content[ref]);
		}
	} finally {
		await f.close();
		if (!sourceClosed) await source.close();
	}
});
