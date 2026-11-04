// Strict parsing of the version-1 command envelope (docs/protocol.md). Unknown fields are refused so that no
// body field can pose as a principal, route or capability.
import { createHash } from "node:crypto";
import { validCheckpointModes } from "../kernel/checkpoint-settings.ts";
import { CHECKPOINT_COMMANDS, type CheckpointCommand } from "../kernel/checkpoints.ts";
import { INTAKE_COMMANDS, type IntakeCommand, validDependencies } from "../kernel/intake.ts";
import { type Command, isAvailableCommand, type MediaType, type Persistence } from "../kernel/kernel.ts";

import { ROLE_COMMANDS, ROLES, type RoleCommand, type RolePacket } from "../kernel/roles.ts";

export const PROTOCOL_VERSION = 1;
const MAX_CONTENT_BYTES = 16 * 1024 * 1024;

export type Envelope = {
	readonly authorityEpoch: string;
	readonly commandId: string;
	readonly workflow: string | null;
	readonly command: Command;
	/** Exact submitted document bytes, for saveDocument. */
	readonly content?: Buffer;
	/** Canonical payload fingerprint: command, workflow and expected basis, not the submitting device. */
	readonly fingerprint: string;
};

export type EnvelopeRefusal = {
	readonly status: "refused";
	readonly code: "malformed_envelope" | "unsupported_version";
	readonly reason: string;
	readonly supported?: readonly number[];
};

type Fields = Record<string, unknown>;

const COMMAND_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const DOCUMENT = /^[a-z0-9][a-z0-9._/-]{0,127}$/;
// A flat repetition avoids a regex stack frame per quartet on supported multi-MiB documents.
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

class Malformed extends Error {}

function malformed(reason: string): never {
	throw new Malformed(reason);
}

function object(value: unknown, what: string): Fields {
	if (typeof value !== "object" || value === null || Array.isArray(value)) malformed(`${what} must be an object`);
	return value as Fields;
}

function only(value: Fields, allowed: readonly string[], what: string): void {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) malformed(`${what} has unexpected field "${key}"`);
}

function text(value: unknown, what: string, max: number): string {
	if (typeof value !== "string" || value.length < 1 || value.length > max) malformed(`${what} must be a string of 1-${max} characters`);
	return value;
}

export function parseEnvelope(raw: unknown): Envelope | EnvelopeRefusal {
	try {
		const e = object(raw, "envelope");
		if (e.version !== PROTOCOL_VERSION)
			return {
				status: "refused",
				code: "unsupported_version",
				reason: `Protocol version ${JSON.stringify(e.version)} is not supported; upgrade the client to a version that speaks protocol 1.`,
				supported: [PROTOCOL_VERSION],
			};
		only(e, ["version", "authorityEpoch", "commandId", "workflow", "expected", "command"], "envelope");
		const authorityEpoch = text(e.authorityEpoch, "authorityEpoch", 128);
		const commandId = text(e.commandId, "commandId", 128);
		if (!COMMAND_ID.test(commandId)) malformed("commandId has characters outside [A-Za-z0-9._:-]");
		const workflow = e.workflow === undefined ? null : text(e.workflow, "workflow", 128);
		const expected = e.expected === undefined ? undefined : object(e.expected, "expected");
		if (expected !== undefined) only(expected, ["document"], "expected");
		const c = object(e.command, "command");
		const type = typeof c.type === "string" ? c.type : malformed("command.type must be a string");
		const parsed = isAvailableCommand(type)
			? available(type, c, workflow, expected)
			: { command: { type, ...(workflow === null ? {} : { workflow }) } };
		const fingerprint = createHash("sha256")
			.update(canonical({ workflow, expected: expected ?? null, command: c }))
			.digest("hex");
		return { authorityEpoch, commandId, workflow, fingerprint, ...parsed };
	} catch (error) {
		if (error instanceof Malformed) return { status: "refused", code: "malformed_envelope", reason: error.message };
		throw error;
	}
}

