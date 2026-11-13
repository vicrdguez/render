import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"K1 safe publish replays under the same task ID and returns its stored receipt",
);
test.todo(
	"K2 missing receipt creates a duplicate basis so request equality alone is not replay safety",
);
test.todo("K3 five unchanged interrupted waits fault the task");
test.todo(
	"K4 equal answered resend replaces faulted task and decision-ID dedup prevents repeat effect",
);
test.todo(
	"K5 changed checkpoint before a wait avoids the unchanged-restart limit",
);
test.todo(
	"K6 kill inside answer callback leaves open and no task then kill after commit leaves both",
);
