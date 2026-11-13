/**
 * `faults` (host.md, "Faulted tasks"). Unit 2.
 * Seam: `host.call` on a temporary root; a stand-in extension with a task whose phase throws.
 */

import { test } from "node:test";

test.todo("a task whose phase throws is listed with its kind, conversation, and error (H10)");
test.todo("the scan is by kind: pi-durable's own finished tasks are not read or listed");
test.todo("decision is set only when that decision's continuation is this task; a replaced then task has none");
test.todo("the cursor holds one position per kind and pages to the end across a restart");
test.todo("a cursor made by another call is bad_cursor");
test.todo("faults writes nothing");
