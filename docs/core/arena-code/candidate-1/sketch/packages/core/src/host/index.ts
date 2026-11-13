/**
 * `tau-core/host`: what the composition root and the tests use. Not for an extension's code: biome.json refuses this
 * import in `extensions/<name>/src/` and `packages/kit/src/`. An extension's tests use it to drive a real host with the
 * client's calls.
 */

export { DEFAULT_PORT, main } from "../cli.ts";
export type { CallBody, CallName, CallResult } from "./calls.ts";
export { callNames } from "./calls.ts";
export type { DeviceRecord } from "./devices.ts";
export { deviceId } from "./devices.ts";
export type { EndReason, Feed, Frame, Op, Path } from "./feed.ts";
export type { Host, HostConfig, Reply } from "./host.ts";
export { openHost } from "./host.ts";
export type { Refusal, RefusalCode } from "./refusals.ts";
