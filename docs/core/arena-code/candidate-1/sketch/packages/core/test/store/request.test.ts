/**
 * `request`, `withdraw`, and `decision`. Unit 1.
 * Seam: `openStore` on pi-durable's `MemoryStorage`, a stand-in extension with one `then` task, commits made by the
 * test the way a tool or a task makes them. The ways it can fail, from primitives.md's `request` table and rules.
 */

import { test } from "node:test";

test.todo("a subject with no open decision opens one with ID <subject>#1, and the open list holds its four fields");
test.todo("an equal draft (every field but requestedAt) returns the open decision and writes nothing");
test.todo(
	"a draft that differs in basis, title, choices, conversation, or then supersedes the open one and opens #n+1",
);
test.todo("a subject asked again after an answer gets a new ID, never a reused one (the counter outlives the slot)");
test.todo("request reads no table: called after appendEntry in the same commit, it does not throw ReadAfterWrite");
test.todo("request stores then.definition.name and the basis entry's ID, never the task or the entry");
test.todo("withdraw on an open subject marks it withdrawn, clears the slot, and creates no task");
test.todo("withdraw on a subject with no open decision changes nothing");
test.todo("decision returns the record by ID in every status, and undefined for an ID never requested");
test.todo(
	"decision on an ID never requested stores no document: tx.doc on a family member creates it (probe/pi-facts)",
);
test.todo("a rerun of a commit that appends a new basis and requests again supersedes the first decision (K2 shape)");
