import type { RequestListener } from "node:http";
import { type Host } from "./calls.js";
/** The HTTP side of the server: one POST per call, and an event stream for a watch. */
export declare function handler(host: Host, allowedHosts: readonly string[]): RequestListener;
