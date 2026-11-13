// Does reading a document family member with `tx.doc(token, key, seed)`, and changing nothing, store a document?
// It decides how `decision(tx, id)` answers an ID that was never requested without writing (sketch: store/decision.ts).
// Also: does `snapshot` see the family member afterwards, and does a read-only commit of an absent key create a revision?
//   After `npm install --ignore-scripts` in ../toolchain: `ln -s ../toolchain/node_modules node_modules`, then
//   `node family-read.ts` from this directory.
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineDocFamily, Harness, MemoryStorage } from "@earendil-works/pi-durable";

const Decisions = defineDocFamily<{ record?: { status: string } }, null>({
	kind: "probe.decision",
	version: 1,
	scope: "session",
	family: true,
	initial: () => ({}),
	checkpointWhen: () => false,
});

const harness = await Harness.open(new MemoryStorage(), { models: createModels(), registry: createRegistry() }, ctx);
console.log("before any read, snapshot:", await harness.snapshot(Decisions, "p:x#1", ctx));
const seen = await harness.commit(async (tx) => JSON.parse(JSON.stringify(await tx.doc(Decisions, "p:x#1", null))), ctx);
console.log("read in a commit, unchanged:", seen);
console.log("after the read, snapshot:", await harness.snapshot(Decisions, "p:x#1", ctx));
await harness.commit(async (tx) => {
	(await tx.doc(Decisions, "p:y#1", null)).record = { status: "open" };
}, ctx);
console.log("after a write of another key, snapshot:", await harness.snapshot(Decisions, "p:y#1", ctx));
await harness.close(ctx);
