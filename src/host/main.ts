// `render serve --data <dir> [--port <n>] [--host <addr>]`. Events are one JSON object per line: `ready` on stdout,
// startup refusals and failures on stderr. Exit codes: 0 stopped, 1 host failure, 2 startup blocked, 3 store owned.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { type OffHostDestination, receivePackage } from "../ledger/offhost.ts";
import { managedRestore, StartupFailure } from "../ledger/startup.ts";
import { type Host, openHost } from "./host.ts";

function emit(stream: NodeJS.WriteStream, event: Record<string, unknown>): void {
	stream.write(`${JSON.stringify(event)}\n`);
}

async function main(): Promise<void> {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: { data: { type: "string" }, port: { type: "string" }, host: { type: "string" }, package: { type: "string" } },
	});
	if (positionals[0] === "backup-receive" && values.data !== undefined) {
		try {
			emit(process.stdout, await receivePackage(values.data, process.stdin));
		} catch {
			emit(process.stderr, { event: "backup_refused", reason: "Invalid package or destination unavailable." });
			process.exitCode = 2;
		}
		return;
	}
	if (positionals[0] === "restore" && values.data !== undefined && values.package !== undefined) {
		try {
			await managedRestore(values.data, values.package);
			emit(process.stdout, {
				event: "restored",
				mode: "admission-disabled",
				action: "Start the host; validate/repair through local admin. No remote admission is enabled.",
			});
		} catch (error) {
			emit(process.stderr, {
				event: "restore_refused",
				reason: String(error),
				action: "Preserve existing data and the package; retry in a clean directory. Failed imports remain admission-disabled.",
			});
			process.exitCode = 2;
		}
		return;
	}
	if (positionals[0] !== "serve" || values.data === undefined) {
		process.stderr.write("usage: render serve --data <dir> [--port <n>] [--host <addr>]\n");
		process.exit(64);
	}
	let host: Host | undefined;
	let failed = false;
	const onFatal = (error: unknown) => {
		if (failed) return;
		failed = true;
		emit(process.stderr, {
			event: "host_failed",
			reason: error instanceof Error ? error.message : String(error),
			action: "Storage failed; the host stopped without acknowledging the failed commit. Free space or repair storage, then restart.",
		});
		// Let in-flight outcome_unknown replies flush, then stop.
		setTimeout(() => process.exit(1), 250);
	};
	try {
		// Explicit operator-owned configuration, never ambient agent/provider configuration.
		let backup: OffHostDestination | undefined;
		if (process.env.RENDER_BACKUP_CONFIG !== undefined) {
			try {
				const config = JSON.parse(await readFile(process.env.RENDER_BACKUP_CONFIG, "utf8")) as OffHostDestination;
				if (!config || typeof config.sshHost !== "string" || typeof config.receiver !== "string" || typeof config.directory !== "string")
					throw new Error("Invalid backup configuration");
				backup = config;
			} catch {
				emit(process.stderr, {
					event: "backup_unconfigured",
					reason: "Backup configuration unavailable or invalid; local work continues without new off-host protection.",
				});
			}
		}
		host = await openHost({
			backup,
			data: values.data,
			port: values.port === undefined ? 0 : Number(values.port),
			hostname: values.host ?? "127.0.0.1",
			onFatal,
		});
	} catch (error) {
		if (error instanceof StartupFailure) {
			emit(process.stderr, { event: error.event, code: error.code, detail: error.detail, action: error.action });
			process.exit(error.event === "startup_refused" ? 3 : 2);
		}
		emit(process.stderr, { event: "startup_failed", reason: error instanceof Error ? error.message : String(error) });
		process.exit(1);
	}
	emit(process.stdout, {
		event: "ready",
		url: host.url,
		admin: host.admin,
		authorityEpoch: host.authorityEpoch,
		executorEpoch: host.executorEpoch,
		persistence: host.persistence,
	});
	const stop = () => {
		const h = host;
		host = undefined;
		if (h === undefined) return;
		h.close().then(
			() => process.exit(0),
			() => process.exit(1),
		);
	};
	process.on("SIGTERM", stop);
	process.on("SIGINT", stop);
}

await main();
