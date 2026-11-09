// The launcher's playbook table and the complete, pinned packets it assigns. Engine's reconcile is the only production
// caller: lint refuses an `assignTask` built anywhere else in `src` (L7).
import { createHash } from "node:crypto";
import type { Source } from "../effects/source.ts";
import type { EngineSettingsRevision } from "../kernel/engine-settings.ts";
import { cleared, type IntakeManifest, type Intakes } from "../kernel/intake.ts";
import type { WorkflowView } from "../kernel/kernel.ts";
import type { Role, RoleAssignment, RolePacket } from "../kernel/roles.ts";
import { validatePath } from "../kernel/source-path.ts";
import type { VerificationSelection } from "../kernel/verification.ts";
import { VERIFICATION_AUTHORING } from "./catalog.ts";
import { packetSettings } from "./settings.ts";

export type Shape = "investigation" | "bug" | "performance" | "change" | "design" | "experiment";
type Step =
	| { readonly at: "message"; readonly role: "coordinator"; readonly requests: readonly ["fidelity"] }
	| { readonly at: "intake-accepted"; readonly role: "implementer"; readonly requests: readonly ["standards", "contracts", "watchdog"] };
const MESSAGE: Step = { at: "message", role: "coordinator", requests: ["fidelity"] };
const IMPLEMENT: Step = { at: "intake-accepted", role: "implementer", requests: ["standards", "contracts", "watchdog"] };
export const PLAYBOOKS: Readonly<Record<Shape, readonly Step[] | "unavailable">> = {
	investigation: [MESSAGE],
	bug: [MESSAGE, IMPLEMENT],
	performance: [MESSAGE, IMPLEMENT],
	change: [MESSAGE, IMPLEMENT],
	design: [MESSAGE, IMPLEMENT],
	experiment: "unavailable",
};

/** The implementer's Linux limits at the Sandboxes caps; the project names the image. */
export const LINUX_WRITER = { exclusions: [".git"], maxBytes: 64 * 1024 * 1024, maxEntries: 10000, timeoutMs: 5 * 60 * 1000 };
/** What an implementation pass's checks need from its profile: a configured owned check or a launched profile document. */
export type PassCheck = { readonly profile: Omit<typeof LINUX_WRITER, "timeoutMs">; readonly timeoutMs: number };

/** Engine's built-in role instructions (X9): settings choose models and budgets, not prose. */
const INSTRUCTIONS: Partial<Record<Role, string>> = {
	coordinator:
		"You coordinate this workflow from the human's messages. Read the repository at your pinned commit with list_source, read_source and grep_source; each read_source result is retained and citable by its source ref. Propose Ground with checkpoint {type:'saveDraft',document:'ground',content:<JSON {schema:1,shape:{value:'investigation'|'bug'|'performance'|'change'|'design',origin:'classifier',confirmed:false},goal,constraints:[],clarifications:[],donePredicate,facts:[],approvedSources:[source refs]}>}. The human confirms Ground by saving it; until then checkpoints and intake refuse. Then follow the intake or checkpoint instructions, citing the confirmed human Ground, and request the fidelity review. Only the human accepts the intake.",
	challenger: "Review exactly the inputs you were given, independently, and submit your report.",
	implementer: "Implement the accepted Contract in your owned Linux workspace and follow the implementation instructions.",
	"audit-standards": "Audit the exact source A against the project principles and standards; report findings only.",
	"audit-contracts": "Audit the exact source A against the accepted Contract's obligations; report findings only.",
	watchdog: "Review the exact prepared X against T independently and submit a bound verdict.",
};

/** The host documents a launched packet pins, by document name; Engine retains each under `host/` before it assigns. */
export function hostDocumentTexts(
	roles: readonly Role[],
	principles: string,
	policy: unknown,
	profile: Record<string, string>,
): Record<string, string> {
	return {
		"host/principles": principles,
		"host/policy": JSON.stringify(policy),
		...Object.fromEntries(roles.map((r) => [`host/instructions/${r}`, INSTRUCTIONS[r] ?? `Role ${r}.`])),
		...Object.fromEntries(Object.entries(profile).map(([name, text]) => [`host/profile/${name}`, text])),
	};
}
/** A project's principles file at the pinned commit, or an explicit statement that it has none (X9). */
export function principlesText(source: Source, path: string): string {
	const entry = source.entries.find((e) => e.path === path && e.mode !== "120000");
	return entry ? Buffer.from(entry.content, "base64").toString("utf8") : `No principle statements at ${path}.`;
}
export const coordinatorProfile = (project: string, commit: string) =>
	JSON.stringify({ schema: 1, kind: "coordinator-source", project, commit });
