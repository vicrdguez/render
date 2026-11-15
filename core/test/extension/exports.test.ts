import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import * as chordContext from "@earendil-works/chord/context";
import * as aiModels from "@earendil-works/pi-ai/models";
import * as aiFaux from "@earendil-works/pi-ai/providers/faux";
import * as piDurable from "@earendil-works/pi-durable";
import * as nodeEnv from "@earendil-works/pi-durable/env/node";
import * as sqlite from "@earendil-works/pi-durable/storage/sqlite/node";
import * as durableTools from "@earendil-works/pi-durable/tools";
import * as piSchema from "@earendil-works/pi-schema";
import * as decisions from "../../src/store/decisions.js";
import * as events from "../../src/store/events.js";
import * as admin from "../../src/host/admin.js";
import * as host from "../../src/host/index.js";
import * as loader from "../../src/host/loader.js";
import * as storeTesting from "../../src/store/testing.js";
import * as server from "tau/server";
import * as root from "tau";
import * as chord from "tau/chord";
import * as durable from "tau/durable";
import * as schema from "tau/schema";
import * as testing from "tau/testing";
import ts from "typescript";
import * as helpers from "../../src/extension/helpers.js";

const directory = resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(
	readFileSync(resolve(directory, "package.json"), "utf8"),
);
const entries = {
	".": root,
	"./durable": durable,
	"./schema": schema,
	"./chord": chord,
	"./testing": testing,
	"./server": server,
};

test("tau exposes exactly six package entries", () => {
	assert.deepEqual(
		Object.keys(manifest.exports).sort(),
		Object.keys(entries).sort(),
	);
});

const readme = readFileSync(resolve(directory, "README.md"), "utf8");
function rows(entry: string) {
	const title = `tau${entry.slice(1)}`;
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
		resolve(directory, manifest.exports[entry].types),
	);
	const program = ts.createProgram(declarations, {
		module: ts.ModuleKind.NodeNext,
		skipLibCheck: true,
	});
	const checker = program.getTypeChecker();
	const seen = new Set<string>();
	assert.deepEqual(
		[...readme.matchAll(/^## `(tau[^`]*)`$/gm)].map((match) => match[1]).sort(),
		Object.keys(entries)
			.map((entry) => `tau${entry.slice(1)}`)
			.sort(),
	);
	for (const [index, [entry, values]] of Object.entries(entries).entries()) {
		const title = `tau${entry.slice(1)}`;
		const documented = rows(entry);
		for (const { name, origin } of documented) {
			if (entry === ".")
				assert.ok(
					origin.startsWith("../store/") ||
						origin === "../host/index.js" ||
						origin === "./helpers.js",
					`${title}.${name}: root origin must be Tau-owned`,
				);
			if (entry === "./server") {
				assert.ok(
					origin.startsWith("./host/"),
					`${title}.${name}: server origin must be host-owned`,
				);
			}
			if (/^@earendil-works\/pi-ai(?:\/|$)/.test(origin))
				assert.equal(
					entry,
					"./testing",
					`${title}.${name}: pi-ai is testing only`,
				);
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
			if (entry === "./server") {
				for (const declaration of target.declarations ?? [])
					assert.ok(
						declaration
							.getSourceFile()
							.fileName.startsWith(resolve(directory, "dist/src/host") + "/"),
						`${title}.${symbol.name}: server must not re-export pi or helpers`,
					);
			}
			return {
				name: symbol.name,
				kind:
					!declaration.isTypeOnly &&
					!statement.isTypeOnly &&
					target.flags & ts.SymbolFlags.Value
						? "value"
						: "type",
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

test("extension re-exports preserve Tau and pi object identity", () => {
	const origins: Record<string, Record<string, unknown>> = {
		"./helpers.js": helpers,
		"../store/decisions.js": decisions,
		"../store/events.js": events,
		"../store/testing.js": storeTesting,
		"./host/admin.js": admin,
		"./host/index.js": host,
		"./host/loader.js": loader,
		"@earendil-works/chord/context": chordContext,
		"@earendil-works/pi-ai/models": aiModels,
		"@earendil-works/pi-ai/providers/faux": aiFaux,
		"@earendil-works/pi-durable": piDurable,
		"@earendil-works/pi-durable/env/node": nodeEnv,
		"@earendil-works/pi-durable/storage/sqlite/node": sqlite,
		"@earendil-works/pi-durable/tools": durableTools,
		"@earendil-works/pi-schema": piSchema,
	};
	for (const [entry, values] of Object.entries(entries)) {
		for (const { name, kind, origin } of rows(entry)) {
			if (kind !== "value") continue;
			const original = origins[origin];
			assert.ok(original && Object.hasOwn(original, name), `${origin}.${name}`);
			assert.equal(
				(values as Record<string, unknown>)[name],
				original[name],
				`${entry}.${name} must preserve identity from ${origin}`,
			);
		}
	}
});
