// How Engine applies the current Engine settings revision: packet values for a role and settings-added models.
import type { Provider } from "@earendil-works/pi-ai/models";
import { type EngineSettingsRevision, type ModelEntry, modelFamily } from "../kernel/engine-settings.ts";
import type { Role, RolePacket } from "../kernel/roles.ts";

export type PacketSettings = Pick<
	RolePacket,
	"provider" | "model" | "family" | "requiredFamily" | "thinking" | "maxInputBytes" | "maxOutputTokens" | "maxTurns"
> & { readonly settingsRevision: number };

/** The values a new packet for `role` copies and pins; a later revision never changes them. */
export function packetSettings(settings: EngineSettingsRevision, role: Role): PacketSettings {
	const t = settings.value.roles[role];
	const family = modelFamily(settings.value, t.model);
	if (family === undefined) throw new Error(`Role ${role} model has no family in settings revision ${settings.revision}.`);
	return {
		settingsRevision: settings.revision,
		provider: t.model.provider as RolePacket["provider"],
		model: t.model.id,
		family,
		requiredFamily: family,
		thinking: t.thinking,
		maxInputBytes: t.maxInputBytes,
		maxOutputTokens: t.maxOutputTokens,
		maxTurns: t.maxTurns,
	};
}

/** Adds the current revision's entries to the provider catalog, each copied from its base with its own id and limits. */
export function withSettingsModels(provider: Provider, entries: () => readonly ModelEntry[]): Provider {
	return {
		...provider,
		getModels: () => {
			const catalog = provider.getModels();
			const added = entries().flatMap((e) => {
				if (e.provider !== provider.id || e.base === undefined || catalog.some((m) => m.id === e.id)) return [];
				const base = catalog.find((m) => m.id === e.base);
				if (!base) return [];
				return [
					{
						...base,
						id: e.id,
						name: e.id,
						...(e.contextWindow === undefined ? {} : { contextWindow: e.contextWindow }),
						...(e.maxTokens === undefined ? {} : { maxTokens: e.maxTokens }),
					},
				];
			});
			return [...catalog, ...added];
		},
	};
}