export const READ_ONLY_PROFILE = JSON.stringify({ schema: 1, kind: "read-only" });
export const LINUX_WRITER_PROFILE = JSON.stringify({ schema: 1, kind: "linux-writer", ...LINUX_WRITER });
/** The commit a launched coordinator reads, from its pinned profile document. */
export function pinnedSource(text: string): { project: string; commit: string } | undefined {
	try {
		const p = JSON.parse(text) as { kind?: unknown; project?: unknown; commit?: unknown };
		return p.kind === "coordinator-source" && typeof p.project === "string" && typeof p.commit === "string"
			? { project: p.project, commit: p.commit }
			: undefined;
	} catch {
		return undefined;
	}
}
export function launchedCheck(text: string): PassCheck | undefined {
	try {
		const p = JSON.parse(text) as Record<string, unknown>;
		if (p.kind !== "linux-writer") return undefined;
		const { exclusions, maxBytes, maxEntries, timeoutMs } = p as typeof LINUX_WRITER;
		return { profile: { exclusions, maxBytes, maxEntries }, timeoutMs };
	} catch {
		return undefined;
	}
}

/** Why fetching the project failed, as a launch blocker: a default branch with no commit is an empty repository. */
export function fetchFailure(error: unknown, branch: string): string {
	const message = error instanceof Error ? error.message : String(error);
	return /couldn't find remote ref/.test(message)
		? `project_repository_empty: ${branch} has no commit; push a first commit to ${branch}, or edit the project's default branch to one that has a commit`
		: `project_fetch_failed: ${message}`;
}
/** The workflow's launched coordinator: the one whose Slice is the workflow. */
export function launchedCoordinator(assignments: readonly RoleAssignment[], workflow: string): RoleAssignment | undefined {
	return assignments.find(
		(a) => a.workflow === workflow && a.slice === workflow && a.packet.role === "coordinator" && !a.packet.investigation,
	);
}
/** Workflows whose MESSAGE step holds: an accepted human message and no coordinator of any kind yet. */
export function awaitingCoordinator(workflows: readonly WorkflowView[], assignments: readonly RoleAssignment[]): string[] {
	return workflows
		.filter((w) => w.messages.count > 0 && !assignments.some((a) => a.workflow === w.workflow && a.packet.role === "coordinator"))
		.map((w) => w.workflow);
}
/**
 * Accepted Slices whose IMPLEMENT step holds: a launched workflow, a shape whose playbook implements, no delivery owner
 * and every dependency cleared by recorded qualifying integration.
 */
export function readySlices(
	w: WorkflowView,
	assignments: readonly RoleAssignment[],
): { slice: string; contract: string; manifest: IntakeManifest }[] {
	if (!launchedCoordinator(assignments, w.workflow)) return [];
	const intakes: Intakes = w.intakes;
	return intakes.slices.flatMap((s) => {
		const manifest = intakes.drafts.find((d) => d.id === s.intake)?.manifest;
		const steps = manifest ? PLAYBOOKS[manifest.shape] : "unavailable";
		if (
			s.status !== "accepted" ||
			!manifest ||
			steps === "unavailable" ||
			!steps.some((step) => step.at === "intake-accepted") ||
			assignments.some((a) => a.workflow === w.workflow && a.slice === s.id && a.delivery) ||
			intakes.dependencies.some((e) => e.slice === s.id && !cleared(e, w.integrated, []))
		)
			return [];
		return [{ slice: s.id, contract: s.contract, manifest }];
	});
}
/**
 * The Contract's verification selection: the rows its checks map to for this Slice, the mandatory rows, and the cited
 * catalog's repository path and digest at the pinned commit. With no catalog (`null`), the repository has no asset yet:
 * the writer authors the recommended one, with these rows, through the bootstrap path. Undefined when the cited catalog
 * is not a retained source read.
 */
export function verificationSelection(
	manifest: IntakeManifest,
	slice: string,
	contract: string,
	catalog: { document: string; text: string } | null | undefined,
	repository: string,
	commit: string,
): VerificationSelection | undefined {
	if (catalog !== null && !catalog?.document.startsWith("source/")) return undefined;
	const path = catalog ? catalog.document.slice("source/".length) : VERIFICATION_AUTHORING.recommended.asset;
	validatePath(path);
	const obligations = manifest.slices.find((s) => s.id === slice)?.obligations ?? [];
	const rowsOf = (kinds: readonly string[]) =>
		manifest.mapping
			.filter((m) => m.slice === slice && obligations.some((o) => o.id === m.obligation && kinds.includes(o.kind)))
			.flatMap((m) => m.checks)
			.flatMap((id) => manifest.checks.filter((c) => c.id === id && (c.kind === "executed" || c.kind === "journey")).map((c) => c.row));
	const behavioralRows = [...new Set(rowsOf(["behavior"]))];
	if (!behavioralRows.length) return undefined;
	return {
		repository,
		commit,
		path,
		digest: createHash("sha256")
			.update(catalog?.text ?? "")
			.digest("hex"),
		contract,
		rows: [...new Set([...rowsOf(["behavior", "architecture", "record", "manual"]), "full-suite", "typecheck", "lint"])],
		behavioralRows,
		receipts: [],
	};
}

