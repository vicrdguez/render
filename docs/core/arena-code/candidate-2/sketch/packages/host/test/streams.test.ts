import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"open starts with replacement then seven Chord op forms reconstruct a fresh view",
);
test.todo(
	"open after uses current documents and newest entries with 50 initial and 100 maximum",
);
test.todo(
	"folded before gap can be filled through bounded history without duplicates",
);
test.todo(
	"timeline history cursor survives restart and a wrong-call or wrong-query cursor gives bad_cursor",
);
test.todo(
	"inbox includes four subject fields prefixes every op path and adds newly bound projects",
);
test.todo(
	"one failed store watch ends merged inbox with failed rather than dropping a project",
);
test.todo("disconnect detaches watch while admitted run continues");
test.todo(
	"15 second idle heartbeat and 60 second undrained write cut use real socket backpressure",
);
test.todo(
	"clean stop sends stopping and revocation sends revoked before closing",
);
