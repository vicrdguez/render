/**
 * W1, row by row (docs/core/walk.md, "W1, design to merge"). Unit 5.
 * Seam: a real host (`tau-core/host`) on a temporary root, the faux model calling W1's tools, and a Git repository in a
 * temporary directory as the project's workdir.
 */

import { test } from "node:test";

test.todo("row 0: create gives D the designer's role with the options' model and the project's workdir as cwd");
test.todo("rows 2 and 3: publish_design opens a decision on V1; revise with two annotations on passages is stored");
test.todo("row 4: the designer's next input quotes each annotation with its passage, and its model is set first");
test.todo("row 5: publish_design refuses until each annotation of the last answer has a reply");
test.todo("row 6: a second device answering the superseded decision gets conflict and then sees A2");
test.todo(
	"rows 8 to 10: the plan is stored before the worktree; I is created in one commit and gets input in the next",
);
test.todo(
	"an outside effect twice: a worktree at the path with another branch opens a stuck decision, deletes nothing",
);
test.todo("rows 11 to 16: publish_build reads the head SHA itself; the reviewer reads S1 from Git objects, not files");
test.todo("publish_build is sequential and refuses nested callers (E6)");
test.todo("row 17: a pass opens the merge decision on M, which names V2, S2, B2, and R2");
test.todo("row 19: handoff checks the branch head is still S2; if it moved, nothing is handed over and stuck opens");
test.todo("rows E1 to E3: a run that ends without a handoff opens stuck; retry submits to that conversation");
test.todo("rows X1 to X6: abort on any decision cancels in one commit before any agent is stopped");
test.todo("the reviewer cannot search even when the project has websearch (a closed role)");
