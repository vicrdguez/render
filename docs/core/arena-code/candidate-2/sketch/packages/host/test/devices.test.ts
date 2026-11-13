import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"pair code has eight characters expires in ten minutes works once and stores only secret hash",
);
test.todo("five consecutive wrong codes cancel every pending code");
test.todo(
	"device IDs match regex are never reused and compare secret hash in constant time",
);
test.todo(
	"devices file and admin socket are owner-only and admin messages are pi-schema checked",
);
test.todo(
	"revoked token is refused but past-check call finishes and its answer attribution remains",
);
