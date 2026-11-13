/**
 * The list of calls, and what every call shares. Unit 2.
 * The first test is the version 1 surface: the 20 calls of host.md. The rest loop over `callNames`, so a call added to
 * src/host/calls.ts is covered here with no new test.
 * Seam: `serve` on port 0 and `fetch`, with a paired device.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { callNames, calls } from "../../src/host/calls.ts";

test("the server has exactly the 20 calls of docs/core/host.md", () => {
	assert.deepEqual([...callNames].sort(), [
		"addExtensions",
		"answer",
		"bind",
		"continue",
		"conversations",
		"create",
		"decision",
		"extensions",
		"faults",
		"history",
		"inbox",
		"input",
		"models",
		"open",
		"options",
		"projects",
		"setModel",
		"setOptions",
		"stop",
		"timeline",
	]);
});

test("open, inbox, and timeline stream; every other call replies once", () => {
	const streams = callNames.filter((name) => calls[name].reply === "stream");
	assert.deepEqual([...streams].sort(), ["inbox", "open", "timeline"]);
});

test("project is in the body of every call but extensions, models, projects, and inbox (protocol.md)", () => {
	const withoutProject = callNames.filter((name) => calls[name].scope === "server");
	assert.deepEqual([...withoutProject].sort(), ["extensions", "inbox", "models", "projects"]);
});

for (const name of callNames) {
	test.todo(`${name}: no token is unauthorized, a revoked token is unauthorized`);
	test.todo(`${name}: an unknown field is bad_request with its JSON pointer`);
	if (calls[name].scope === "project") test.todo(`${name}: an unknown project is unknown_project`);
}

test.todo("POST /v1/ with no name is unknown_call, and its calls field equals callNames");
test.todo("an old name such as workflows is unknown_call with the server's calls (W2)");
