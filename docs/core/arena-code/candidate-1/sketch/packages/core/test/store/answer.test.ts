/**
 * `answer`, the host's. Unit 1. Imported by relative path: it is not in tau-core's exports.
 * Seam: `openStore` on `MemoryStorage`; the registry is the test's, so a `then` task can be missing or present.
 * The ways it can fail are the rows of primitives.md's `answer` table, plus its rules on ownership and races.
 */

import { test } from "node:test";

test.todo("no such decision: unknown_decision");
test.todo(
	"answered, equal basis, choice, and annotations: the record with repeated: true, nothing written, first by kept",
);
test.todo("answered and equal, then task ended faulted: a new then task with the same input, stored as continuation");
test.todo("answered and equal, then task failed or aborted: repeated: true, no new task (only faulted counts)");
test.todo("answered, any field differs: conflict with the record");
test.todo("superseded or withdrawn: not_open with the subject's open decision, if it has one");
test.todo("open, basis differs from the stored basis: stale_basis");
test.todo("open, choice not in choices: unknown_choice");
test.todo(
	"open, a range outside the basis text, end before start, or counted past text.length in UTF-16: bad_annotation",
);
test.todo("open, an annotation with no range is a note on the whole basis and is stored as sent");
test.todo("open, no installed extension provides the then task: extension_not_loaded, and the decision stays open");
test.todo("open: answered with choice, annotations, device, at from the store clock, continuation; slot cleared");
test.todo("the then task is owned by the decision's conversation and is background: a Stop in it leaves the task");
test.todo("the then task gets { decision, choice } as input");
test.todo("two answers at once run one after the other: one wins, the other reads its record, one task exists");
test.todo("view returns the record, the basis text, and the then task's state, with the error of a faulted task");
