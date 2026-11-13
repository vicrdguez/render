/**
 * `options()` (docs/core/kit.md). Unit 3.
 * Seam: pi-durable's `MemoryStorage` and commits made by the test; the host's check is not the kit's and is tested in
 * tau-core with a hand-written contract.
 */

import { test } from "node:test";

test.todo("one call defines one session document named <extension>.options that holds the set keys and nothing else");
test.todo("get returns the set keys; set replaces them; a key not in value is gone after set");
test.todo("read fills the schema's defaults under the set keys and returns the value");
test.todo("read throws when a key with no default is unset, or a stored value no longer fits the schema");
test.todo("two projects' stores hold their own values for the same extension");
test.todo("the returned object fits the host's contract: schema, get, set (checked by tsc in src/options.ts)");
