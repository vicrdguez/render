/**
 * `bind`, `addExtensions`, and `projects`. Unit 2.
 * Seam: `openHost` on a temporary root with SQLite stores, driven with `host.call` as a client drives it.
 */

import { test } from "node:test";

test.todo(
	"bind makes <root>/projects/<name>/store.sqlite and a lock beside it, writes Project, and returns the project",
);
test.todo("bind with equal fields again returns the project with repeated: true");
test.todo("bind with another workdir or other extensions gives conflict with the stored project");
test.todo("bind with a name that does not match ^[a-z0-9][a-z0-9-]{0,62}$ is bad_request at /project");
test.todo("bind with an extension name the server has no module for is refused and creates nothing");
test.todo("bind with a relative workdir is bad_request at /workdir");
test.todo("a bound project's store has its event log before any extension runs");
test.todo("a new conversation of the bare agent follows the default: coding-tools, then listed non-workflows");
test.todo("a workflow is never in the default (a plain conversation does not carry W1's tools)");
test.todo("addExtensions writes the longer list, installs, and reaches conversations that follow the default (E2)");
test.todo("addExtensions does not reach a conversation with an exact list (H11)");
test.todo("addExtensions with names already listed changes nothing");
test.todo("projects lists each project with its extensions and the listed names the server lacks, as missing");
test.todo("a bind while an inbox feed is open arrives in that feed as an s op under the project's name (W7)");
