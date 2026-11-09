// Composition root: one authoritative host process. Startup order and admission are Ledger's; Engine supplies the
// fixed runtime configuration.
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import { fromPromise } from "../effect.ts";
import { secretsFile } from "../engine/credentials.ts";
import type { Family } from "../engine/providers.ts";
import { Engine, type OwnedChecks } from "../engine/runtime.ts";
import type { Persistence } from "../kernel/kernel.ts";
import { adminServer, deviceServer } from "../ledger/http.ts";
import type { Ledger } from "../ledger/ledger.ts";
import { openLedger } from "../ledger/startup.ts";

export type Host = {
	readonly url: string;
	readonly admin: string;
	readonly ledger: Ledger;
	readonly authorityEpoch: string;
	readonly executorEpoch: string;
	readonly persistence: Persistence;
	close(): Effect.Effect<void, unknown>;
};

export type OpenHostOptions = {
	readonly data: string;
	readonly port?: number;
	readonly hostname?: string;
	readonly ownedChecks?: OwnedChecks;
	/** pi's login file (`--pi-auth`). Without it every pi-login family reports `native_provider_configuration_missing`. */
	readonly piAuth?: string;
	readonly onFatal?: (error: unknown) => void;
};

/** Claude writers and ChatGPT reviewers through the operator's pi logins, until Engine settings own the table. */
const FAMILIES: readonly Family[] = [
	{ name: "claude", provider: "anthropic", auth: "pi-login" },
	{ name: "chatgpt", provider: "openai", auth: "pi-login" },
];

export function openHost(options: OpenHostOptions): Effect.Effect<Host, unknown> {
	return Effect.gen(function* () {
		// Acquisition must not close this scope on success; Host.close owns its lifetime.
		const scope = yield* Scope.make();
		return yield* Effect.gen(function* () {
			const opened = yield* openLedger({
				data: options.data,
				runtime: (report) =>
					new Engine({
						ownedChecks: options.ownedChecks,
						families: FAMILIES,
						piAuth: options.piAuth,
						secrets: secretsFile(join(options.data, "secrets.json")),
					}).options(report),
				onFatal: (error) => options.onFatal?.(error),
			});
			yield* Scope.addFinalizer(scope, opened.close().pipe(Effect.orDie));
			const socketPath = join(options.data, "admin.sock");
			const admin = yield* adminServer(opened.ledger, socketPath);
			yield* Scope.addFinalizer(scope, closeServer(admin));
			const listener = deviceServer(opened.ledger);
			yield* Scope.addFinalizer(scope, closeServer(listener));
			yield* fromPromise(
				() =>
					new Promise<void>((resolve, reject) => {
						listener.once("error", reject);
						listener.listen(options.port ?? 0, options.hostname ?? "127.0.0.1", () => resolve());
					}),
			);
			const address = listener.address() as AddressInfo;
			return {
				url: `http://${address.address}:${address.port}`,
				admin: socketPath,
				ledger: opened.ledger,
				authorityEpoch: opened.authorityEpoch,
				executorEpoch: opened.executorEpoch,
				persistence: opened.persistence,
				close: () => Scope.close(scope, Exit.void),
			};
		}).pipe(Effect.catchCause((cause) => Scope.close(scope, Exit.failCause(cause)).pipe(Effect.flatMap(() => Effect.failCause(cause)))));
	}).pipe(Effect.uninterruptible);
}

function closeServer(server: Server): Effect.Effect<void> {
	return fromPromise(
		() =>
			new Promise<void>((resolve) => {
				server.closeAllConnections();
				server.close(() => resolve());
			}),
	).pipe(Effect.orDie);
}
