import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"bare agent and open designer get web_search from project default while closed roles never do",
);
test.todo(
	"unset provider key returns tool error without refusing unrelated conversation create",
);
test.todo(
	"Webfox root result content survives real 1.5.2 tool result serialization",
);
test.todo(
	"provider response is pi-schema validated and malformed response is a safe tool error",
);
test.todo(
	"key is absent from result entries event sections error and logs including provider error text",
);
test.todo(
	"missing extension at restart preserves option document and exposes missing code",
);
test.todo(
	"interrupted unsafe search yields tool interruption rather than a false exactly-once promise",
);
