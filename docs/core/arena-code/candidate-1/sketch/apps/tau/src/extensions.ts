/**
 * The import map: every extension module the server has (docs/core/primitives.md, "How a project gets its
 * extensions"). This is the one list. The host keys it by `extension.name`, so a module's name is never written twice.
 * Static imports, so TypeScript checks each module against the host's contract.
 *
 * Unit 2 ships this list empty (W0). Units 3, 4, and 5 each add one line here and one dependency in package.json.
 */

import type { ExtensionModule } from "tau-core";
import * as w1 from "tau-w1";
import * as w2 from "tau-w2";
import * as websearch from "tau-websearch";

export const modules = [websearch, w2, w1] as const satisfies readonly ExtensionModule[];