function available(type: string, c: Fields, workflow: string | null, expected: Fields | undefined): { command: Command; content?: Buffer } {
	const needsWorkflow =
		type === "requestLocalVerificationPrompt" ||
		type === "adoptPolicy" ||
		type === "saveDocument" ||
		type === "postCoordinatorMessage" ||
		ROLE_COMMANDS.includes(type) ||
		CHECKPOINT_COMMANDS.includes(type) ||
		INTAKE_COMMANDS.includes(type);
	if (needsWorkflow && workflow === null) malformed(`${type} requires a workflow`);
	if (!needsWorkflow && workflow !== null) malformed(`${type} takes no workflow`);
	if (type !== "saveDocument" && expected !== undefined) malformed(`${type} takes no expected basis`);
	if (INTAKE_COMMANDS.includes(type)) return { command: intakeCommand(type, c, workflow as string) };
	if (CHECKPOINT_COMMANDS.includes(type)) return { command: checkpointCommand(type, c, workflow as string) };
	if (ROLE_COMMANDS.includes(type)) return { command: roleCommand(type, c, workflow as string) };
	switch (type) {
		case "requestLocalVerificationPrompt":
			only(c, ["type", "source", "expectedSequence"], "command");
			if (!Number.isSafeInteger(c.expectedSequence) || Number(c.expectedSequence) < 0)
				malformed("expectedSequence must name an observed sequence");
			return {
				command: {
					type,
					workflow: workflow as string,
					source: text(c.source, "source", 128),
					expectedSequence: c.expectedSequence as number,
				},
			};
		case "changeCheckpointSettings":
		case "importCheckpointSettings":
			only(c, ["type", "expectedRevision", "modes"], "command");
			if (!validCheckpointModes(c.modes))
				malformed("Settings require seams/modules human|delegated and proposal human, with no extra fields");
			return { command: { type, expectedRevision: text(c.expectedRevision, "expectedRevision", 128), modes: c.modes } };
		case "changePolicy": {
			only(c, ["type", "expectedRevision", "policy"], "command");
			const p = object(c.policy, "policy");
			only(p, ["completedReviewLimit", "reviewerDiversity", "minimumEvidenceRank"], "policy");
			if (!Number.isSafeInteger(p.completedReviewLimit) || Number(p.completedReviewLimit) < 0)
				malformed("completedReviewLimit must be a nonnegative integer");
			// Membership is checked against the selected repository catalog at completion, never a second ladder.
			text(p.minimumEvidenceRank, "minimumEvidenceRank", 128);
			if (p.reviewerDiversity !== "different-family" && p.reviewerDiversity !== "human-directed-same-family")
				malformed("unknown reviewer diversity policy");
			return {
				command: {
					type,
					expectedRevision: text(c.expectedRevision, "expectedRevision", 128),
					policy: {
						completedReviewLimit: p.completedReviewLimit as number,
						reviewerDiversity: p.reviewerDiversity,
						minimumEvidenceRank: text(p.minimumEvidenceRank, "minimumEvidenceRank", 128),
					},
				},
			};
		}
		case "adoptPolicy":
			only(c, ["type", "revision", "expectedBinding"], "command");
			return {
				command: {
					type,
					workflow: workflow as string,
					revision: text(c.revision, "revision", 128),
					expectedBinding: text(c.expectedBinding, "expectedBinding", 128),
				},
			};
		case "createWorkflow":
			only(c, ["type", "title"], "command");
			return { command: { type, title: text(c.title, "title", 200) } };
		case "saveDocument": {
			only(c, ["type", "document", "mediaType", "content"], "command");
			const document = text(c.document, "document", 128);
			if (!DOCUMENT.test(document)) malformed("document must match [a-z0-9][a-z0-9._/-]{0,127}");
			if (c.mediaType !== "text/markdown" && c.mediaType !== "text/plain") malformed("mediaType must be text/markdown or text/plain");
			if (typeof c.content !== "string" || c.content.length % 4 !== 0 || !BASE64.test(c.content)) malformed("content must be base64");
			const content = Buffer.from(c.content, "base64");
			if (content.length > MAX_CONTENT_BYTES) malformed(`content exceeds ${MAX_CONTENT_BYTES} bytes`);
			if (expected === undefined || !("document" in expected)) malformed("saveDocument requires expected.document (a revision or null)");
			const basis = expected.document;
			if (basis !== null && typeof basis !== "string") malformed("expected.document must be a revision or null");
			return {
				command: { type, workflow: workflow as string, document, mediaType: c.mediaType as MediaType, expected: basis },
				content,
			};
		}
		case "postCoordinatorMessage":
			only(c, ["type", "text"], "command");
			return { command: { type, workflow: workflow as string, text: text(c.text, "text", 65_536) } };
		case "enrollDevice": {
			only(c, ["type", "label", "scope"], "command");
			const scope = object(c.scope, "scope");
			only(scope, ["workflows"], "scope");
			const workflows = scope.workflows;
			if (workflows !== "all" && !(Array.isArray(workflows) && workflows.every((w) => typeof w === "string" && w.length > 0)))
				malformed('scope.workflows must be "all" or a list of workflow refs');
			return { command: { type, label: text(c.label, "label", 100), scope: { workflows: workflows as "all" | string[] } } };
		}
		case "revokeDevice":
			only(c, ["type", "device"], "command");
			return { command: { type, device: text(c.device, "device", 64) } };
		case "recordStartup": {
			only(c, ["type", "executorEpoch", "persistence"], "command");
			const p = object(c.persistence, "persistence");
			return { command: { type, executorEpoch: text(c.executorEpoch, "executorEpoch", 128), persistence: p as unknown as Persistence } };
		}
		default:
			return malformed(`unhandled command ${type}`);
	}
}

