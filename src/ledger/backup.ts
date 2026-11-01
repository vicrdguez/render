// Ledger's asynchronous scheduling/status. Local acknowledgement never waits for a destination.
import { rm } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { BackupState } from "./backup-state.ts";
import { type OffHostDestination, transferPackage } from "./offhost.ts";
import type { createRecoveryPackage } from "./recovery.ts";

export type BackupClock = { now(): number; setTimeout(run: () => void, ms: number): object; clearTimeout(timer: object): void };
export const realBackupClock: BackupClock = {
	now: () => Date.now(),
	setTimeout: (run, ms) => setTimeout(run, ms),
	clearTimeout: (timer) => clearTimeout(timer as NodeJS.Timeout),
};

export class Backup {
	readonly #destination: OffHostDestination | undefined;
	readonly #clock: BackupClock;
	readonly #state: () => BackupState;
	readonly #save: (update: (state: BackupState) => void) => Promise<void>;
	readonly #scratch: string;
	readonly #package: (root: string) => ReturnType<typeof createRecoveryPackage>;
	readonly #changed: () => void;
	#timer: object | undefined;
	#due = Infinity;
	#running: Promise<void> | undefined;
	#closed = false;
	#promptPending = false;
	#phase = "idle";
	#reason: string | null = null;

	constructor(options: {
		destination?: OffHostDestination;
		clock: BackupClock;
		state(): BackupState;
		save(update: (state: BackupState) => void): Promise<void>;
		scratch: string;
		package(root: string): ReturnType<typeof createRecoveryPackage>;
		changed(): void;
	}) {
		this.#destination = options.destination;
		this.#clock = options.clock;
		this.#state = options.state;
		this.#save = options.save;
		this.#scratch = options.scratch;
		this.#package = options.package;
		this.#changed = options.changed;
		if (this.#state().lastAttempt?.outcome === "failed") this.#phase = "failed";
	}

	schedule(prompt: boolean): void {
		if (this.#closed || !this.#destination || this.#state().pending.length === 0) return;
		if (this.#running) {
			this.#promptPending ||= prompt;
			return;
		}
		const due = this.#clock.now() + (prompt ? 1000 : 60000);
		if (due >= this.#due) return;
		if (this.#timer) this.#clock.clearTimeout(this.#timer);
		this.#due = due;
		this.#timer = this.#clock.setTimeout(
			() => {
				this.#timer = undefined;
				this.#due = Infinity;
				this.#running = this.#run().finally(() => {
					this.#running = undefined;
					const prompt = this.#promptPending;
					this.#promptPending = false;
					this.schedule(prompt);
				});
			},
			Math.max(0, due - this.#clock.now()),
		);
	}

	status() {
		const b = this.#state();
		const oldest = b.pending[0];
		const exposure = oldest === undefined ? 0 : oldest.at === null ? null : Math.max(0, (this.#clock.now() - oldest.at) / 1000);
		const overrun = (exposure !== null && exposure > 300) || (b.lastAttempt?.windowSeconds ?? 0) > 300;
		return {
			targetExposedWorkSeconds: 300,
			phase: !this.#destination ? "unconfigured" : this.#phase !== "failed" && this.#timer ? "scheduled" : this.#phase,
			health: !this.#destination ? "unavailable" : !b.verified || overrun || b.lastAttempt?.outcome === "failed" ? "warning" : "healthy",
			reason: !this.#destination
				? "Off-host destination/tool provisioning is missing; local work continues without new protection."
				: (this.#reason ??
					(b.lastAttempt?.outcome === "failed" ? "Last backup failed; check destination/tool and supported-package prerequisites." : null)),
			generation: b.verified?.id ?? null,
			verifiedOffHostCutoffSequence: b.verified?.cutoff ?? null,
			cutoffRecordedAt: b.verified?.cutoffRecordedAt ?? null,
			verifiedOffHostAt: b.verified?.verifiedAt ?? null,
			unprotectedAcknowledgedWork: oldest !== undefined,
			exposedWorkSeconds: exposure,
			exposureTimeKnown: exposure !== null,
			targetOverrun: overrun,
			lastWindowSeconds: b.lastAttempt?.windowSeconds ?? null,
			lastAttemptDurationMs: b.lastAttempt?.durationMs ?? null,
			restoreVerified: false,
		};
	}

	async #run(): Promise<void> {
		if (!this.#destination) return;
		const start = this.#clock.now();
		const measured = performance.now();
		const oldest = this.#state().pending[0]?.at;
		const window = () =>
			oldest === null || oldest === undefined
				? null
				: Math.max(0, this.#clock.now() - oldest, start - oldest + performance.now() - measured) / 1000;
		try {
			this.#phase = "snapshotting";
			this.#changed();
			// One attempt at a time under the host owner lock. Reclaim SIGKILL leftovers before allocating again.
			// This directory is disposable; explicit operator recovery packages live elsewhere.
			await rm(this.#scratch, { recursive: true, force: true });
			let local: Awaited<ReturnType<typeof createRecoveryPackage>>;
			let cutoffRecordedAt: number;
			try {
				local = await this.#package(this.#scratch);
				cutoffRecordedAt = this.#clock.now();
				this.#phase = "transferring";
				this.#changed();
				await transferPackage(local.path, this.#destination);
			} finally {
				await rm(this.#scratch, { recursive: true, force: true });
			}
			await this.#save((b) => {
				b.verified = {
					id: local.id,
					cutoff: local.cutoff,
					cutoffRecordedAt,
					verifiedAt: this.#clock.now(),
					digest: local.files["render.db"],
				};
				b.pending = b.pending.filter((p) => p.sequence > local.cutoff);
				b.lastAttempt = {
					outcome: "verified",
					completedAt: this.#clock.now(),
					durationMs: performance.now() - measured,
					windowSeconds: window(),
				};
			});
			this.#phase = "verified";
			this.#reason = null;
		} catch (error) {
			this.#phase = "failed";
			// Debt: exercise this warning with retained role work and continued saves at the backup seam.
			this.#reason =
				error instanceof Error && error.message.includes("invalid_recovery_package")
					? "Package unavailable: retained state requires compatible recovery/reconciliation."
					: "Off-host transfer or durable verification failed; last verified generation retained. Check destination/tool provisioning.";
			try {
				await this.#save((b) => {
					b.lastAttempt = {
						outcome: "failed",
						completedAt: this.#clock.now(),
						durationMs: performance.now() - measured,
						windowSeconds: window(),
					};
				});
			} catch {
				this.#reason = "Backup status could not be persisted; no new protected cutoff is claimed.";
			}
		} finally {
			this.#changed();
		}
	}

	async close(): Promise<void> {
		this.#closed = true;
		if (this.#timer) this.#clock.clearTimeout(this.#timer);
		await this.#running;
	}
}
