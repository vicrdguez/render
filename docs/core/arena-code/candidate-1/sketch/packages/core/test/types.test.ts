/**
 * Invariants that the types hold, checked by `tsc` (npm run typecheck). Each `@ts-expect-error` line must fail to
 * compile; if a change to the types lets one through, tsc reports the unused directive and the build fails.
 * At run time the cases sit in a function nobody calls.
 */

import { test } from "node:test";
import type { ConversationId, Tx, TypedEntry } from "@earendil-works/pi-durable";
import { defineEntry, defineTask } from "@earendil-works/pi-durable";
import { emit, request, type ThenInput } from "tau-core";

const DesignAnswer = defineTask<ThenInput<"approve" | "revise" | "abort">, { phase: "run" }, null>({
	name: "probe.design_answer",
	version: 1,
	initial: () => ({ phase: "run" }),
	phases: { run: async () => {} },
	abort: async () => {},
});

declare const tx: Tx;
declare const conversation: ConversationId;
declare const design: TypedEntry<{ text: string; replies: { annotation: number; text: string }[] }>;
declare const commit: TypedEntry<{ sha: string }>;

export function cases() {
	const draft = { subject: "w1:7:design", title: "Design v2", basis: design, conversation, requestedAt: 0 } as const;

	// The `then` task accepts every choice the request offers.
	void request(tx, { ...draft, choices: ["approve", "revise", "abort"], then: DesignAnswer });
	// Offering fewer choices than the task accepts is fine.
	void request(tx, { ...draft, choices: ["approve", "abort"], then: DesignAnswer });
	// @ts-expect-error The task does not accept "retry" (primitives.md: "TypeScript then checks that the task accepts every choice").
	void request(tx, { ...draft, choices: ["retry", "abort"], then: DesignAnswer });
	// @ts-expect-error A basis must carry `text` (primitives.md, "the basis entry carries `text`").
	void request(tx, { ...draft, basis: commit, choices: ["approve"], then: DesignAnswer });
	// @ts-expect-error A subject is `${extension}:${key}`.
	void request(tx, { ...draft, subject: "design", choices: ["approve"], then: DesignAnswer });
	// @ts-expect-error A decision needs at least one choice.
	void request(tx, { ...draft, choices: [], then: DesignAnswer });

	const Handed = defineEntry<{ text: string; at: number; sha: string }>("w1.handed");
	const Bare = defineEntry<{ at: number }>("w1.bare");
	void emit(tx, Handed, { text: "Approved. Merge with git merge --ff-only S2.", at: 0, sha: "S2" });
	// @ts-expect-error An event carries `text` (primitives.md, "Event").
	void emit(tx, Bare, { at: 0 });
}

test("the type cases compile as marked (tsc checks them)", () => {});
