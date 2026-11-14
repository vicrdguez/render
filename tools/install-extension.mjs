import { execFileSync, spawnSync } from "node:child_process";
import { lstat, mkdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

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
	for (const flags of [["--no-link"], ["--out-link", link]]) {
		const build = spawnSync("nix", ["build", `.#extension-${name}`, ...flags], {
			stdio: "inherit",
		});
		if (build.error) process.stderr.write(`${build.error.message}\n`);
		if (build.status !== 0) process.exit(build.status ?? 1);
		if (flags[0] === "--no-link" && existing?.isSymbolicLink())
			await unlink(link);
	}
	process.stdout.write(
		`Installed ${name} at ${link}.\nRestart tau to load the installed extension.\n`,
	);
}
