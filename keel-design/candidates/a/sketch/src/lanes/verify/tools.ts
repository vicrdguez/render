/**
 * Verify lane tools. The scope of a verdict (item and build, or full set at a head) comes from the verifier's
 * expectation in state, never from the arguments.
 */
import type { ToolSpec } from "../../kernel/kernel.ts";
import type { VerifyEvent } from "./lane.ts";
import type { VerdictFinding } from "./state.ts";

export const publishVerdict: ToolSpec<
	{
		readonly outcome: "pass" | "fail";
		readonly text: string;
		readonly findings: readonly Omit<VerdictFinding, "n">[];
		/** Required on a full-set pass. */
		readonly handover: null | { readonly againstIntent: string; readonly residualRisk: string };
	},
	null,
	VerifyEvent
> = {
	name: "publish_verdict",
	description: "Publish your verdict: pass, or fail with at least one block you can show.",
	parameters: undefined,
	roles: ["verifier"],
	lane: "verify",
	gate: "expectation",
	terminate: true,
	event: (args, _facts, self) => ({ kind: "verdict", ...args, self }),
};

export const publishDiagnosis: ToolSpec<
	{ readonly premise: string; readonly test: string; readonly result: string },
	null,
	VerifyEvent
> = {
	name: "publish_diagnosis",
	description: "Report the premise both failed fixes shared, how you tested it, and what the test showed.",
	parameters: undefined,
	roles: ["diagnoser"],
	lane: "verify",
	gate: "expectation",
	terminate: true,
	event: (args, _facts, self) => ({ kind: "diagnosis", ...args, self }),
};

export const verifyTools = [publishVerdict, publishDiagnosis] as const;
