/**
 * The start order (host.md, "What the server reads at start"). Unit 2.
 * Seams: a host closed and opened again on the same root; a child process killed with SIGKILL for a crash mid-bind.
 */

import { test } from "node:test";

test.todo("every project under <root>/projects/ opens at start, and its due timers run without a client (W2 row 4)");
test.todo("a store reopened with an empty registry keeps a due timer blocked until its extension installs (H1)");
test.todo(
	"a store with no Project (a crash before bind's commit) is skipped and reported; the resent bind finishes it",
);
test.todo("a store whose Project names another project is skipped and reported");
test.todo("a listed extension the server no longer has: the project opens, projects reports it, its tasks wait");
test.todo("a crash between addExtensions' commit and its install is repaired at start");
test.todo("running tasks are set back to pending and resume; a cut-off run resumes");
test.todo("two modules with one extension name refuse to open the host");
