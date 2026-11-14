import assert from "node:assert/strict";
import { glob, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../../..");
const imports = new Map();
for await (const file of glob("packages/{w1,w2,websearch}/{src,test}/**/*.ts", { cwd: root })) {
	const source = ts.createSourceFile(file, await readFile(resolve(root, file), "utf8"), ts.ScriptTarget.Latest, true);
	function visit(node) {
		if (ts.isImportDeclaration(node) && /^(?:@earendil-works\/|tau-store|tau-kit)/.test(node.moduleSpecifier.text)) {
			const from = node.moduleSpecifier.text;
			const bindings = node.importClause?.namedBindings;
			assert.ok(bindings && ts.isNamedImports(bindings), file);
			const names = imports.get(from) ?? new Set();
			imports.set(from, names);
			for (const binding of bindings.elements) names.add((binding.propertyName ?? binding.name).text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
}
for (const [from, names] of [...imports].sort()) {
	const entry = from.includes("pi-durable") ? "/durable" : from.includes("pi-schema") ? "/schema" : from.includes("chord") ? "/chord" : from.includes("pi-ai") || from === "tau-store/testing" ? "/testing" : "";
	console.log(`${from} -> tau-extension${entry}: ${[...names].sort().join(", ")}`);
}
