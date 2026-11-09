// Runs one real pass to a checked handoff and parks the host after its Watchdog's own check runtime starts.
// The parent SIGKILLs this process there; nothing here cleans up, by design.
import { accepted, fixture } from "./implementation-engine.ts";

process.env.RENDER_FAULT_BARRIER = "before-review-check";
process.env.RENDER_FAULT_COMMAND = "review-check:pass:workflow:3:value:1";
const t = await fixture({ watchdog: ["pass"] });
process.stdout.write(`${JSON.stringify({ event: "data", data: t.f.data, root: t.f.source.root, config: t.f.config })}\n`);
accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
setInterval(() => {}, 1000);
