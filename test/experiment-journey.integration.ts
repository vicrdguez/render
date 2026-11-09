import assert from "node:assert/strict";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../src/engine/runtime.ts";
import { assignments, finding, investigationPacket, saveGround, sourceFiles, until } from "./support/investigation.ts";
import { admin, claudeFixture, PROJECT, packet, roleFixture } from "./support/roles.ts";
import { sourceFixture } from "./support/source.ts";

test("E02/E09/E10 disproved favorite retains protocol, exact negative evidence and independent comparison after cleanup", async () => {
	const source = await sourceFixture({ ...sourceFiles, "fixture.txt": { text: "fixed-input\r\n" } });
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6", reasoning: true }] });
	const engine = new Engine({
		provider: p.provider,
		...claudeFixture,
		experiments: { root: join(source.root, "experiments") },
		investigations: { root: join(source.root, "investigation") },
	});
	const f = await roleFixture(engine, { remote: source.repo, defaultBranch: "fixture" });
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
			source: { repository: PROJECT, commit: source.commit },
			candidates: ["favorite", "control"],
		});
		const saved = await Effect.runPromise(
			f.ledger.command(
				{
					version: 1,
					authorityEpoch: f.ledger.status().authorityEpoch,
					commandId: "protocol",
					workflow: "workflow:3",
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "protocol",
						mediaType: "text/plain",
						content: Buffer.from(original).toString("base64"),
					},
				},
				admin,
			),
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
			let renderedProtocol = "";
			p.setResponses([
				(transcript) => {
					const prompt = JSON.parse(transcript.messages.filter((message) => message.role === "user").at(-1)!.content as string);
					renderedProtocol = prompt.inputs.find((input: { ref: string }) => input.ref === protocol).text;
					return fauxAssistantMessage(fauxToolCall("experiment_run", { argv: ["node", "-e", script] }), { stopReason: "toolUse" });
				},
				() => fauxAssistantMessage(fauxToolCall("submit_role_result", { text: outcome, supports: [] }), { stopReason: "toolUse" }),
			]);
			const input = {
				...packet({ role: candidate ? "experiment-candidate" : "experiment-parent", execution: "linux-writer", maxInputBytes: 1048576 }),
				experiment: { protocol, candidate },
			};
			const reply = await f.command({ type: "assignTask", slice: "workflow:3", delivery: false, packet: input });
			assert.ok(reply.status === "accepted", JSON.stringify(reply));
			const id = String(reply.result.assignment);
			await until(() => {
				const a = assignments(f.ledger).find((a) => a.id === id);
				assert.notEqual(a?.status, "blocked", JSON.stringify(a));
				return a?.status === "submitted" && !a.executing;
			});
			assert.equal(renderedProtocol, original, "execution criteria must remain the original protocol after measurement");
			if (candidate === "favorite") {
				const changed = await Effect.runPromise(
					f.ledger.command(
						{
							version: 1,
							authorityEpoch: f.ledger.status().authorityEpoch,
							commandId: "material-deviation",
							workflow: "workflow:3",
							expected: { document: protocol },
							command: {
								type: "saveDocument",
								document: "protocol",
								mediaType: "text/plain",
								content: Buffer.from(
									JSON.stringify({ ...JSON.parse(original), decisionRule: "At most 20 now counts as positive" }),
								).toString("base64"),
							},
						},
						admin,
					),
				);
				assert.ok(changed.status === "accepted");
				assert.notEqual(changed.result.revision, protocol, "post-measurement criteria changes require a new protocol identity");
			}
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
		const before = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
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
		// An advisory handoff may cite experiments, but cannot turn their source/results into runner proof.
		p.setResponses([
			(transcript) => {
				const prompt = JSON.parse(transcript.messages.filter((m) => m.role === "user").at(-1)!.content as string);
				const observed = prompt.inputs.find((i: { text: string }) => i.text.includes('"kind":"investigation-source"'));
				return fauxAssistantMessage(
					fauxToolCall("submit_role_result", { text: JSON.stringify(finding(observed.ref, ground)), supports: [] }),
					{ stopReason: "toolUse" },
				);
			},
		]);
		const investigation = await f.command({
			type: "assignTask",
			slice: "investigation",
			delivery: false,
			packet: investigationPacket(ground, source.commit),
		});
		assert.ok(investigation.status === "accepted", JSON.stringify(investigation));
		await until(() =>
			assignments(f.ledger).some((a) => a.id === investigation.result.assignment && a.status === "submitted" && !a.executing),
		);
		const observation = assignments(f.ledger).find((a) => a.id === investigation.result.assignment)!.investigationSource!;
		const requestPrompt = (selected = observation) =>
			f.command(
				{
					type: "requestLocalVerificationPrompt",
					source: selected,
					expectedSequence: f.ledger.status().sequence,
				},
				admin,
			);
		const wrongSource = await requestPrompt(snapshots[0]!);
		assert.ok(
			wrongSource.status === "refused" && wrongSource.code === "missing_content",
			"experiment source is not a trusted local-prompt source observation",
		);
		const unchanged = assignments(f.ledger);
		const advisory = await requestPrompt();
		assert.ok(advisory.status === "accepted", JSON.stringify(advisory));
		const promptArtifact = await Effect.runPromise(f.ledger.artifact(admin, { read: String(advisory.result.textArtifact) }));
		assert.ok("content" in promptArtifact);
		const prompt = promptArtifact.content.toString();
		const sections = prompt.split("### ");
		const experimentSection = sections.find((s) => s.startsWith(`${snapshots[0]}:`));
		assert.ok(experimentSection, "advisory must retain exact experiment source and raw negative evidence");
		assert.match(experimentSection, /retained assertion \(unverified assertion\)/, "experiment capture is not runner proof");
		assert.ok(experimentSection.includes(JSON.stringify(negative)), "advisory must quote literal sealed negative bytes");
		assert.ok(prompt.includes(JSON.stringify(original)), "advisory must include the original protocol, not only newer criteria");
		assert.deepEqual(assignments(f.ledger), unchanged, "advice must not adopt, gate or alter experiment work");
		await source.close();
		sourceClosed = true;
		await f.reopen();
		const retainedPrompt = await Effect.runPromise(f.ledger.artifact(admin, { read: String(advisory.result.textArtifact) }));
		assert.ok("content" in retainedPrompt);
		assert.equal(retainedPrompt.content.toString(), prompt, "advisory exact evidence survives cleanup and restart");
		for (const ref of [protocol, ...snapshots, ...all.map((a) => a.report!)]) {
			const retained = await Effect.runPromise(f.ledger.artifact(admin, { read: ref }));
			assert.ok("content" in retained, "negative evidence survives cleanup");
			assert.equal(retained.content.toString("base64"), before.content[ref]);
		}
		await Effect.runPromise(f.ledger.close());
		const db = new DatabaseSync(join(f.data, "render.db"));
		try {
			const row = db.prepare("SELECT id, record FROM entries WHERE json_extract(record, '$.data.revision') = ?").get(snapshots[0]!) as {
				id: number;
				record: string;
			};
			assert.ok(row);
			const record = JSON.parse(row.record);
			record.data.text = "plausible newer source is not the exact sealed candidate";
			db.prepare("UPDATE entries SET record = ? WHERE id = ?").run(JSON.stringify(record), row.id);
		} finally {
			db.close();
		}
		const reopened = await f.reopen();
		await assert.rejects(
			Effect.runPromise(reopened.render(assignments(f.ledger)[2]!)),
			new RegExp(snapshots[0]!),
			"damaged exact candidate blocks independent reliance",
		);
		const sequence = f.ledger.status().sequence;
		const damagedPrompt = await requestPrompt();
		assert.ok(
			damagedPrompt.status === "refused" && damagedPrompt.code === "content_corrupt",
			"advisory must refuse corrupt exact experiment evidence",
		);
		assert.ok(damagedPrompt.reason.includes(snapshots[0]!));
		assert.equal(f.ledger.status().sequence, sequence);
		const damaged = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		assert.ok("manifest" in damaged && !damaged.manifest.complete);
		assert.ok(damaged.manifest.missing.some((missing) => missing.ref === snapshots[0] && missing.code === "content_corrupt"));
	} finally {
		await f.close();
		if (!sourceClosed) await source.close();
	}
});
