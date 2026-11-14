import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import * as root from "tau-extension";
import * as chord from "tau-extension/chord";
import * as durable from "tau-extension/durable";
import * as schema from "tau-extension/schema";
import * as testing from "tau-extension/testing";
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
	const manifest = JSON.parse(
		readFileSync(resolve(directory, "../package.json"), "utf8"),
	);
	assert.deepEqual(
		Object.keys(manifest.exports).sort(),
		Object.keys(entries).sort(),
	);
});

const readme = readFileSync(resolve(directory, "../README.md"), "utf8");
function rows(entry: string) {
	const title = `tau-extension${entry.slice(1)}`;
	const section = readme.split(`## \`${title}\``)[1]?.split("\n## ")[0];
	assert.ok(section, title);
	return [
		...section.matchAll(/^\| `([^`]+)` \| (value|type) \| `([^`]+)` \|$/gm),
	].map(([, name, kind, origin]) => {
		assert.ok(name && kind && origin);
		return { name, kind, origin };
	});
}

test("README tables match every emitted value, type, and origin exactly once", () => {
	const declarations = Object.keys(entries).map((entry) =>
		resolve(
			directory,
			"src",
			`${entry === "." ? "index" : entry.slice(2)}.d.ts`,
		),
	);
	const program = ts.createProgram(declarations, {
		module: ts.ModuleKind.NodeNext,
		skipLibCheck: true,
	});
	const checker = program.getTypeChecker();
	const seen = new Set<string>();
	assert.deepEqual(
		[...readme.matchAll(/^## `(tau-extension[^`]*)`$/gm)]
			.map((match) => match[1])
			.sort(),
		Object.keys(entries)
			.map((entry) => `tau-extension${entry.slice(1)}`)
			.sort(),
	);
	for (const [index, [entry, values]] of Object.entries(entries).entries()) {
		const title = `tau-extension${entry.slice(1)}`;
		const documented = rows(entry);
		for (const { name, origin } of documented) {
			if (entry === ".")
				assert.ok(
					origin === "tau-store" || origin === "./helpers.js",
					`${title}.${name}: root origin must be tau-store or ./helpers.js`,
				);
			if (/^@earendil-works\/pi-ai(?:\/|$)/.test(origin))
				assert.equal(entry, "./testing", `${title}.${name}: pi-ai is testing only`);
		}
		const file = declarations[index];
		assert.ok(file);
		const source = program.getSourceFile(file);
		assert.ok(source);
		const module = checker.getSymbolAtLocation(source);
		assert.ok(module);
		const symbols = checker.getExportsOfModule(module);
		const actual = symbols.map((symbol) => {
			const declaration = symbol.declarations?.[0];
			assert.ok(declaration && ts.isExportSpecifier(declaration), symbol.name);
			const statement = declaration.parent.parent;
			assert.ok(
				statement.moduleSpecifier &&
					ts.isStringLiteral(statement.moduleSpecifier),
			);
			const target = checker.getAliasedSymbol(symbol);
			return {
				name: symbol.name,
				kind: target.flags & ts.SymbolFlags.Value ? "value" : "type",
				origin: statement.moduleSpecifier.text,
			};
		});
		const byName = (a: { name: string }, b: { name: string }) =>
			a.name.localeCompare(b.name);
		assert.deepEqual(actual.sort(byName), documented.sort(byName), title);
		assert.deepEqual(
			Object.keys(values).sort(),
			documented
				.filter((row) => row.kind === "value")
				.map((row) => row.name)
				.sort(),
			title,
		);
		for (const { name } of actual) {
			assert.equal(
				seen.has(name),
				false,
				`${name} has more than one import path`,
			);
			seen.add(name);
		}
	}
});

test("extension re-exports preserve Tau and pi object identity", async () => {
	for (const [entry, values] of Object.entries(entries)) {
		for (const { name, kind, origin } of rows(entry)) {
			if (kind !== "value") continue;
			const original = origin === "./helpers.js" ? helpers : await import(origin);
			assert.equal(
				(values as Record<string, unknown>)[name],
				original[name as keyof typeof original],
				`${entry}.${name} must preserve identity from ${origin}`,
			);
		}
	}
});
