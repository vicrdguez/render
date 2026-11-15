import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import {
	lstat,
	mkdir,
	readdir,
	readlink,
	rename,
	stat,
	symlink,
	unlink,
} from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

async function reload(socketPath) {
	return new Promise((resolve, reject) => {
		const socket = net.connect(socketPath);
		let reply = "";
		socket.setEncoding("utf8");
		socket.on("data", (chunk) => {
			reply += chunk;
		});
		socket.on("end", () => {
			try {
				resolve(JSON.parse(reply));
			} catch (error) {
				reject(error);
			}
		});
		socket.on("error", (error) => {
			if (error.code === "ENOENT" || error.code === "ECONNREFUSED")
				resolve(undefined);
			else reject(error);
		});
		socket.end(`${JSON.stringify({ command: "extension_reload" })}\n`);
	});
}

function registerRoot(link, target) {
	// Nix's indirect root records the out-link's path, so a rename alone loses it.
	const root = spawnSync(
		"nix-store",
		["--add-root", link, "--indirect", "--realise", target],
		{ stdio: "inherit" },
	);
	if (root.error) throw root.error;
	if (root.status !== 0)
		throw new Error(
			`Could not register the garbage-collection root at ${link}.`,
		);
}

function printReload(report) {
	if (report.status !== "applied") {
		process.stderr.write(
			report.status === "refused"
				? "tau: reload refused; old code still runs.\n"
				: "tau: restart required; publication did not finish.\n",
		);
		for (const f of report.failures)
			process.stderr.write(
				`tau: ${f.name}${f.path === undefined ? "" : ` ${f.path}`} ${f.stage}: ${f.message}\n`,
			);
		if (report.reached !== undefined)
			process.stderr.write(
				`tau: reached ${report.reached.project} extension=${report.reached.extension}\n`,
			);
		return 1;
	}
	for (const e of report.extensions)
		process.stdout.write(
			`${e.status} ${e.name}; projects: ${e.projects.join(", ") || "none"}\n`,
		);
	for (const t of report.tasks) {
		const reason =
			t.status === "migration-needed-on-reservation"
				? `will block when it next wakes: no migration from ${t.stored} to ${t.installed}`
				: t.reason;
		process.stdout.write(
			`${t.status} ${t.project} task=${t.task} kind=${t.kind} conversation=${t.conversation} version=${t.stored}->${t.installed} ${reason}${t.until === undefined ? "" : ` wake=${new Date(t.until).toISOString()}`}${t.message === undefined ? "" : `: ${t.message}`}\n`,
		);
	}
	for (const p of report.skipped)
		process.stdout.write(`skipped ${p.project}: ${p.reason}\n`);
	process.stdout.write(
		`total: ${report.extensions.length} extensions; ${report.tasks.length} tasks; ${report.skipped.length} skipped projects\n`,
	);
	return report.tasks.length ||
		report.skipped.length ||
		report.extensions.some((e) => e.status === "kept")
		? 3
		: 0;
}

const names = JSON.parse(process.argv[2]);
let args;
try {
	args = parseArgs({
		args: process.argv.slice(3),
		allowPositionals: true,
		options: { home: { type: "string", default: join(homedir(), ".tau") } },
	});
	if (args.positionals.length > 1) throw new Error("Choose one extension.");
} catch {
	process.stderr.write("usage: install-extension [--home DIR] [NAME]\n");
	process.exit(2);
}
const directory = join(
	resolve(process.env.TAU_INVOCATION_DIR ?? process.cwd(), args.values.home),
	"extensions",
);
for (const entry of await readdir(directory).catch((error) => {
	if (error.code !== "ENOENT") throw error;
	return [];
})) {
	if (
		!names.some(
			(name) =>
				entry.startsWith(`.${name}-`) &&
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
					entry.slice(name.length + 2),
				),
		)
	)
		continue;
	const file = join(directory, entry);
	if ((await lstat(file)).isSymbolicLink()) await unlink(file);
}
const name = args.positionals[0];
if (name === undefined) {
	for (const available of names) {
		const installed = await stat(join(directory, available)).catch((error) => {
			if (error.code !== "ENOENT") throw error;
		});
		process.stdout.write(
			`${available}${installed?.isDirectory() ? " (installed)" : ""}\n`,
		);
	}
} else {
	if (!names.includes(name)) {
		process.stderr.write(
			`Unknown extension ${name}. Choose ${names.join(", ")}.\n`,
		);
		process.exit(2);
	}
	const untracked = execFileSync(
		"git",
		["ls-files", "--others", "--exclude-standard", "--", `extensions/${name}/`],
		{ encoding: "utf8" },
	).trim();
	if (untracked)
		process.stderr.write(
			`Warning: untracked extension files:\n${untracked}\nThe flake sees only tracked files. Use git add before installing them.\n`,
		);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const link = join(directory, name);
	const existing = await lstat(link).catch((error) => {
		if (error.code !== "ENOENT") throw error;
	});
	if (existing && !existing.isSymbolicLink()) {
		process.stderr.write(
			`Refusing to replace ${existing.isDirectory() ? "directory" : "file"} at ${link}.\n`,
		);
		process.exit(1);
	}
	const previous = existing ? await readlink(link) : undefined;
	const temporary = join(directory, `.${name}-${randomUUID()}`);
	let child;
	for (const [signal, code] of [
		["SIGTERM", 143],
		["SIGINT", 130],
	])
		process.once(signal, () => {
			child?.kill(signal);
			try {
				unlinkSync(temporary);
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
			}
			process.exit(code);
		});
	try {
		const status = await new Promise((resolve, reject) => {
			child = spawn(
				"nix",
				["build", `.#extension-${name}`, "--out-link", temporary],
				{ stdio: "inherit" },
			);
			child.once("error", reject);
			child.once("exit", resolve);
		});
		if (status !== 0) process.exitCode = status ?? 1;
		else {
			const target = await readlink(temporary);
			await rename(temporary, link);
			registerRoot(link, target);
			const result = await reload(join(directory, "..", "admin.sock"));
			if (result?.reload?.status === "refused" || result?.error) {
				if (previous === undefined) await unlink(link);
				else {
					await symlink(previous, temporary);
					await rename(temporary, link);
					registerRoot(link, previous);
				}
				if (result.error) process.stderr.write(`tau: ${result.error}\n`);
				else printReload(result.reload);
				process.stderr.write(
					`Install refused; ${previous === undefined ? "no previous version was installed; the new link was removed" : "the previous version is still installed"}.\n`,
				);
				process.exitCode = 1;
			} else if (result === undefined) {
				process.stdout.write(
					`Installed ${name} at ${link}.\nNo Tau server is running. The extension loads at the next start.\n`,
				);
			} else {
				process.exitCode = printReload(result.reload);
				if (result.reload.status === "applied")
					process.stdout.write(`Installed ${name} at ${link}.\n`);
			}
		}
	} finally {
		await unlink(temporary).catch((error) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
}
