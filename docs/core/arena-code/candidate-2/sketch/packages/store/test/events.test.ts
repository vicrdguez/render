import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"first open creates exactly one ownerless event log and reopen reuses it",
);
test.todo(
	"emit is atomic with caller writes and retains text time custom fields and task attribution",
);
test.todo("request emits nothing and never makes a table read fail");
test.todo("events survive SQLite close and reopen with stable entry order");
