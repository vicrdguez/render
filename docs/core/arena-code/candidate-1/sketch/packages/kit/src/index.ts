/**
 * `tau-kit`: helpers for extension authors (docs/core/kit.md). The core never imports it, and an extension may skip it.
 *
 * A helper enters with the first build unit that calls it (kit.md, "What enters the kit"):
 * - `options()`: unit 3, web search keeps its provider and key with it.
 * - `modelRef()` and `prose()`: unit 4, W2's `entry` and its agent's instructions.
 * - `role()`: unit 5, W1 rows 9 and 11.
 */

export { modelRef } from "./model-ref.ts";
export { type Options, options } from "./options.ts";
export { type Prose, prose } from "./prose.ts";
export { type RoleSettings, role } from "./role.ts";
