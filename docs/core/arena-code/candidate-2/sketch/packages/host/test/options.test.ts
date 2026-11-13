import { test } from "node:test";

// Failure list first. Replace each TODO with a failing test BEFORE filling the behavior stub.
test.todo(
	"patch stores only explicit keys and ignores missing errors but not unknown keys or wrong types",
);
test.todo(
	"null removes an option and later schema defaults reach only unset values",
);
test.todo(
	"model format checks server availability and bad_options carries JSON pointer errors",
);
test.todo(
	"create checks workflow options including required keys but ignores unset tool-extension options",
);
test.todo("bare create needs model and workflow create refuses not_a_workflow");
test.todo(
	"entry reads options in create commit and project cwd is always applied",
);
test.todo(
	"secret values never appear in options setOptions refusal details or logs",
);