function intakeCommand(type: string, c: Fields, workflow: string): IntakeCommand {
	const basis = ["intake", "review", "annotations", "policyBinding", "decisions"];
	const fields: Record<string, string[]> = {
		stageIntake: ["expected", "text", "manifest"],
		requestIntakeReview: ["intake", "key"],
		saveIntakeConcern: ["intake", "text"],
		acceptIntake: basis,
		amendContract: [...basis, "slice", "expected"],
		supersedeContract: [...basis, "slice", "expected", "dispositions"],
		amendDependencies: ["expected", "dependencies", "reason"],
	};
	only(c, ["type", ...fields[type]!], "intake command");
	for (const key of fields[type]!) {
		if (["manifest", "annotations", "decisions", "dependencies", "dispositions"].includes(key)) continue;
		if (key === "expected" && type === "stageIntake" && c.expected === null) continue;
		if (key === "text" && type === "saveIntakeConcern" && c.text === "") continue;
		text(c[key], key, key === "text" ? 1024 * 1024 : 1024);
	}
	if (type === "stageIntake") object(c.manifest, "manifest");
	if (basis.every((k) => fields[type]!.includes(k))) {
		if (!Number.isSafeInteger(c.annotations) || Number(c.annotations) < 0) malformed("annotations must be nonnegative");
		if (!Array.isArray(c.decisions) || !c.decisions.every((v) => typeof v === "string" && v.length > 0))
			malformed("decisions must be exact refs");
	}
	if (type === "amendDependencies" && !validDependencies(c.dependencies)) malformed("invalid dependencies");
	if (type === "supersedeContract") {
		if (!Array.isArray(c.dispositions)) malformed("dispositions must be an array");
		for (const value of c.dispositions as unknown[]) {
			const d = object(value, "disposition");
			only(d, ["slice", "replacement"], "disposition");
			text(d.slice, "slice", 128);
			text(d.replacement, "replacement", 128);
		}
	}
	return { ...c, type, workflow } as IntakeCommand;
}
function checkpointCommand(type: string, c: Fields, workflow: string): CheckpointCommand {
	const fields: Record<string, string[]> = {
		requestCheckpoint: ["stage", "scope", "required"],
		stageCheckpoint: ["request", "text", "manifest"],
		requestCheckpointReview: ["request", "key"],
		emitCheckpoint: ["request", "review", "contested"],
		reworkCheckpoint: ["request"],
		saveCheckpointConcern: ["request", "base", "text", "kind"],
		approveCheckpoint: ["request", "emission", "manifest", "annotations", "policyBinding", "decisions", "nonbinding"],
		advanceDelegatedCheckpoint: ["request", "emission", "manifest", "annotations", "policyBinding", "decisions", "nonbinding"],
		cancelCheckpoint: ["request", "expectedEmission", "reason"],
	};
	only(c, ["type", ...fields[type]!], "checkpoint command");
	if (type === "requestCheckpoint") {
		if (c.stage !== "seams" && c.stage !== "modules") malformed("Technical checkpoints are seams or modules");
		text(c.scope, "scope", 128);
		const required = object(c.required, "required");
		only(required, ["candidates", "experiment"], "required");
		if (typeof required.candidates !== "boolean" || typeof required.experiment !== "boolean")
			malformed("Declare required candidate and experiment evidence");
	} else text(c.request, "request", 128);
	for (const key of ["text", "reason"]) {
		if (!fields[type]!.includes(key)) continue;
		if (key === "text" && type === "saveCheckpointConcern" && c.kind !== "reason" && c.text === "") continue;
		text(c[key], key, 16 * 1024 * 1024);
	}
	for (const key of ["base", "emission", "review", "key", "policyBinding"]) if (fields[type]!.includes(key)) text(c[key], key, 128);
	if (type === "saveCheckpointConcern" && c.kind !== undefined && c.kind !== "edit" && c.kind !== "reason")
		malformed("Concern kind is edit or reason");
	if (type === "cancelCheckpoint" && c.expectedEmission !== null) text(c.expectedEmission, "expectedEmission", 128);
	if (type === "stageCheckpoint") object(c.manifest, "manifest");
	if (type === "emitCheckpoint") {
		if (!Array.isArray(c.contested)) malformed("contested must be an array");
		for (const v of c.contested) {
			const r = object(v, "response");
			only(r, ["objection", "disposition", "reason", "resulting"], "response");
			for (const k of ["objection", "disposition", "reason", "resulting"]) text(r[k], k, 65536);
		}
	}
	if (type === "approveCheckpoint" || type === "advanceDelegatedCheckpoint") {
		text(c.manifest, "manifest", 128);
		if (!Number.isSafeInteger(c.annotations) || Number(c.annotations) < 0) malformed("annotations must be a nonnegative revision");
		const decisions = object(c.decisions, "decisions");
		for (const v of Object.values(decisions)) text(v, "decision", 65536);
		if (!Array.isArray(c.nonbinding) || !c.nonbinding.every((v) => typeof v === "string"))
			malformed("nonbinding must explicitly list note IDs");
	}
	return { ...c, type, workflow } as CheckpointCommand;
}

