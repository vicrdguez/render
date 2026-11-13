import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"pair is the only unauthenticated route and all replies carry Tau-Protocol 1",
);
test.todo(
	"bad body unknown field forged by and oversized body have the locked refusal status and shape",
);
test.todo(
	"unknown_call discovery derives from calls and contains all 20 names",
);
test.todo(
	"device-scoped request IDs deduplicate same-device input but not different-device input",
);
test.todo(
	"continue busy and input whenIdle reject map to busy and idle without writes",
);
test.todo(
	"event log is hidden from conversations and refuses input continue stop setModel",
);
test.todo(
	"history and open allow reading the event log and timeline uses the same view",
);
test.todo(
	"setModel changes model and thinking only from the next model request",
);
test.todo("stop waits and a second stop can end a newly started run");
test.todo(
	"storage failure returns unknown storage_failed never a false refusal",
);
test.todo(
	"foreign Host and Origin are refused without CORS redirect or authorization logging",
);
