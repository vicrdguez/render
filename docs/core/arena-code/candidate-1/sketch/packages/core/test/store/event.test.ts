/**
 * `emit`, `eventLog`, and the log's creation. Unit 1.
 * Seams: `MemoryStorage` for the commit rules; SQLite in a temporary directory for close and reopen.
 */

import { test } from "node:test";

test.todo("the first openStore creates the log conversation; a second open finds it and creates no other");
test.todo("eventLog returns the log's ID inside any commit, as a document read");
test.todo("emit appends a typed entry in the log inside the caller's commit; a commit that throws leaves no event");
test.todo("emit is a table write: a table read after it in the same commit throws ReadAfterWrite");
test.todo("events written, the store closed and reopened on SQLite, read back in entry order (check 4)");
test.todo("the log takes no submission and starts no run");
test.todo("an event records the task that appended it (byTaskId)");