function roleCommand(type: string, c: Fields, workflow: string): RoleCommand {
	const base = { type, workflow };
	switch (type) {
		case "assignTask":
			only(c, ["type", "slice", "delivery", "packet"], "command");
			if (typeof c.delivery !== "boolean") malformed("delivery must be boolean");
			return { type, workflow, slice: text(c.slice, "slice", 128), delivery: c.delivery, packet: parsePacket(c.packet) };
		case "replaceTask":
			only(c, ["type", "assignment", "generation", "attempt", "packet"], "command");
			if (!Number.isSafeInteger(c.generation) || Number(c.generation) < 1) malformed("generation must be a positive integer");
			return {
				type,
				workflow,
				assignment: text(c.assignment, "assignment", 128),
				generation: c.generation as number,
				attempt: text(c.attempt, "attempt", 128),
				packet: parsePacket(c.packet),
			};
		case "requestRole":
			only(c, ["type", "key", "request"], "command");
			return {
				type,
				workflow,
				key: text(c.key, "key", 128),
				...(c.request === undefined ? {} : { request: text(c.request, "request", 128) }),
			};
		case "submitRoleResult": {
			only(c, ["type", "text", "supports", "verification"], "command");
			if (
				!Array.isArray(c.supports) ||
				c.supports.length > 32 ||
				!c.supports.every((v) => typeof v === "string" && v.length > 0 && v.length <= 128)
			)
				malformed("Declare required retained supports (at most 32 refs), or [] for no web reliance.");
			let verification: import("../kernel/verification.ts").VerificationAssessment | undefined;
			if (c.verification !== undefined) {
				const v = object(c.verification, "verification assessment");
				only(v, ["outcome", "rank", "reason"], "verification assessment");
				if (v.outcome !== "pass" && v.outcome !== "non-pass") malformed("unknown verification outcome");
				verification = {
					outcome: v.outcome,
					rank: v.rank === null ? null : text(v.rank, "rank", 128),
					reason: text(v.reason, "reason", 4096),
				};
			}
			return {
				type,
				workflow,
				text: text(c.text, "text", 1024 * 1024),
				supports: c.supports as string[],
				...(verification ? { verification } : {}),
			};
		}
		case "retainWebEvidence":
			only(c, ["type", "handle", "observation", "start", "end", "claim", "stance"], "command");
			if (
				!Number.isSafeInteger(c.start) ||
				!Number.isSafeInteger(c.end) ||
				!["supporting", "negative", "conflicting"].includes(String(c.stance))
			)
				malformed("invalid passage selection");
			return {
				type,
				workflow,
				handle: text(c.handle, "handle", 128),
				observation: text(c.observation, "observation", 128),
				start: c.start as number,
				end: c.end as number,
				claim: text(c.claim, "claim", 2048),
				stance: c.stance as "supporting" | "negative" | "conflicting",
			};
		case "requestOwnStop":
			only(c, ["type"], "command");
			return { type, workflow };
	}
	const allowed = ["type", "assignment", "generation", "attempt"];
	if (type === "recordBlocker") allowed.push("reason");
	if (type === "recordRuntimeHistory") allowed.push("key");
	if (
		type === "recordRecoveryState" ||
		type === "recordRunnerObservation" ||
		type === "recordRunnerDiagnostic" ||
		type === "recordSourceObservation"
	)
		allowed.push("text");
	if (type === "stageTask" || type === "rebindAttempt") allowed.push("executorEpoch");
	if (type === "recordQuiescence" || type === "rebindAttempt") allowed.push("providerIdle", "environment", "effects");
	only(c, allowed, "command");
	if (!Number.isSafeInteger(c.generation) || Number(c.generation) < 1) malformed("generation must be a positive integer");
	const common = {
		...base,
		assignment: text(c.assignment, "assignment", 128),
		generation: c.generation as number,
		attempt: text(c.attempt, "attempt", 128),
	};
	if (type === "recordRuntimeHistory") return { ...common, type, key: text(c.key, "key", 128) };
	if (type === "recordBlocker") return { ...common, type, reason: text(c.reason, "reason", 2048) };
	if (
		type === "recordRecoveryState" ||
		type === "recordRunnerObservation" ||
		type === "recordRunnerDiagnostic" ||
		type === "recordSourceObservation"
	)
		return { ...common, type, text: text(c.text, "text", type === "recordRecoveryState" ? 1024 * 1024 : 16 * 1024 * 1024) };
	if (type === "recordQuiescence" || type === "rebindAttempt") {
		if (
			typeof c.providerIdle !== "boolean" ||
			!["absent", "stopped", "unknown"].includes(String(c.environment)) ||
			!["reconciled", "unknown"].includes(String(c.effects))
		)
			malformed("invalid quiescence observation");
		return {
			...common,
			type,
			providerIdle: c.providerIdle as boolean,
			environment: c.environment as "absent" | "stopped" | "unknown",
			effects: c.effects as "reconciled" | "unknown",
			...(type === "rebindAttempt" ? { executorEpoch: text(c.executorEpoch, "executorEpoch", 128) } : {}),
		};
	}
	return {
		...common,
		type: type as "stageTask" | "cancelWork" | "fenceAttempt",
		...(type === "stageTask" ? { executorEpoch: text(c.executorEpoch, "executorEpoch", 128) } : {}),
	};
}

