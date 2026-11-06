// Runs one real implementation pass to its handoff and parks the host after the prepared-X check runtime starts.
// The parent SIGKILLs this process there; nothing here cleans up, by design.
import { accepted, fixture } from "./implementation-engine.ts";

process.env.RENDER_FAULT_BARRIER = "before-prepared-check";
process.env.RENDER_FAULT_COMMAND = "prepared-check:pass:workflow:2:value:1:1";
const t = await fixture();
process.stdout.write(`${JSON.stringify({ event: "data", data: t.f.data, root: t.f.source.root, config: t.f.config })}\n`);
accepted(await t.f.command({ type: "assignTask", slice: "value", delivery: true, packet: t.writer }));
setInterval(() => {}, 1000);
