import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export type GitMode = "ok" | "fail" | "hang" | "auth" | "missing";

interface GitObservation {
	cwd: string;
	homeIsCwd: boolean;
	xdgIsCwd: boolean;
	globalConfigDisabled: boolean;
	systemConfigDisabled: boolean;
	credentialHelpersDisabled: boolean;
	interactiveCredentialsDisabled: boolean;
	promptDisabled: boolean;
	askpassCleared: boolean;
	unexpectedGitVariables: string[];
	ambientProxyVariables: string[];
	proxyRoute: "direct" | "project" | "unexpected";
	wouldAuthenticate: boolean;
}

export function fakeGit(
	mode: GitMode,
	options: { env?: Record<string, string>; proxy?: string } = {},
) {
	const root = mkdtempSync(join(tmpdir(), "tau-webkit-git-test-"));
	const bin = join(root, "bin");
	const log = join(root, "git.log");
	const observation = join(root, "environment.json");
	const tempRoot = join(root, "clones");
	for (const dir of [bin, tempRoot]) mkdirSync(dir);
	writeFileSync(
		join(bin, "git"),
		String.raw`#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const env = process.env;
const args = process.argv.slice(2);
const log = ${JSON.stringify(log)};
fs.appendFileSync(log, args.join(" ") + "\n");
fs.appendFileSync(log, "prompt=" + (env.GIT_TERMINAL_PROMPT || "") + " gcm=" + (env.GCM_INTERACTIVE || "") + "\n");
const config = {};
const allowed = new Set(["GIT_TERMINAL_PROMPT", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_COUNT"]);
for (let index = 0; index < Number(env.GIT_CONFIG_COUNT || 0); index++) {
  config[env["GIT_CONFIG_KEY_" + index]] = env["GIT_CONFIG_VALUE_" + index];
  allowed.add("GIT_CONFIG_KEY_" + index);
  allowed.add("GIT_CONFIG_VALUE_" + index);
}
const result = {
  cwd: process.cwd(),
  homeIsCwd: !!env.HOME && fs.existsSync(env.HOME) && fs.realpathSync(env.HOME) === process.cwd(),
  xdgIsCwd: !!env.XDG_CONFIG_HOME && fs.existsSync(env.XDG_CONFIG_HOME) && fs.realpathSync(env.XDG_CONFIG_HOME) === process.cwd(),
  globalConfigDisabled: env.GIT_CONFIG_GLOBAL === "/dev/null",
  systemConfigDisabled: env.GIT_CONFIG_NOSYSTEM === "1" && env.GIT_CONFIG_SYSTEM === "/dev/null",
  credentialHelpersDisabled: config["credential.helper"] === "",
  interactiveCredentialsDisabled: config["credential.interactive"] === "false",
  promptDisabled: env.GIT_TERMINAL_PROMPT === "0" && env.GCM_INTERACTIVE === "Never",
  askpassCleared: !env.GIT_ASKPASS && !env.SSH_ASKPASS,
  unexpectedGitVariables: Object.keys(env).filter(key => /^GIT_/i.test(key) && !allowed.has(key)),
  ambientProxyVariables: Object.keys(env).filter(key => /^(http|https|all|no)_proxy$/i.test(key)),
  proxyRoute: config["http.proxy"] === "" ? "direct" : config["http.proxy"] === ${JSON.stringify(options.proxy ?? null)} ? "project" : "unexpected",
};
result.wouldAuthenticate = !(result.homeIsCwd && result.globalConfigDisabled && result.systemConfigDisabled && result.credentialHelpersDisabled && result.askpassCleared && result.unexpectedGitVariables.length === 0);
fs.writeFileSync(${JSON.stringify(observation)}, JSON.stringify(result));
const dest = args.at(-1);
fs.mkdirSync(path.join(dest, "src"), { recursive: true });
fs.writeFileSync(path.join(dest, "README.md"), "# Fixture README\n");
fs.writeFileSync(path.join(dest, "src/file.ts"), "export const answer = 42;\n");
if (${JSON.stringify(mode)} === "fail" || (${JSON.stringify(mode)} === "auth" && !result.wouldAuthenticate)) {
  process.stderr.write("fixture failure " + ${JSON.stringify(options.proxy ?? "")} + "\n");
  process.exit(1);
}
if (${JSON.stringify(mode)} === "hang") setInterval(() => {}, 1000);
else fs.appendFileSync(log, "done\n");
`,
		{ mode: 0o755 },
	);
	if (mode === "missing") rmSync(join(bin, "git"));
	const changes = {
		...options.env,
		PATH:
			mode === "missing" ? bin : `${bin}${delimiter}${process.env.PATH ?? ""}`,
	};
	const original = new Map(
		Object.keys(changes).map((key) => [key, process.env[key]]),
	);
	Object.assign(process.env, changes);
	return {
		tempRoot,
		log: () => (existsSync(log) ? readFileSync(log, "utf8") : ""),
		environment: (): GitObservation =>
			JSON.parse(readFileSync(observation, "utf8")),
		owned: () =>
			readdirSync(tempRoot).filter((name) =>
				name.startsWith("tau-webkit-clone-"),
			),
		restore: () => {
			for (const [key, value] of original) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			rmSync(root, { recursive: true, force: true });
		},
	};
}
