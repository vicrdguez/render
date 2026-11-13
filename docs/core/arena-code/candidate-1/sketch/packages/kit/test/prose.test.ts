/**
 * `prose()` (docs/core/prose.md). Unit 4. Seam: Markdown files in a temporary directory.
 */

import { test } from "node:test";

test.todo("a file whose slots equal the declared names loads, and a call fills each slot");
test.todo("a slot in the file that is not declared throws when prose() is called, not when the result is used");
test.todo("a declared name that the file lacks throws at load");
test.todo("a missing file throws at load");
test.todo("substitution is one pass: a value that contains {{x}} stays as text");
test.todo("backticks and Markdown pass through unchanged");
