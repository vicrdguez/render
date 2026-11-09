import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { sourceFixture } from "./support/source.ts";

test("E08 parent cannot repair originals but can rerun in separate scratch", async () => {
	const f = await sourceFixture({ "measurement.txt": { text: "12\n" } });
	try {
		const base = await Effect.runPromise(f.effects.perform({ type: "resolve", project: f.project, commit: f.commit }));
		const inputs = { ...base, readOnly: { favorite: base } };
		const parent = await Effect.runPromise(f.sandboxes.prepare(f.scope, f.profile, inputs));
		const result = await Effect.runPromise(
			f.sandboxes.execute(parent, {
				scope: f.scope,
				argv: [
					"node",
					"-e",
					`const fs=require('fs');
console.log('ORIGINAL='+fs.readFileSync('/candidates/favorite/measurement.txt','utf8').trim());
try { fs.writeFileSync('/candidates/favorite/measurement.txt','9'); console.log('REPAIRED'); } catch(e) { console.log('REFUSED='+e.code); }
fs.writeFileSync('/workspace/rerun.txt','12'); console.log('SCRATCH='+fs.readFileSync('/workspace/rerun.txt','utf8'));`,
				],
				timeoutMs: 1000,
			}),
		);
		assert.equal(result.exitCode, 0, result.stderr);
		assert.match(result.stdout, /ORIGINAL=12/);
		assert.match(result.stdout, /REFUSED=EROFS/, "parent must not repair a sealed favorite");
		assert.doesNotMatch(result.stdout, /REPAIRED/);
		assert.match(result.stdout, /SCRATCH=12/, "parent needs independent writable scratch");
		const sealed = await Effect.runPromise(f.sandboxes.seal(parent));
		assert.equal(Buffer.from(sealed.entries.find((e) => e.path === "rerun.txt")!.content, "base64").toString(), "12");
	} finally {
		await f.close();
	}
});
