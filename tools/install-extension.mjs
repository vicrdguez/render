import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readlink, rename, stat, unlink } from "node:fs/promises";
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
		["ls-files", "--others", "--exclude-standard", "--", `packages/${name}/`],
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
		const kind = existing.isDirectory() ? "directory" : "file";
		process.stderr.write(`Refusing to replace ${kind} at ${link}.\n`);
		process.exit(1);
	}
	const temporary = join(directory, `.${name}-${randomUUID()}`);
	try {
		const build = spawnSync(
			"nix",
			["build", `.#extension-${name}`, "--out-link", temporary],
			{ stdio: "inherit" },
		);
		if (build.error) throw build.error;
		if (build.status !== 0) process.exitCode = build.status ?? 1;
		else {
			const target = await readlink(temporary);
			await rename(temporary, link);
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
			process.stdout.write(`Installed ${name} at ${link}.\n`);
			const result = await reload(join(directory, "..", "admin.sock"));
			if (result === undefined)
				process.stdout.write(
					"No Tau server is running. The extension loads at the next start.\n",
				);
			else {
				process.stdout.write(`${JSON.stringify(result)}\n`);
				if (result.error || result.reload?.status !== "applied")
					process.exitCode = 1;
				else if (
					result.reload.tasks.length ||
					result.reload.skipped.length ||
					result.reload.extensions.some((e) => e.status === "kept")
				)
					process.exitCode = 3;
			}
		}
	} finally {
		await unlink(temporary).catch((error) => {
			if (error.code !== "ENOENT") throw error;
		});
	}
}
