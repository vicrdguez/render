// Runs one real pass through a passing Watchdog round and parks the host at the named integration barrier, keyed by
// the pass (Engine cuts) or the proposal (Effects cuts). The parent SIGKILLs this process there.
import { accepted, fixture } from "./implementation-engine.ts";

process.env.RENDER_FAULT_BARRIER = process.argv[2];
process.env.RENDER_FAULT_COMMAND = process.argv[3];
const t = await fixture({ watchdog: ["pass"] });
process.stdout.write(`${JSON.stringify({ event: "data", data: t.f.data, root: t.f.source.root, config: t.f.config })}\n`);
accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
setInterval(() => {}, 1000);
