/**
 * The one list of lanes. The kernel's registry, the typed views and the tool list are derived from it.
 */
import type { AnyToolSpec, LaneRegistry } from "../kernel/kernel.ts";
import type { BuildView } from "./build/public.ts";
import type { DesignView } from "./design/public.ts";
import type { QueueView } from "./queue/public.ts";
import type { TrunkView, VerifyView } from "./verify/public.ts";
import { buildLane } from "./build/lane.ts";
import { buildTools } from "./build/tools.ts";
import { designLane } from "./design/lane.ts";
import { designTools } from "./design/tools.ts";
import { queueLane } from "./queue/lane.ts";
import { queueTools } from "./queue/tools.ts";
import { verifyLane } from "./verify/lane.ts";
import { trunkLane } from "./verify/trunk.ts";
import { verifyTools } from "./verify/tools.ts";

declare module "../kernel/lane.ts" {
	interface LaneViews {
		design: DesignView;
		build: BuildView;
		verify: VerifyView;
		queue: QueueView;
		trunk: TrunkView;
	}
}

export const LANES = {
	design: designLane,
	build: buildLane,
	verify: verifyLane,
	queue: queueLane,
	trunk: trunkLane,
} as unknown as LaneRegistry;

export const TOOLS: readonly AnyToolSpec[] = [
	...designTools,
	...buildTools,
	...verifyTools,
	...queueTools,
] as never;
