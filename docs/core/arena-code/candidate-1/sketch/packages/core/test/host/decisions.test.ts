/**
 * `inbox`, `decision`, `answer`, and `timeline` through the host. Unit 2.
 * Seam: `host.call` on a temporary root; a stand-in extension whose tool requests a decision.
 */

import { test } from "node:test";

test.todo(
	"answer through the host maps the answer table row for row: conflict carries decision, not_open carries open",
);
test.todo("by comes from the device; a body field by is bad_request at /by");
test.todo("decision returns the record, its basis text, and the then task's state");
test.todo("an answered decision whose then task faulted shows the error, and an equal resend starts a new task");
test.todo("inbox's first frame holds every project's open list under its name, four fields per subject");
test.todo("an answer arrives in every open inbox as a d op for the subject");
test.todo("timeline streams the log's events; older ones page with history on the log's ID");
