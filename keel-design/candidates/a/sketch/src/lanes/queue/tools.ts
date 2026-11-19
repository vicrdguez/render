/**
 * Queue tools. `file_finding` is the one intake for agents; it records the owner as the source when the run was
 * started by the owner's own message (`self.ownerInput`), so the owner can mark a finding from any conversation.
 */
import type { ToolSpec } from "../../kernel/kernel.ts";
import type { Sha } from "../../repo/index.ts";
import type { QueueEvent } from "./lane.ts";
import type { FindingRef } from "./public.ts";
import type { Investigation } from "./state.ts";

export const fileFinding: ToolSpec<
	{
		readonly text: string;
		readonly report: string | null;
		/** Mandate node labels the finding concerns, if any. */
		readonly nodes: readonly string[];
		readonly edgeCase: null | { readonly failure: string; readonly likelihood: string; readonly cost: string };
		readonly blocking: boolean;
	},
	Sha | null,
	QueueEvent
> = {
	name: "file_finding",
	description:
		"File something you should not decide alone: a gap no approved reference settles, something outside the Mandate, a Mandate that needs to change, or an unlikely edge case.",
	parameters: undefined,
	roles: ["designer", "coordinator", "worker", "verifier", "diagnoser", "investigator"],
	lane: "queue",
	gate: "binding",
	/** A blocking finding holds the filer's item and ends its run. */
	terminate: (args) => args.blocking,
	observe: async (io, self) => {
		// HEAD of self.cwd when it is a git checkout, else null
		throw new Error("not implemented");
	},
	event: (args, sha, self) => ({ kind: "agent_filed", ...args, sha, self }),
};

export const reportInvestigation: ToolSpec<
	{ readonly finding: FindingRef; readonly investigation: Investigation; readonly batchWith: readonly FindingRef[] },
	null,
	QueueEvent
> = {
	name: "report_investigation",
	description: "Classify a finding after reproducing or measuring it, and say which findings take one answer with it.",
	parameters: undefined,
	roles: ["investigator"],
	lane: "queue",
	gate: "expectation",
	terminate: false,
	event: (args, _facts, self) => ({ kind: "investigated", ...args, self }),
};

export const queueTools = [fileFinding, reportInvestigation] as const;
