// Engine's experiment execution path. All authority and retention still cross Ledger;
// shell execution and literal collection remain Sandboxes/Effects responsibilities.
import { createHash } from "node:crypto";
import { Effects, type Source, type SourceReceipt } from "../effects/source.ts";
import { type ExperimentProtocol, experimentCandidates, readExperimentProtocol } from "../kernel/experiments.ts";
import type { RoleAssignment } from "../kernel/roles.ts";
import type { Ledger } from "../ledger/ledger.ts";
import { mintContext } from "../ledger/principals.ts";
import { type ExecutionScope, Sandboxes, type SandboxHandle, SandboxInputRefusal } from "../sandboxes/sandboxes.ts";

export type ExperimentConfig = { root: string; repositories: Readonly<Record<string, string>> };
const effectsContext = mintContext({ kind: "host", scope: "effects" });
export function experimentScope(a: RoleAssignment, fenced = false): ExecutionScope {
	return { assignment: a.id, generation: a.generation - (fenced ? 1 : 0), attempt: a.attempt, executorEpoch: a.executorEpoch ?? "unbound" };
}
export class Experiments {
	readonly #effects: Effects;
	readonly #sandboxes: Sandboxes;
	readonly #ledger: () => Ledger;
	readonly #assignments: () => RoleAssignment[];
	readonly #prepared = new Map<string, { handle: SandboxHandle; base: Source; protocol: ExperimentProtocol; digest: string }>();
	readonly #active = new Set<string>();
	constructor(config: ExperimentConfig, ledger: () => Ledger, assignments: () => RoleAssignment[]) {
		this.#ledger = ledger;
		this.#assignments = assignments;
		this.#effects = new Effects({ root: `${config.root}/effects`, repositories: config.repositories });
		this.#sandboxes = new Sandboxes({
			root: `${config.root}/sandboxes`,
			authorize: (scope) => {
				const a = assignments().find((a) => a.id === scope.assignment);
				return (
					!!a?.packet.experiment &&
					a.status === "running" &&
					a.executing &&
					JSON.stringify(experimentScope(a)) === JSON.stringify(scope) &&
					a.executorEpoch === ledger().status().executorEpoch
				);
			},
		});
	}
	async #read(ref: string): Promise<string> {
		const result = await this.#ledger().artifact(effectsContext, { read: ref });
		if (!("content" in result)) throw new Error(`Restore exact experiment input ${ref}: ${result.code}`);
		return result.content.toString();
	}
	async prepare(a: RoleAssignment): Promise<void> {
		if (this.#prepared.has(a.id)) return;
		let allocationStarted = false;
		try {
			const e = a.packet.experiment!;
			const bytes = await this.#read(e.protocol);
			const protocol = readExperimentProtocol(bytes);
			if (!protocol) throw new Error(`Restore exact compatible protocol ${e.protocol}`);
			const base = await this.#effects.perform({ type: "resolve", ...protocol.source });
			const readOnly: Record<string, Source> = {};
			if (e.candidate === null) {
				for (const candidate of experimentCandidates(this.#assignments(), e.protocol)) {
					if (candidate.status !== "submitted" || candidate.executing || !candidate.experimentSource || !candidate.report)
						throw new Error(`Retain sealed candidate ${candidate.id} source and report before comparison.`);
					await this.#read(candidate.report);
					const retained = JSON.parse(await this.#read(candidate.experimentSource)) as { protocol: string; source: SourceReceipt };
					if (retained.protocol !== e.protocol) throw new Error("Candidate protocol differs; new round required.");
					await this.#effects.reconcile(retained.source);
					readOnly[candidate.packet.experiment!.candidate!] = retained.source.source;
				}
				if (protocol.candidates.some((id) => !Object.hasOwn(readOnly, id))) throw new Error("Required sealed candidate missing.");
			}
			allocationStarted = true;
			const handle = await this.#sandboxes.prepare(
				experimentScope(a),
				{ ...protocol.profile, maxCommands: protocol.budget.maxCommands },
				{ ...base, ...(e.candidate === null ? { readOnly } : {}) },
			);
			this.#prepared.set(a.id, { handle, base, protocol, digest: createHash("sha256").update(bytes).digest("hex") });
		} catch (error) {
			if (!allocationStarted) throw new SandboxInputRefusal(String(error), { cause: error });
			throw error;
		}
	}
	async run(a: RoleAssignment, argv: string[]): Promise<unknown> {
		if (this.#active.has(a.id)) throw new Error("One experiment command at a time; concurrent writer admission refused.");
		const prepared = this.#prepared.get(a.id);
		if (!prepared) throw new Error("Experiment environment unavailable; reconcile original execution, never fall back to host.");
		this.#active.add(a.id);
		try {
			const result = await this.#sandboxes.execute(prepared.handle, {
				scope: experimentScope(a),
				argv,
				timeoutMs: prepared.protocol.budget.timeoutMs,
				verifierRevision: prepared.digest,
			});
			await this.#retain(a, "recordRunnerDiagnostic", {
				schema: 1,
				kind: "experiment-execution",
				protocol: a.packet.experiment!.protocol,
				scope: experimentScope(a),
				result,
			});
			return result;
		} finally {
			this.#active.delete(a.id);
		}
	}
	async seal(a: RoleAssignment): Promise<void> {
		if (a.experimentSource) {
			await this.#read(a.experimentSource);
			return;
		}
		if (this.#active.has(a.id)) throw new Error("Experiment command has not settled; cannot seal concurrent execution.");
		const prepared = this.#prepared.get(a.id);
		if (!prepared) throw new Error("Original experiment environment must be reconciled before sealing.");
		const capture = await this.#sandboxes.seal(prepared.handle);
		const stopped = await this.#sandboxes.stop(prepared.handle);
		if (!stopped.executions.length) throw new Error("Independent execution evidence required; a model report alone is not a measurement.");
		const source = await this.#effects.perform({ type: "retain", base: prepared.base, capture });
		await this.#effects.reconcile(source);
		await this.#retain(a, "recordSourceObservation", {
			schema: 1,
			kind: "experiment-source",
			protocol: a.packet.experiment!.protocol,
			protocolDigest: prepared.digest,
			candidate: a.packet.experiment!.candidate,
			scope: experimentScope(a),
			source,
			executions: stopped.executions,
			limits: [
				"Ordinary networking; reachable host/LAN/tailnet are not confined",
				"Linux evidence is not native macOS evidence",
				"Model report is a claim, not a runner observation",
			],
		});
	}
	async stop(a: RoleAssignment, fenced = false): Promise<void> {
		let scope = experimentScope(a, fenced);
		if (a.experimentSource) {
			const retained = JSON.parse(await this.#read(a.experimentSource)) as { scope: ExecutionScope; protocol: string };
			if (
				retained.protocol !== a.packet.experiment!.protocol ||
				retained.scope.assignment !== scope.assignment ||
				retained.scope.generation !== scope.generation ||
				retained.scope.attempt !== scope.attempt
			)
				throw new Error("Sealed experiment execution identity differs; reconcile the exact original runtime.");
			scope = retained.scope;
		}
		const stopped = await this.#sandboxes.stop({ scope });
		if (this.#active.has(a.id)) throw new Error("Admitted experiment execution still settling; capacity remains held.");
		await this.#retain(a, "recordRunnerDiagnostic", {
			schema: 1,
			kind: "experiment-stop",
			protocol: a.packet.experiment!.protocol,
			scope,
			executions: stopped.executions,
			quarantine: stopped.quarantine ?? null,
		});
	}
	async #retain(a: RoleAssignment, type: "recordRunnerDiagnostic" | "recordSourceObservation", value: unknown): Promise<void> {
		const text = JSON.stringify(value);
		const result = await this.#ledger().command(
			{
				version: 1,
				authorityEpoch: this.#ledger().status().authorityEpoch,
				commandId: `experiment:${a.id}:${type}:${createHash("sha256").update(text).digest("hex")}`,
				workflow: a.workflow,
				command: { type, assignment: a.id, generation: a.generation, attempt: a.attempt, text },
			},
			effectsContext,
		);
		if (result.status !== "accepted") throw new Error(`Experiment evidence not retained: ${result.code}: ${result.reason}`);
	}
}