type Pinned = { readonly settings: EngineSettingsRevision; readonly documents: Readonly<Record<string, string>> };
function rolePacket(role: Role, p: Pinned, profile: string, overrides: Partial<RolePacket> = {}): RolePacket {
	const { settingsRevision, ...settings } = packetSettings(p.settings, role);
	return {
		role,
		inputs: [],
		principles: p.documents["host/principles"]!,
		instructions: p.documents[`host/instructions/${role}`]!,
		policy: p.documents["host/policy"]!,
		profile: p.documents[`host/profile/${profile}`]!,
		execution: "read-only",
		...settings,
		settingsRevision,
		expectedOutput: "Own bounded report",
		submission: "submit_role_result",
		requests: [],
		...overrides,
	};
}
export const COORDINATOR_ROLES: readonly Role[] = ["coordinator", "challenger"];
export const IMPLEMENTER_ROLES: readonly Role[] = ["implementer", "audit-standards", "audit-contracts", "watchdog"];
/** MESSAGE: the workflow's coordinator, read-only, owning the workflow Slice, with one fidelity challenger request. */
export function coordinatorCommand(workflow: string, p: Pinned) {
	return {
		type: "assignTask",
		slice: workflow,
		delivery: false,
		packet: rolePacket("coordinator", p, "coordinator", {
			expectedOutput: "Ground proposal, then an intake for human acceptance",
			requests: [{ key: "fidelity", packet: rolePacket("challenger", p, "read-only") }],
		}),
	};
}
/** IMPLEMENT: one delivery implementer per ready Slice, with its Audit axes and Watchdog as requests. */
export function implementerCommand(slice: string, contract: string, verification: VerificationSelection, p: Pinned) {
	const reviewer = (role: Role) => rolePacket(role, p, "read-only");
	return {
		type: "assignTask",
		slice,
		delivery: true,
		packet: rolePacket("implementer", p, "linux-writer", {
			inputs: [contract],
			execution: "linux-writer",
			verification,
			expectedOutput: "Sealed implementation handoff",
			requests: [
				{ key: "standards", packet: reviewer("audit-standards") },
				{ key: "contracts", packet: reviewer("audit-contracts") },
				{ key: "watchdog", packet: reviewer("watchdog") },
			],
		}),
	};
}

type Refused = { status: "refused"; code: string; reason: string };
const refused = (code: string, reason: string): Refused => ({ status: "refused", code, reason });
const SOURCE_BYTES = 1024 * 1024;
const LISTED = 2000;
const MATCHES = 200;
function textOf(entry: Source["entries"][number]): string | undefined {
	if (entry.mode === "120000") return undefined;
	const bytes = Buffer.from(entry.content, "base64");
	if (bytes.length > SOURCE_BYTES || bytes.includes(0)) return undefined;
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
}
/** X5 `read_source`: one literal text file of the pinned commit; never a symlink target or a path outside the tree. */
export function readSource(source: Source, path: string): { status: "accepted"; text: string } | Refused {
	try {
		validatePath(path);
	} catch {
		return refused("invalid_path", "Name one repository path relative to the tree root.");
	}
	const entry = source.entries.find((e) => e.path === path);
	if (!entry) return refused("not_found", `${path} is not a file at ${source.commit}.`);
	if (entry.mode === "120000") return refused("symlink", `${path} is a symlink; read its target path explicitly.`);
	const text = textOf(entry);
	return text === undefined ? refused("unsupported", `${path} is not text within ${SOURCE_BYTES} bytes.`) : { status: "accepted", text };
}
/** X5 `list_source`: the tree's file paths under `path`, bounded. */
export function listSource(source: Source, path: string | undefined) {
	const paths = source.entries.map((e) => e.path).filter((p) => !path || p === path || p.startsWith(`${path}/`));
	return { status: "accepted" as const, commit: source.commit, paths: paths.slice(0, LISTED), truncated: paths.length > LISTED };
}
/** X5 `grep_source`: matching lines of the tree's text files, optionally under `paths`, bounded. */
export function grepSource(source: Source, pattern: string, paths: readonly string[] | undefined) {
	let regex: RegExp;
	try {
		regex = new RegExp(pattern);
	} catch {
		return refused("invalid_pattern", "The pattern is not a valid regular expression.");
	}
	const matches: { path: string; line: number; text: string }[] = [];
	for (const entry of source.entries) {
		if (paths?.length && !paths.some((p) => entry.path === p || entry.path.startsWith(`${p}/`))) continue;
		const lines = textOf(entry)?.split("\n") ?? [];
		for (const [i, line] of lines.entries()) {
			if (!regex.test(line)) continue;
			if (matches.length === MATCHES) return { status: "accepted" as const, commit: source.commit, matches, truncated: true };
			matches.push({ path: entry.path, line: i + 1, text: line.slice(0, 400) });
		}
	}
	return { status: "accepted" as const, commit: source.commit, matches, truncated: false };
}
