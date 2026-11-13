/**
 * `options`, `setOptions`, and the options check of `create` (host.md, "Options per project"). Unit 2.
 * Seam: `host.call` on a temporary root, with a stand-in module whose `options` contract is written by hand: the core's
 * tests cannot import the kit.
 */

import { test } from "node:test";

test.todo("setOptions stores a patch while a required key is still unset (H2)");
test.todo("an unknown model is bad_options at its JSON pointer, keyword format; nothing is stored");
test.todo("an unknown key is bad_options at its pointer, keyword additionalProperties");
test.todo("null removes a key, which goes back to its default; only set keys are stored");
test.todo("the same patch twice gives the same value");
test.todo("options lists each listed extension with options: schema, set keys, and remaining errors, missing included");
test.todo("a set secret is returned as true, never its value, by options and by setOptions (E4)");
test.todo("setOptions for an extension the project does not list, or one without options, is refused");
test.todo("create of a workflow refuses with options_invalid and the errors while a required key is unset (H3)");
test.todo(
	"create, once the options are set, runs entry(tx) after the table write and the first request uses the model",
);
