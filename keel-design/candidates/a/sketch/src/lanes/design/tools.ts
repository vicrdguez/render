/**
 * Design lane tools. Each is a `ToolSpec`; the kernel wraps it (receipt, gate, replay safety, sequential).
 * No parameter carries a commit hash, a decision ID or a conversation ID.
 */
import type { ToolSpec } from "../../kernel/kernel.ts";
import type { CandidateId, GroundReport, Reply, Rider } from "./state.ts";
import type { DesignEvent, Frame, MandateDraft } from "./lane.ts";

type GroundArgs = GroundReport & {
	/** Required unless the shape is `sets_precedent` or `finding`: the small Mandate the prompt amounts to. */
	readonly mandate: MandateDraft | null;
	/** Required for `sets_precedent` without ambiguities. */
	readonly frame: Frame | null;
};

/**
 * `adopt` gate: the first call in a conversation `create` made turns it into a piece of work. Later calls need the
 * grounding expectation (queue-seeded work).
 */
export const ground: ToolSpec<GroundArgs, null, DesignEvent> = {
	name: "ground",
	description: "Report what Ground found and how this work should proceed.",
	parameters: undefined /* obj({ shape: oneOf(...), report: str(), gaps: arr(str()), ... }) */,
	roles: ["designer"],
	lane: "design",
	gate: "adopt",
	terminate: true,
	event: (args, _facts, self) => ({
		kind: "grounded",
		report: args,
		mandate: args.mandate,
		frame: args.frame,
		self,
	}),
};

export const frameArena: ToolSpec<Frame & { readonly replies: readonly Reply[] }, null, DesignEvent> = {
	name: "frame_arena",
	description: "Frame the design question every arena candidate will answer, with the judge's rubric.",
	parameters: undefined,
	roles: ["designer"],
	lane: "design",
	gate: "expectation",
	terminate: true,
	event: (args, _facts, self) => ({ kind: "framed", frame: args, replies: args.replies, self }),
};

export const publishMandate: ToolSpec<
	{
		readonly draft: MandateDraft;
		readonly base: CandidateId | null;
		readonly grafts: readonly { readonly label: string; readonly from: CandidateId }[];
		readonly riders: readonly Pick<Rider, "text" | "origin" | "from">[];
		readonly replies: readonly Reply[];
	},
	null,
	DesignEvent
> = {
	name: "publish_mandate",
	description: "Publish the Mandate for this stage: synthesis draft, answer to the challenger, revision, or proposal.",
	parameters: undefined,
	roles: ["designer"],
	lane: "design",
	gate: "expectation",
	terminate: true,
	event: (args, _facts, self) => ({ kind: "published", ...args, self }),
};

/** Accepted only when `self.ownerInput`: the run was started by the owner's own message in this conversation. */
export const cancelWork: ToolSpec<{ readonly reason: string }, null, DesignEvent> = {
	name: "cancel_work",
	description: "Cancel this piece of work, when the owner has asked you to.",
	parameters: undefined,
	roles: ["designer"],
	lane: "design",
	gate: "binding",
	terminate: true,
	event: (args, _facts, self) => ({ kind: "cancel_requested", reason: args.reason, self }),
};

export const designTools = [ground, frameArena, publishMandate, cancelWork] as const;
