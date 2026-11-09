// Families, model entries and role templates as immutable revisions a project-wide human changes with an expected revision.
import * as Effect from "effect/Effect";
import { type Family, PROVIDERS, type ProviderId } from "../engine/providers.ts";
import type { Decision, KernelState, Refusal, VerifiedFacts } from "./kernel.ts";
import { ROLES, type Role } from "./roles.ts";

export type ModelEntry = {
	readonly provider: ProviderId;
	readonly id: string;
	readonly family: string;
	/** Present when the pinned catalog lacks `id`: the catalog model whose API and limits this entry copies. */
	readonly base?: string;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
};
export type RoleTemplate = {
	readonly model: { readonly provider: ProviderId; readonly id: string };
	readonly thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
	readonly maxInputBytes: number;
	readonly maxOutputTokens: number;
	readonly maxTurns: number;
};
export type EngineSettings = {
	readonly schema: 1;
	readonly families: Family[];
	readonly models: ModelEntry[];
	readonly roles: Readonly<Record<Role, RoleTemplate>>;
	readonly forge: { readonly actor: string | null };
};
export type EngineSettingsRevision = { readonly revision: number; readonly value: EngineSettings };
export type EngineSettingsCommand = {
	readonly type: "changeEngineSettings";
	readonly expectedRevision: number;
	readonly settings: EngineSettings;
};

const THINKING = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
const WRITER: RoleTemplate = {
	model: { provider: "anthropic", id: "claude-opus-5-5" },
	thinking: "high",
	maxInputBytes: 2_000_000,
	maxOutputTokens: 32_000,
	maxTurns: 200,
};
const REVIEWER: RoleTemplate = {
	model: { provider: "openai", id: "gpt-6.1-sol" },
	thinking: "high",
	maxInputBytes: 800_000,
	maxOutputTokens: 32_000,
	maxTurns: 100,
};
export const initialEngineSettings = (): EngineSettingsRevision => ({
	revision: 1,
	value: {
		schema: 1,
		families: [
			{ name: "claude", provider: "anthropic", auth: "pi-login" },
			{ name: "chatgpt", provider: "openai", auth: "pi-login" },
		],
		models: [],
		roles: {
			coordinator: WRITER,
			implementer: WRITER,
			candidate: WRITER,
			"experiment-candidate": WRITER,
			"experiment-parent": WRITER,
			challenger: REVIEWER,
			"audit-standards": REVIEWER,
			"audit-contracts": REVIEWER,
			watchdog: REVIEWER,
		},
		forge: { actor: null },
	},
});

type Fields = Record<string, unknown>;
const isObject = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);
const exactly = (v: Fields, required: readonly string[], optional: readonly string[] = []) =>
	required.every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k));
const name = (v: unknown, max = 128) => typeof v === "string" && v.length >= 1 && v.length <= max;
const positive = (v: unknown) => Number.isSafeInteger(v) && (v as number) > 0;

/** Structural shape only; references to providers, catalog models and families are Kernel legality. */
export function validEngineSettingsShape(value: unknown): value is EngineSettings {
	if (!isObject(value) || !exactly(value, ["schema", "families", "models", "roles", "forge"]) || value.schema !== 1) return false;
	const { families, models, roles, forge } = value;
	if (!Array.isArray(families) || families.length < 1 || families.length > 32) return false;
	for (const f of families)
		if (!isObject(f) || !exactly(f, ["name", "provider", "auth"]) || !name(f.name, 64) || !name(f.provider, 64)) return false;
		else if (f.auth !== "pi-login" && f.auth !== "api-key") return false;
	if (!Array.isArray(models) || models.length > 64) return false;
	for (const m of models) {
		if (!isObject(m) || !exactly(m, ["provider", "id", "family"], ["base", "contextWindow", "maxTokens"])) return false;
		if (!name(m.provider, 64) || !name(m.id) || !name(m.family, 64) || (m.base !== undefined && !name(m.base))) return false;
		if ((m.contextWindow !== undefined && !positive(m.contextWindow)) || (m.maxTokens !== undefined && !positive(m.maxTokens)))
			return false;
	}
	if (!isObject(roles) || !exactly(roles, ROLES)) return false;
	for (const t of Object.values(roles)) {
		if (!isObject(t) || !exactly(t, ["model", "thinking", "maxInputBytes", "maxOutputTokens", "maxTurns"])) return false;
		if (!isObject(t.model) || !exactly(t.model, ["provider", "id"]) || !name(t.model.provider, 64) || !name(t.model.id)) return false;
		if (!THINKING.includes(t.thinking as never) || !positive(t.maxInputBytes) || !positive(t.maxOutputTokens) || !positive(t.maxTurns))
			return false;
	}
	return isObject(forge) && exactly(forge, ["actor"]) && (forge.actor === null || name(forge.actor, 256));
}

