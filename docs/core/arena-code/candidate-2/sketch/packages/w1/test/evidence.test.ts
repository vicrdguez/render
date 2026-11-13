import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"revised design requires reply to every prior annotation before publish",
);
test.todo(
	"design approval annotations go to implementer and publish_build refuses missing replies",
);
test.todo(
	"build review and merge basis name one approved design one build one review and identical SHA",
);
test.todo(
	"reviewer reads pinned Git objects not worktree and cannot choose candidate SHA",
);
test.todo(
	"publish_build is sequential and model-only so nested tool callers cannot overlap it",
);
test.todo(
	"moved branch head blocks handoff requests stuck retry abort and returns new head to review",
);
test.todo(
	"handoff emits merge --ff-only exact SHA but never merges and lists unacted annotations",
);
test.todo(
	"tools and tasks check cancellation stage candidate and expected decision rather than transcript",
);
