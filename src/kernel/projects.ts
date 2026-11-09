// Human-added projects: the repository a workflow works on. Only a project-wide human adds or edits one.
import * as Effect from "effect/Effect";
import type { Decision, KernelState, Refusal, VerifiedFacts } from "./kernel.ts";
import { validatePath } from "./source-path.ts";

export type Project = {
	readonly id: string;
	readonly revision: number;
	readonly name: string;
	/** Immutable (X1): open proposals keep publishing where they started. */
	readonly remote: string;
	readonly defaultBranch: string;
	/** An image reference by tag; each preparation records the digest it resolved to (X10). */
	readonly checkImage: string;
	/** Repository path of the principles file (X9). */
	readonly principles: string;
	readonly createdAtSequence: number;
};
/** What Engine passes to Effects in each operation, so that Effects never reads Ledger. */
export type ProjectFacts = { readonly id: string; readonly remote: string; readonly defaultBranch: string };
export type ProjectCommand =
	| {
			readonly type: "addProject";
			readonly name: string;
			readonly remote: string;
			readonly defaultBranch: string;
			readonly checkImage: string;
			readonly principles?: string;
	  }
	| {
			readonly type: "editProject";
			readonly project: string;
			readonly expectedRevision: number;
			readonly name: string;
			readonly defaultBranch: string;
			readonly checkImage: string;
			readonly principles: string;
	  };
export const PROJECT_COMMANDS: readonly string[] = ["addProject", "editProject"];

export function projectFacts(project: Project): ProjectFacts {
	return { id: project.id, remote: project.remote, defaultBranch: project.defaultBranch };
}

/** Why the fields are unusable, or undefined. Git's own ref rules are stricter; these refuse what cannot work at all. */
function invalid(p: { name: string; remote?: string; defaultBranch: string; checkImage: string; principles: string }): string | undefined {
	if (p.name.length < 1 || p.name.length > 100) return "name must be 1 to 100 characters";
	if (p.remote !== undefined && (p.remote.trim() !== p.remote || /[\s\0]/.test(p.remote) || p.remote.startsWith("-")))
		return "remote must be a Git URL";
	if (!/^[A-Za-z0-9._/-]+$/.test(p.defaultBranch) || /(^[-/.]|\.\.|\/\/|[/.]$|\.lock$)/.test(p.defaultBranch))
		return "defaultBranch must be a branch name";
	if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(p.checkImage)) return "checkImage must be an image reference";
	try {
		validatePath(p.principles);
	} catch {
		return "principles must be a repository path";
	}
	return undefined;
}

export const changeProject = Effect.fnUntraced(function* (
	state: KernelState,
	c: ProjectCommand,
	facts: VerifiedFacts,
): Effect.fn.Return<Extract<Decision, { outcome: "accepted" }>, Refusal> {
	const projects = state.projects ?? {};
	const current = c.type === "editProject" ? projects[c.project] : undefined;
	if (c.type === "editProject") {
		if (!current || !Object.hasOwn(projects, c.project))
			return yield* Effect.fail<Refusal>({ outcome: "refused", code: "not_found", reason: `${c.project} does not exist.` });
		if (c.expectedRevision !== current.revision)
			return yield* Effect.fail<Refusal>({
				outcome: "refused",
				code: "stale_basis",
				reason: `${c.project} is at revision ${current.revision}, but the edit expected ${c.expectedRevision}.`,
				refs: { project: c.project, current: String(current.revision), expected: String(c.expectedRevision) },
			});
	}
	const fields = { principles: "AGENTS.md", ...c };
	const reason = invalid({ ...fields, ...(current ? {} : { remote: (c as { remote: string }).remote }) });
	if (reason) return yield* Effect.fail<Refusal>({ outcome: "refused", code: "invalid_content", reason });
	if (!facts.ids.project && !current) throw new Error("Ledger did not supply the project identity");
	const project: Project = {
		id: current?.id ?? facts.ids.project!,
		revision: (current?.revision ?? 0) + 1,
		name: fields.name,
		remote: current?.remote ?? (c as { remote: string }).remote,
		defaultBranch: fields.defaultBranch,
		checkImage: fields.checkImage,
		principles: fields.principles,
		createdAtSequence: current?.createdAtSequence ?? facts.sequence,
	};
	return {
		outcome: "accepted",
		result: { project: project.id, revision: project.revision },
		writes: [
			{ type: "project.put", project },
			{ type: "fact.record", fact: facts.ids.fact, command: c.type, refs: { project: project.id } },
		],
		facts: [facts.ids.fact],
	};
});
