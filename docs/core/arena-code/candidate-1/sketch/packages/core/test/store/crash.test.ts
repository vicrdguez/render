/**
 * K1 to K6 of docs/core/spikes/crash.mjs, again, against the real functions (README.md, "Next steps", step 1). Unit 1.
 * Seam: a child process on SQLite in a temporary directory, killed with SIGKILL, then reopened in a new process.
 * The child is test/store/support/crash-child.ts. It kills itself at the points the walk argued about. To die inside a
 * commit it wraps the Storage it passes to `openStore`, so no production code knows about the test.
 */

import { test } from "node:test";

test.todo("K1: a replay-safe tool with a receipt under api.taskId runs again after the kill and appends nothing more");
test.todo("K2: a tool with the default replay is not run again; the model's second call appends a twin and supersedes");
test.todo("K3: a task that waits in memory is faulted after five kills");
test.todo("K4: answer resent for a decision whose then task faulted creates a replacement that runs");
test.todo("K5: a task that commits a changed checkpoint before it waits is still live after seven kills");
test.todo("K6: killed inside answer's commit, the decision is open and no task exists; killed after, both landed");
test.todo("killed after request's commit and before the tool returns, the decision exists once");