const known = (provider: string): provider is ProviderId => Object.hasOwn(PROVIDERS, provider);
const inCatalog = (provider: ProviderId, id: string) =>
	PROVIDERS[provider]()
		.getModels()
		.some((m) => m.id === id);

/** The family a role model runs in: its entry's family, else the family configured for its provider. */
export function modelFamily(settings: EngineSettings, model: RoleTemplate["model"]): string | undefined {
	return (
		settings.models.find((m) => m.provider === model.provider && m.id === model.id)?.family ??
		settings.families.find((f) => f.provider === model.provider)?.name
	);
}

function settingsProblem(s: EngineSettings): string | undefined {
	if (new Set(s.families.map((f) => f.name)).size !== s.families.length) return "Family names must be unique.";
	for (const f of s.families) if (!known(f.provider)) return `Family ${f.name} names unknown provider ${f.provider}.`;
	for (const m of s.models) {
		if (!known(m.provider)) return `Model ${m.id} names unknown provider ${m.provider}.`;
		if (!s.families.some((f) => f.name === m.family && f.provider === m.provider))
			return `Model ${m.provider}/${m.id} names family ${m.family}, which has no ${m.provider} family entry.`;
		if (m.base !== undefined ? !inCatalog(m.provider, m.base) : !inCatalog(m.provider, m.id))
			return `Model ${m.provider}/${m.id} needs a base present in the pinned ${m.provider} catalog.`;
	}
	for (const [role, t] of Object.entries(s.roles)) {
		const { provider, id } = t.model;
		if (!known(provider)) return `Role ${role} names unknown provider ${provider}.`;
		if (!s.models.some((m) => m.provider === provider && m.id === id) && !inCatalog(provider, id))
			return `Role ${role} names ${provider}/${id}, which is neither a model entry nor a catalog model.`;
		if (modelFamily(s, t.model) === undefined) return `Role ${role} model ${provider}/${id} has no family.`;
	}
	return undefined;
}

export const changeEngineSettings = Effect.fnUntraced(function* (
	state: KernelState,
	c: EngineSettingsCommand,
	facts: VerifiedFacts,
): Effect.fn.Return<Extract<Decision, { outcome: "accepted" }>, Refusal> {
	const current = state.engineSettings ?? initialEngineSettings();
	if (c.expectedRevision !== current.revision)
		return yield* Effect.fail<Refusal>({
			outcome: "refused",
			code: "stale_basis",
			reason: `Engine settings are at revision ${current.revision}; read it and retry.`,
			refs: { current: String(current.revision) },
		});
	const problem = settingsProblem(c.settings);
	if (problem) return yield* Effect.fail<Refusal>({ outcome: "refused", code: "invalid_content", reason: problem });
	const next: EngineSettingsRevision = { revision: current.revision + 1, value: c.settings };
	return {
		outcome: "accepted",
		result: { engineSettings: next.revision },
		writes: [
			{ type: "engine-settings.replace", state: next },
			{ type: "fact.record", fact: facts.ids.fact, command: c.type, refs: { engineSettings: `engine-settings:${next.revision}` } },
		],
		facts: [facts.ids.fact],
	};
});
