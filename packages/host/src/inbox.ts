import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import type { Op } from "@earendil-works/chord/delta";
import type { JsonValue } from "@earendil-works/chord/json";
import type {
	WatchCall,
	WatchEnd,
	WatchHandle,
} from "@earendil-works/chord/watch";
import { type OpenDecisions, watchOpen } from "tau-store/host";
import type { OpenProject, Projects } from "./projects.js";

type Listener = (
	call: WatchCall<JsonValue>,
	c: typeof context,
) => Promise<void>;

const under = (project: string, op: Op): Op =>
	op[0] === "r"
		? ["s", [project], op[1]]
		: ([op[0], [project, ...op[1]], ...op.slice(2)] as unknown as Op);

/** The open lists of every project, each under its project's name, as one watch. A project that a later `bind`
 * opens arrives as an `s` op. One store's failed watch ends the whole watch as failed. */
export async function watchInbox(
	projects: Projects,
): Promise<WatchHandle<JsonValue>> {
	const watches = new Map<string, WatchHandle<OpenDecisions>>();
	for (const open of projects.all())
		watches.set(open.name, await watchOpen(open.store, context));
	let value: Record<string, JsonValue> = Object.fromEntries(
		[...watches].map(([name, watch]) => [name, watch.value]),
	);
	let listener: Listener | undefined;
	let queue: Promise<void> = Promise.resolve();
	let ended = false;
	let unjoin = () => {};
	let settle: (end: WatchEnd) => void = () => {};
	const closed = new Promise<WatchEnd>((resolve) => {
		settle = resolve;
	});
	const end = (result: WatchEnd) => {
		if (ended) return;
		ended = true;
		unjoin();
		for (const watch of watches.values()) void watch.stop();
		settle(result);
	};
	const push = (ops: Op[]) => {
		const next = queue.then(() =>
			ended || listener === undefined
				? undefined
				: listener({ kind: "value", value, ops, retired: false }, context),
		);
		queue = next.catch(() => {});
		return next;
	};
	const follow = (project: string, watch: WatchHandle<OpenDecisions>) => {
		watch.start(async (call) => {
			if (call.kind === "failed")
				return end({ kind: "failed", error: call.error });
			if (call.ops.length === 0) return;
			value = { ...value, [project]: call.value };
			await push(call.ops.map((op) => under(project, op)));
		});
		void watch.closed.then((result) => {
			if (result.kind !== "stopped") end({ kind: "failed", error: result });
		});
	};
	const join = async (open: OpenProject) => {
		if (ended) return;
		const watch = await watchOpen(open.store, context);
		if (ended) return void watch.stop();
		watches.set(open.name, watch);
		value = { ...value, [open.name]: watch.value };
		await push([["s", [open.name], watch.value]]);
		follow(open.name, watch);
	};
	return {
		get value() {
			return value;
		},
		closed,
		start(next) {
			listener = next;
			for (const [project, watch] of watches) follow(project, watch);
			unjoin = projects.onBind((open) => {
				join(open).catch((error: unknown) => end({ kind: "failed", error }));
			});
		},
		stop: async () => {
			end({ kind: "stopped" });
			return closed;
		},
	};
}