function parsePacket(raw: unknown, depth = 0): RolePacket {
	if (depth > 4) malformed("role packet requests exceed four levels");
	const p = object(raw, "role packet");
	only(
		p,
		[
			"role",
			"investigation",
			"experiment",
			"inputs",
			"principles",
			"instructions",
			"policy",
			"profile",
			"execution",
			"provider",
			"model",
			"family",
			"requiredFamily",
			"thinking",
			"maxInputBytes",
			"maxOutputTokens",
			"maxTurns",
			"expectedOutput",
			"submission",
			"requests",
			"verification",
		],
		"role packet",
	);
	if (p.experiment !== undefined) {
		const e = object(p.experiment, "experiment");
		only(e, ["protocol", "candidate"], "experiment");
		text(e.protocol, "protocol revision", 128);
		if (e.candidate !== null) text(e.candidate, "candidate identity", 32);
	}
	if (p.investigation !== undefined) {
		const i = object(p.investigation, "investigation");
		only(i, ["ground", "repository", "commit", "paths"], "investigation");
		text(i.ground, "Ground ref", 128);
		text(i.repository, "repository", 128);
		if (typeof i.commit !== "string" || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(i.commit))
			malformed("investigation requires an exact commit OID");
		if (
			!Array.isArray(i.paths) ||
			!i.paths.length ||
			i.paths.length > 256 ||
			!i.paths.every((path) => typeof path === "string" && path.length > 0 && path.length <= 4096) ||
			new Set(i.paths).size !== i.paths.length
		)
			malformed("investigation requires a bounded unique selection of complete source paths");
	}
	if (!ROLES.includes(p.role as never)) malformed("unknown role");
	if (!Array.isArray(p.inputs) || p.inputs.length > 256 || !p.inputs.every((ref) => typeof ref === "string" && ref.length > 0))
		malformed("inputs must be exact artifact refs");
	if (
		p.provider !== "anthropic" ||
		!["read-only", "linux-writer"].includes(String(p.execution)) ||
		!["off", "minimal", "low", "medium", "high", "xhigh"].includes(String(p.thinking)) ||
		p.submission !== "submit_role_result"
	)
		malformed("unsupported role execution configuration");
	for (const field of ["maxInputBytes", "maxOutputTokens", "maxTurns"])
		if (!Number.isSafeInteger(p[field]) || Number(p[field]) < 1) malformed(`${field} must be a positive integer`);
	for (const field of ["principles", "instructions", "policy", "profile", "model", "family", "requiredFamily", "expectedOutput"])
		text(p[field], field, 2048);
	if (!Array.isArray(p.requests) || p.requests.length > 32) malformed("requests must be a bounded list");
	const keys = new Set<string>();
	const requests = p.requests.map((raw) => {
		const r = object(raw, "role request");
		only(r, ["key", "packet"], "role request");
		const key = text(r.key, "key", 128);
		if (keys.has(key)) malformed("duplicate role request key");
		keys.add(key);
		return { key, packet: parsePacket(r.packet, depth + 1) };
	});
	if (p.verification !== undefined) {
		const v = object(p.verification, "verification selection");
		only(v, ["repository", "commit", "path", "digest", "contract", "rows", "behavioralRows", "receipts"], "verification selection");
		for (const name of ["repository", "commit", "path", "digest", "contract"]) text(v[name], name, 4096);
		if (!/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(String(v.commit)) || !/^[a-f0-9]{64}$/.test(String(v.digest)))
			malformed("verification requires exact commit and SHA-256 catalog digest");
		for (const name of ["rows", "behavioralRows", "receipts"])
			if (
				!Array.isArray(v[name]) ||
				v[name].length > 64 ||
				!v[name].every((s: unknown) => typeof s === "string" && s.length > 0 && s.length <= 128)
			)
				malformed(`verification ${name} must be a bounded list`);
	}
	return { ...p, requests } as RolePacket;
}

/** Strict UTF-8 decoding that preserves a leading BOM, so the stored text re-encodes to the same bytes. */
export function decodeUtf8(bytes: Buffer): string | undefined {
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object")
		return `{${Object.keys(value)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canonical((value as Fields)[k])}`)
			.join(",")}}`;
	return JSON.stringify(value);
}
