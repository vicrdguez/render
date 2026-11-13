import type { ServerResponse } from "node:http";
import type { WatchHandle } from "@earendil-works/chord/watch";
import type { JsonValue } from "@earendil-works/pi-durable";
import type { EndReason } from "./devices.js";

const HEARTBEAT = 15_000;
const DRAIN = 60_000;

/** Writes a watch as server-sent events: the value first, then its ops. The watch folds what lands while a write
 * waits to drain. `attach` registers the stream's end with its device. */
export function pipe(
	watch: WatchHandle<JsonValue>,
	response: ServerResponse,
	attach: (end: (reason: EndReason) => void) => () => void,
): void {
	let done = false;
	let heartbeat: ReturnType<typeof setTimeout> | undefined;
	const finish = (reason: EndReason | "cut" | "gone") => {
		if (done) return;
		done = true;
		detach();
		clearTimeout(heartbeat);
		void watch.stop();
		if (reason === "cut") response.destroy();
		else if (reason !== "gone")
			response.end(`data: ${JSON.stringify({ end: { reason } })}\n\n`);
	};
	const detach = attach(finish);
	const arm = () => {
		clearTimeout(heartbeat);
		heartbeat = setTimeout(() => {
			if (done) return;
			response.write(":\n\n");
			arm();
		}, HEARTBEAT);
	};
	const write = (frame: object) =>
		new Promise<void>((resolve) => {
			if (done) return resolve();
			arm();
			if (response.write(`data: ${JSON.stringify(frame)}\n\n`)) return resolve();
			const cut = setTimeout(() => finish("cut"), DRAIN);
			const settle = () => {
				clearTimeout(cut);
				resolve();
			};
			response.once("drain", settle);
			response.once("close", settle);
		});

	response.on("close", () => finish("gone"));
	response.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-store",
		"Tau-Protocol": "1",
	});
	void write({ ops: [["r", watch.value]] });
	watch.start(async (call) => {
		if (call.kind === "failed") finish("failed");
		else if (call.ops.length > 0) await write({ ops: call.ops });
	});
	void watch.closed.then((end) => {
		if (end.kind !== "stopped") finish("failed");
	});
}
