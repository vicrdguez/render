import { test } from "node:test";
import { calls } from "../src/calls.js";

// Tests derive cases and route names from the only registry. Expected outcomes remain
// independent fixtures from docs/core/host.md and protocol.md, not values computed from handlers.
for (const [name, descriptor] of Object.entries(calls)) {
	test.todo(name + ": valid request travels over POST /v1/" + name);
	test.todo(
		name +
			": unknown body field is refused before " +
			descriptor.mode +
			" handler",
	);
}
