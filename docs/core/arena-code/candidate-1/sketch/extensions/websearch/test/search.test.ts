/**
 * `websearch` (docs/core/extensions.md, "Web search"). Unit 3.
 * Seams: a real host (`tau-core/host`) on a temporary root with the faux model; the provider's HTTP API faked on
 * port 0, if Webfox can be pointed at it (design.md, open questions).
 */

import { test } from "node:test";

test.todo("bind with websearch; the bare agent is offered web_search; a closed role is not (E1)");
test.todo("adding websearch to a project reaches a running bare agent from its next model request (E2)");
test.todo("setOptions stores the provider and the key; options and setOptions return the key as true (E4)");
test.todo("web_search with no options set returns an error result that says so, and does not throw");
test.todo("after a search, no entry, event, section, error, or log of the conversation holds the key (E4)");
test.todo("a provider error does not carry the key into the result");
test.todo("a server that no longer has websearch: the project opens, missing lists it, its options stay (E3)");
