import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"request opens one subject and an equal draft ignores requestedAt without writing",
);
test.todo(
	"request supersedes on every other draft difference and allocates a new ID",
);
test.todo("withdraw closes only the open decision and creates no task");
test.todo(
	"request and decision work after a table write because they touch only documents",
);
test.todo("answer refuses an unknown ID with unknown_decision");
test.todo(
	"equal answer repeats without writes and preserves the first device and time",
);
test.todo(
	"different basis choice or annotations after answer gives conflict with the record",
);
test.todo(
	"equal retry after only faulted creates one replacement even under racing retries",
);
test.todo("equal retry after failed or aborted does not recreate continuation");
test.todo(
	"superseded or withdrawn answer gives not_open with the current open decision",
);
test.todo("open answer with wrong basis gives stale_basis and writes nothing");
test.todo(
	"open answer with an unlisted choice gives unknown_choice and writes nothing",
);
test.todo(
	"bad_annotation rejects reversed out of bounds fractional and negative UTF-16 ranges",
);
test.todo(
	"valid UTF-16 and whole-basis annotations are stored with every choice",
);
test.todo(
	"missing then definition gives extension_not_loaded and leaves the slot open",
);
test.todo("answer task is background and belongs to the decision conversation");
test.todo(
	"two simultaneous answers produce one winning record and one live continuation",
);
test.todo("storage rejection remains unknown and equal resend converges");
