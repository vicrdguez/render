import type { TestContext } from "node:test";
import { Harness } from "@earendil-works/pi-durable";
export declare const context: import("@earendil-works/chord/context").Context;
export declare function fixture(t: TestContext): Promise<Harness>;
