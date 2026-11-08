import type { Command } from "../src/kernel/kernel.ts";

// Known commands must carry their own required fields, even when an unknown wire command can be refused at runtime.
const known: Command = { type: "createWorkflow", title: "A workflow" };
// @ts-expect-error a known command without its required title is not a Kernel command
const incomplete: Command = { type: "createWorkflow" };
// @ts-expect-error an arbitrary string must go through unknown-command classification
const unclassified: Command = { type: "not-a-render-command" };
void [known, incomplete, unclassified];
