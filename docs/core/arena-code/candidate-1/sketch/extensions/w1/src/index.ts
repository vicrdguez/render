/**
 * W1, design to merge (docs/core/workflows.md, "W1"; docs/core/walk.md, "W1, design to merge"). Unit 5. A sample for
 * testing the core, not for real use.
 *
 * The host creates D, the designer, with `entry`. `w1.prepare` creates I and `publish_build` creates R, both with
 * `role()`. Every W1 task but `w1.ensure_handoff` belongs to D and is `background`.
 */

import type { Tx } from "@earendil-works/pi-durable";
import { modelRef } from "tau-kit";
import { W1Options } from "./options.ts";
import { designer } from "./roles.ts";

export { extension } from "./extension.ts";

export const options = W1Options;

// Copied from docs/core/kit.md, "W1's roles on paper". The host adds the project's working directory as `cwd`.
export const entry = async (tx: Tx) => designer(modelRef((await W1Options.read(tx)).designer));
