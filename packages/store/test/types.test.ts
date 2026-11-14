import { test } from "node:test";
import type {
	ConversationId,
	Tx,
	TypedEntry,
} from "@earendil-works/pi-durable";
import { defineEntry, defineTask } from "@earendil-works/pi-durable";
import { type DecisionInput, emit, request } from "tau-store";

// tsc checks these cases. An `@ts-expect-error` line that compiles fails the build.
const DesignAnswer = defineTask<
	DecisionInput<"approve" | "revise" | "abort">,
	{ phase: "run" },
	null
>({
	name: "types.design_answer",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: { run: async () => {} },
	abort: async () => {},
});
declare const tx: Tx;
declare const conversation: ConversationId;
declare const design: TypedEntry<{ text: string; replies: string[] }>;
declare const commit: TypedEntry<{ sha: string }>;

export function cases() {
	const draft = {
		subject: "w1:7:design",
		title: "Design v2",
		basis: design,
		conversation,
		requestedAt: 0,
	} as const;
	void request(tx, {
		...draft,
		choices: ["approve", "revise", "abort"],
		then: DesignAnswer,
	});
	// A task that accepts more choices than the request offers.
	void request(tx, { ...draft, choices: ["approve"], then: DesignAnswer });
	void request(tx, {
		...draft,
		choices: ["approve", "abort"],
		then: DesignAnswer,
	});
	void request(tx, {
		...draft,
		choices: ["approve", "retry"],
		// @ts-expect-error The then task does not accept "retry".
		then: DesignAnswer,
	});
	void request(tx, {
		...draft,
		choices: ["retry", "abort"],
		// @ts-expect-error The then task does not accept "retry".
		then: DesignAnswer,
	});
	void request(tx, {
		...draft,
		// @ts-expect-error A basis entry carries text.
		basis: commit,
		choices: ["approve", "revise", "abort"],
		then: DesignAnswer,
	});
	// @ts-expect-error A decision offers at least one choice.
	void request(tx, { ...draft, choices: [], then: DesignAnswer });
	const descriptor = {
		definition: {
			name: "types.design_answer",
			initial: (_input: DecisionInput<"retry">) => ({ phase: "run" }),
		},
	};
	// @ts-expect-error The then task is a pi-durable task, not only a name and an initial.
	void request(tx, { ...draft, choices: ["retry"], then: descriptor });
	const Wrong = defineTask<{ payload: string }, { phase: "run" }, null>({
		name: "types.wrong",
		version: 1,
		initial: () => ({ phase: "run" }),
		phases: { run: async () => {} },
		abort: async () => {},
	});
	// @ts-expect-error The then task takes a decision and a choice.
	void request(tx, { ...draft, choices: ["approve"], then: Wrong });

	const Handed = defineEntry<{ text: string; at: number; sha: string }>(
		"w1.handed",
	);
	const Bare = defineEntry<{ at: number }>("w1.bare");
	void emit(tx, Handed, { text: "Approved.", at: 0, sha: "S2" });
	// @ts-expect-error An event carries text.
	void emit(tx, Bare, { at: 0 });
}

test("the type cases compile as marked", () => {});
