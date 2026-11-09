// The runtime `render serve` wires from its data directory and flags: a host-private owned root for project mirrors and
// sandboxes, the GitHub forge authenticated by the host secrets file, and pi's login file. Projects, settings and check
// images come from Ledger, so nothing here names a repository. Missing Docker, token or login never stops the host;
// readiness reports it, and the work that needs it blocks.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ForgeConfig } from "../effects/forge.ts";
import type { Engine } from "../engine/runtime.ts";
import type { Secrets } from "./secrets.ts";

export type Readiness = Readonly<Record<"effects" | "sandboxes" | "forge" | "logins", "ready" | { readonly blocked: string }>>;
export type GitHubEndpoints = { readonly api: string; readonly git: string };
export const GITHUB: GitHubEndpoints = { api: "https://api.github.com", git: "https://github.com" };

export function production(options: {
	readonly data: string;
	readonly secrets: Secrets;
	readonly piAuth: string | undefined;
	readonly github: GitHubEndpoints;
}): { readonly engine: NonNullable<ConstructorParameters<typeof Engine>[0]>; readiness(): Promise<Readiness> } {
	const owned = join(options.data, "owned");
	const actors = new Map<string, Promise<string>>();
	const forge: ForgeConfig = {
		...options.github,
		token: () => {
			const token = options.secrets.read("github-token");
			if (!token) throw new Error("github_token_missing: set the github-token secret");
			return token;
		},
		// The login is a fact of the token, so a replaced token is looked up afresh.
		actor: async () => {
			const token = forge.token();
			let login = actors.get(token);
			if (!login) {
				login = githubLogin(options.github.api, token);
				actors.set(token, login);
				login.catch(() => actors.delete(token));
			}
			return login;
		},
	};
	return {
		engine: {
			piAuth: options.piAuth,
			secrets: options.secrets,
			ownedChecks: { root: owned, checks: {} },
			investigations: { root: join(owned, "investigations") },
			forge,
		},
		readiness: async () => {
			const [git, docker, actor] = await Promise.all([
				run("git", ["--version"]),
				run("docker", ["version", "--format", "{{.Server.Version}}"]),
				forge.actor().then(
					() => undefined,
					(error: Error) => error.message,
				),
			]);
			return {
				effects: "error" in git ? { blocked: `git_unavailable: ${git.error}` } : (gitBlocker(git.stdout) ?? "ready"),
				sandboxes: "error" in docker ? { blocked: `docker_unavailable: ${docker.error}` } : "ready",
				forge: actor === undefined ? "ready" : { blocked: actor },
				logins: loginsBlocker(options.piAuth) ?? "ready",
			};
		},
	};
}

async function githubLogin(api: string, token: string): Promise<string> {
	const response = await fetch(`${api}/user`, {
		headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "render" },
		signal: AbortSignal.timeout(10000),
	});
	const login = response.ok ? ((await response.json()) as { login?: unknown }).login : undefined;
	if (typeof login !== "string") throw new Error(`github_token_rejected: GET /user answered ${response.status}`);
	return login;
}

/** Effects keeps its mirrors durable with Git 2.43+ (`fsync=all`). */
function gitBlocker(version: string): { blocked: string } | undefined {
	const [, major, minor] = /git version (\d+)\.(\d+)/.exec(version) ?? [];
	return Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 43) ? undefined : { blocked: `git_unsupported: ${version.trim()}` };
}

function loginsBlocker(piAuth: string | undefined): { blocked: string } | undefined {
	if (piAuth === undefined) return { blocked: "native_provider_configuration_missing: start the host with --pi-auth" };
	try {
		JSON.parse(readFileSync(piAuth, "utf8"));
		return undefined;
	} catch (error) {
		// Never the parser's message: it can quote the file, and the file holds tokens.
		const code = (error as NodeJS.ErrnoException).code;
		return { blocked: `native_provider_configuration_missing: ${code ?? "unreadable JSON"} at ${piAuth}` };
	}
}

function run(file: string, args: string[]): Promise<{ stdout: string } | { error: string }> {
	return new Promise((resolve) =>
		execFile(file, args, { timeout: 10000, encoding: "utf8" }, (error, stdout, stderr) =>
			resolve(error ? { error: (stderr || error.message).trim().split("\n")[0]! } : { stdout }),
		),
	);
}
