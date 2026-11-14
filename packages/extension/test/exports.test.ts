import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { defineTask } from "@earendil-works/pi-durable";
import { obj } from "@earendil-works/pi-schema";
import * as root from "tau-extension";
import * as chord from "tau-extension/chord";
import * as durable from "tau-extension/durable";
import * as schema from "tau-extension/schema";
import * as testing from "tau-extension/testing";
import { request } from "tau-store";
import { fauxAnswer, openStore } from "tau-store/testing";
import ts from "typescript";
import * as helpers from "../src/helpers.js";

const directory = resolve(import.meta.dirname, "..");
const entries = {
	".": root,
	"./durable": durable,
	"./schema": schema,
	"./chord": chord,
	"./testing": testing,
};

test("tau-extension exposes exactly five package entries", () => {
	const manifest = JSON.parse(readFileSync(resolve(directory, "../package.json"), "utf8"));
	assert.deepEqual(Object.keys(manifest.exports).sort(), Object.keys(entries).sort());
});

test("README tables match every emitted value, type, and origin exactly once", () => {
	const readme = readFileSync(resolve(directory, "../README.md"), "utf8");
	const declarations = Object.keys(entries).map((entry) => resolve(directory, "src", `${entry === "." ? "index" : entry.slice(2)}.d.ts`));
	const program = ts.createProgram(declarations, { module: ts.ModuleKind.NodeNext, skipLibCheck: true });
	const checker = program.getTypeChecker();
	const seen = new Set<string>();
	assert.deepEqual([...readme.matchAll(/^## `(tau-extension[^`]*)`$/gm)].map((match) => match[1]).sort(), Object.keys(entries).map((entry) => `tau-extension${entry.slice(1)}`).sort());
	for (const [index, [entry, values]] of Object.entries(entries).entries()) {
		const title = `tau-extension${entry.slice(1)}`;
		const section = readme.split(`## \`${title}\``)[1]?.split("\n## ")[0];
		assert.ok(section, title);
		const documented = [...section.matchAll(/^\| `([^`]+)` \| (value|type) \| `([^`]+)` \|$/gm)].map((match) => ({ name: match[1], kind: match[2], origin: match[3] }));
		const source = program.getSourceFile(declarations[index]!);
		assert.ok(source);
		const module = checker.getSymbolAtLocation(source);
		assert.ok(module);
		const symbols = checker.getExportsOfModule(module);
		const actual = symbols.map((symbol) => {
			const declaration = symbol.declarations?.[0];
			assert.ok(declaration && ts.isExportSpecifier(declaration), symbol.name);
			const statement = declaration.parent.parent;
			assert.ok(statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier));
			const target = checker.getAliasedSymbol(symbol);
			return { name: symbol.name, kind: target.flags & ts.SymbolFlags.Value ? "value" : "type", origin: statement.moduleSpecifier.text };
		});
		const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
		assert.deepEqual(actual.sort(byName), documented.sort(byName), title);
		assert.deepEqual(Object.keys(values).sort(), documented.filter((row) => row.kind === "value").map((row) => row.name).sort(), title);
		for (const { name } of actual) {
			assert.equal(seen.has(name), false, `${name} has more than one import path`);
			seen.add(name);
		}
	}
});

test("extension re-exports preserve Tau and pi object identity", () => {
	assert.equal(root.request, request);
	assert.equal(durable.defineTask, defineTask);
	assert.equal(schema.obj, obj);
	assert.equal(chord.BACKGROUND_CONTEXT, BACKGROUND_CONTEXT);
	assert.equal(testing.createModels, createModels);
	assert.equal(testing.fauxAnswer, fauxAnswer);
	assert.equal(testing.openStore, openStore);
	for (const name of ["modelRef", "options", "prose", "role"] as const) {
		assert.equal(root[name], helpers[name]);
	}
});
