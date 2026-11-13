import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { prose } from "tau-kit";

test("prose renders emitted Markdown in one pass and preserves Markdown", async () => {
	assert.ok(import.meta.dirname.includes("/dist/"));
	const { instructions } = await import("./fixtures/instructions.js");
	assert.equal(
		instructions({
			pass: "2",
			contract: "C4",
			findings: "- {{pass}} stays literal\n- $&",
		}),
		"You own pass 2 for `C4`.\n\n- {{pass}} stays literal\n- $&\n\nAgain 2.\n",
	);
});

test("prose loads once and accepts a file with no slots", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "tau-prose-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	writeFileSync(join(directory, "fixed.md"), "# Fixed `text`\n");
	const render = prose(directory, "fixed.md", []);
	rmSync(join(directory, "fixed.md"));
	assert.equal(render({}), "# Fixed `text`\n");
});

test("missing files and differing slot sets stop a child module at import", (t) => {
	const directory = mkdtempSync(join(tmpdir(), "tau-prose-load-"));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const kit = new URL("../src/index.js", import.meta.url).href;
	const cases = [
		{ name: "missing", slots: [] },
		{ name: "undeclared", body: "{{extra}}", slots: [] },
		{ name: "absent", body: "No slots.", slots: ["missing"] },
		{ name: "misnamed", body: "{{a}}", slots: ["b"] },
		{ name: "condition", body: "{{#if ready}}yes{{/if}}", slots: [] },
		{ name: "loop", body: "{{#each items}}{{item}}{{/each}}", slots: ["item"] },
		{ name: "include", body: "{{> other}}", slots: [] },
	];
	for (const item of cases) {
		if (item.body !== undefined)
			writeFileSync(join(directory, `${item.name}.md`), item.body);
		const module = join(directory, `${item.name}.mjs`);
		writeFileSync(
			module,
			`import { prose } from ${JSON.stringify(kit)};\nprose(import.meta.dirname, ${JSON.stringify(`${item.name}.md`)}, ${JSON.stringify(item.slots)});\nconsole.log("loaded");\n`,
		);
		const child = spawnSync(process.execPath, [module], { encoding: "utf8" });
		assert.equal(child.status, 1, item.name + child.stderr);
		assert.equal(child.stdout, "", item.name);
		assert.match(child.stderr, item.name === "missing" ? /ENOENT/ : /slot/i);
	}
});
