import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { ROOT, tempDir } from "./support/host.ts";

// Literal portable input, independent of the exporter and its expected results.
const record = {
	ref: "revision:2",
	kind: "document",
	schema: 1,
	workflow: "workflow:1",
	sequence: 2,
	commandId: "save",
	parents: [],
	supersedes: [],
	outcome: null,
	refs: {},
	mediaType: "text/plain",
	byteLength: 3,
	digest: "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	content: true,
};
const fixture = () => ({
	version: 1,
	manifest: {
		format: "render-history",
		version: 1,
		authorityEpoch: "authority:fixture",
		cutoff: 2,
		scope: { workflows: ["workflow:1"], kinds: [] },
		complete: true,
		missing: [],
		redactions: [],
		omittedKinds: [],
		exclusions: ["unsaved_client_buffers", "uncommitted_provider_streams", "unsnapshotted_worker_files"],
		recordCount: 1,
	},
	jsonl: `${JSON.stringify(record)}\n`,
	text: "abc",
	content: { "revision:2": "YWJj" },
});

test("independent-export-reader: literal bytes and named invalid/version/missing/corrupt/link refusals", async () => {
	const dir = await tempDir("export-reader");
	try {
		const path = join(dir.path, "portable.json");
		const read = async (bundle: unknown) => {
			await writeFile(path, JSON.stringify(bundle));
			const result = spawnSync(process.execPath, [join(ROOT, "src/client/read-export.ts"), path], { encoding: "utf8" });
			return { code: result.status, body: JSON.parse(result.stdout) };
		};
		const good = await read(fixture());
		assert.equal(good.code, 0);
		assert.equal(good.body.documents[0].text, "abc");
		const cases: [string, (b: ReturnType<typeof fixture>) => void][] = [
			[
				"unsupported_version",
				(b) => {
					b.version = 99;
				},
			],
			[
				"unsupported_schema",
				(b) => {
					b.jsonl = JSON.stringify({ ...record, schema: 99 });
				},
			],
			[
				"invalid_export",
				(b) => {
					b.jsonl = "{broken";
				},
			],
			[
				"missing_content",
				(b) => {
					b.content = {} as typeof b.content;
				},
			],
			[
				"content_corrupt",
				(b) => {
					b.content["revision:2"] = "eHl6";
				},
			],
			[
				"invalid_export",
				(b) => {
					b.jsonl = JSON.stringify({ ...record, parents: ["revision:missing"] });
				},
			],
			[
				"invalid_export",
				(b) => {
					b.jsonl = JSON.stringify({ ...record, sequence: 3 });
				},
			],
			[
				"invalid_export",
				(b) => {
					b.manifest.recordCount = 2;
				},
			],
		];
		for (const [code, change] of cases) {
			const bad = fixture();
			change(bad);
			const result = await read(bad);
			assert.equal(result.code, 1, code);
			assert.equal(result.body.code, code);
		}
	} finally {
		await dir.remove();
	}
});
