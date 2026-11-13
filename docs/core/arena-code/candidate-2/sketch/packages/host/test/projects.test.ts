import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"bind validates project regex absolute workdir and known extension names before creating storage",
);
test.todo(
	"equal bind repeats and changed workdir or extensions returns conflict",
);
test.todo(
	"concurrent equal binds share one open harness and one lifetime process lock",
);
test.todo(
	"startup skips and reports missing or mismatched Project while resent bind completes missing Project",
);
test.todo(
	"startup opens every store with empty registry then installs sets default and resumes",
);
test.todo(
	"separate project stores have separate registries transcripts and decision subjects",
);
test.todo(
	"missing extension is reported while project opens and blocked tasks wait",
);
test.todo(
	"addExtensions is idempotent and startup repairs a crash between Project and install",
);
test.todo(
	"bare and open-role defaults change on next request while workflow and closed roles do not",
);
test.todo("second process is excluded until holder closes or is killed");
