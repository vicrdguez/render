// Project routing defaults are independent of workflow execution-policy adoption.
import type { Decision, KernelState, VerifiedFacts } from "./kernel.ts";

export type CheckpointModes = { seams: "human" | "delegated"; modules: "human" | "delegated"; proposal: "human" };
export type CheckpointSettings = { currentRevision: string; modes: CheckpointModes };
export type SettingsCommand = {
	type: "changeCheckpointSettings" | "importCheckpointSettings";
	expectedRevision: string;
	modes: CheckpointModes;
};
export const initialCheckpointSettings = (): CheckpointSettings => ({
	currentRevision: "settings:initial",
	modes: { seams: "human", modules: "human", proposal: "human" },
});
export function validCheckpointModes(value: unknown): value is CheckpointModes {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const v = value as Record<string, unknown>;
	return (
		Object.keys(v).length === 3 &&
		["human", "delegated"].includes(String(v.seams)) &&
		["human", "delegated"].includes(String(v.modules)) &&
		v.proposal === "human"
	);
}
export function changeCheckpointSettings(state: KernelState, c: SettingsCommand, facts: VerifiedFacts): Decision {
	const settings = state.checkpointSettings ?? initialCheckpointSettings();
	if (c.expectedRevision !== settings.currentRevision)
		return { outcome: "refused", code: "stale_basis", reason: "Checkpoint settings changed; read the latest accepted revision." };
	if (!validCheckpointModes(c.modes))
		return { outcome: "refused", code: "invalid_content", reason: "Seams/Modules must be human or delegated; Proposal must remain human." };
	const next: CheckpointSettings = { currentRevision: `settings:${facts.sequence}`, modes: { ...c.modes } };
	return {
		outcome: "accepted",
		result: { settings: next.currentRevision },
		writes: [
			{ type: "checkpoint-settings.replace", state: next },
			{ type: "fact.record", fact: facts.ids.fact, command: c.type, refs: { settings: next.currentRevision } },
		],
		facts: [facts.ids.fact],
	};
}
