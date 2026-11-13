/**
 * The composition root. Units 2 to 5.
 * Seam: the modules as imported, and the `tau` command as a child process on a temporary root with `--port 0`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { modules } from "../src/extensions.ts";

test("every module the server has loads, and their extension names are distinct", () => {
	const names = modules.map((module) => module.extension.name);
	assert.equal(new Set(names).size, names.length);
});

test.todo("tau serve --port 0 prints its port; tau device pair prints a code; pair over HTTP gives a token");
test.todo(
	"W0 over HTTP: bind with no extension, create with a model, input, open, then a restart and the current state",
);
test.todo("SIGTERM ends every open stream with end stopping and exits 0");
