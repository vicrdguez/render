import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"record writes forecast timer receipt and event in one commit and replay returns saved result",
);
test.todo(
	"background due survives Stop and a week offline then asks on startup without a model",
);
test.todo(
	"old timer after revision sees latest mismatch and emits or requests nothing",
);
test.todo(
	"revision immediately withdraws still-open decision in the same commit",
);
test.todo(
	"not yet uses stored answer time plus seven days and a late score checks expected round",
);
test.todo("yes no compute Brier score once and void emits without a score");
test.todo(
	"recreated score task deduplicates by decision ID and obsolete round cannot score newer forecast",
);
test.todo(
	"calibration pages full project event log and filters resolved kind across conversations",
);
test.todo(
	"closed W2 has exactly three tools no shell no Git no network no files after project additions",
);
