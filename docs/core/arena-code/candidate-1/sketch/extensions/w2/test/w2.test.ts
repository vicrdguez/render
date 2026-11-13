/**
 * W2, row by row (docs/core/walk.md, "W2, forecasts"). Unit 4.
 * Seam: a real host (`tau-core/host`) on a temporary root with SQLite stores, the faux model calling W2's tools, and a
 * clock the test moves; "the server stops for a week" is `reopen()` after moving the clock.
 */

import { test } from "node:test";

test.todo(
	"create refuses with options_invalid until W2's model is set; then F has W2's three tools and no coding tool",
);
test.todo("row 2: record_forecast appends the forecast, creates a background w2.due, and emits w2.recorded, once");
test.todo("row 2 rerun: killed after record_forecast's commit, the rerun finds its receipt and appends nothing (K1)");
test.todo("rows 3 and 4: the host is closed, the clock passes the date, the host reopens, and the decision is asked");
test.todo(
	"row 4: the decision's basis is the forecast entry; its choices are yes, no, void, not yet; then is w2.score",
);
test.todo("row 5 and 6: not yet creates a new w2.due seven days after the stored answer time, on the same subject");
test.todo("rows 7 and 8: revise_forecast withdraws the open decision in the same commit");
test.todo("row 10: an old w2.due that wakes after a revision ends without asking, emitting nothing");
test.todo(
	"rows 12 and 13: yes scores (0.60 - 1)^2 = 0.16 and emits w2.resolved; a second w2.score for it does nothing",
);
test.todo("void emits w2.voided and resolves nothing");
test.todo("a Stop in F does not abort a sleeping w2.due");
test.todo("row 15: calibration reads the w2.resolved events from the log and reports them");
test.todo("an answer whose w2.score faulted is resent and the new task scores once");
