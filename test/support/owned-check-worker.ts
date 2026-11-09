import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import { admin, packet, roleFixture } from "./roles.ts";

const config = JSON.parse(process.argv[2]!);
const f = await roleFixture(new Engine({ ownedChecks: config }));
process.stdout.write(`${JSON.stringify({ event: "data", data: f.data })}\n`);
process.on("message", async (message) => {
	if (message === "snapshot") {
		const snapshot = f.ledger.snapshot(admin);
		const history = await Effect.runPromise(f.ledger.artifact(admin, { export: { workflow: "workflow:3" } }));
		process.stdout.write(`${JSON.stringify({ event: "snapshot", snapshot, history })}\n`);
	}
	if (message === "cancel") {
		const result = await f.command({ type: "cancelWork", assignment: "assignment:5", generation: 1, attempt: "attempt:5" }, admin);
		process.stdout.write(`${JSON.stringify({ event: "canceled", result })}\n`);
	}
});
await f.command({ type: "assignTask", slice: "crash:owned", delivery: true, packet: packet({ execution: "linux-writer" }) });
setInterval(() => {}, 1000);
