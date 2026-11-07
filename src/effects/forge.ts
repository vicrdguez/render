// Forge: an internal Effects submodule (spec §9.2), never a workflow-visible provider. GitHub is the one actual
// adapter; Node's fetch carries REST, and Effects' trusted Git carries source with an expected-old lease. The token
// comes from trusted host configuration and is only ever placed in request headers.
import type { Capabilities, ProposalItem } from "../kernel/publication.ts";

export type ForgeConfig = {
	api: string;
	git: string;
	token: string;
	/** Login of the identity the token belongs to: the only author a reconciled create can have. */
	actor: string;
	/** Pause between publication retries while the forge is unreachable or an outcome is unknown. */
	retryMs?: number;
	repositories: Readonly<Record<string, { owner: string; name: string; base: string }>>;
};
export type ForgeRequest =
	| { type: "publishSource"; proposal: string; commit: string; expected: string | null }
	| { type: "createDraftProposal"; proposal: string; title: string; body: string }
	| { type: "updateProposalSummary"; proposal: string; pr: string; summary: string };
export type ForgeDispatch = {
	outcome: "applied" | "rejected" | "unknown";
	reason: string | null;
	created: string | null;
	head: { commit: string | null } | null;
};
export type ForgeSnapshot = {
	capabilities: Capabilities;
	head: { commit: string | null };
	proposals: { complete: boolean; items: ProposalItem[] };
	observedAt: string;
};
/** Trusted Git against the forge remote: arguments plus extra environment, run on Effects' private store. */
export type RemoteGit = (args: string[], env: Record<string, string>) => Promise<{ stdout: string; exitCode: number | null }>;

const SECTION = /<!-- render:summary:start -->[\s\S]*?<!-- render:summary:end -->/;
const MARKER = /<!-- render:proposal-pr (\S+) -->/;
type Pull = {
	number: number;
	node_id: string;
	state: string;
	draft: boolean;
	merged_at: string | null;
	merge_commit_sha: string | null;
	base: { ref: string };
	body: string | null;
	head: { ref: string; sha: string; repo: { full_name: string } | null };
	user: { login: string } | null;
};

export function forgeBranch(proposal: string): string {
	return `render/${proposal.replace(/[^A-Za-z0-9._-]+/g, "-")}`;
}

export class GitHubForge {
	readonly #config: ForgeConfig;
	readonly #repo: { owner: string; name: string; base: string };
	readonly #git: RemoteGit;
	constructor(config: ForgeConfig, repository: string, git: RemoteGit) {
		const repo = config.repositories[repository];
		if (!repo) throw new Error("Repository has no trusted forge publication target.");
		this.#config = config;
		this.#repo = repo;
		this.#git = git;
	}
	capabilities(): Capabilities {
		return {
			draftProposalPR: true,
			markProposalReady: false,
			guardedSourceUpdate: true,
			createIdempotency: false,
			stableObjectIdentity: true,
			mergeObservation: true,
			observationCompleteness: true,
		};
	}
	/** Read-only. Throws when the forge is unreachable; a later page failing is an incomplete listing, never absence. */
	async observe(proposal: string): Promise<ForgeSnapshot> {
		const head = await this.#head(proposal);
		if (head === undefined) throw new Error("Forge source ref unobservable: remote unreachable.");
		const branch = forgeBranch(proposal);
		const items: ProposalItem[] = [];
		let url: string | null =
			`${this.#base()}/pulls?${new URLSearchParams({ state: "all", head: `${this.#repo.owner}:${branch}`, per_page: "100" })}`;
		let complete = true;
		while (url) {
			const response: Response | undefined = await this.#request("GET", url).catch(() => undefined);
			if (!response?.ok) {
				complete = false;
				break;
			}
			const pulls = (await response.json()) as Pull[];
			for (const p of pulls) {
				if (p.head.ref !== branch || p.head.repo?.full_name !== `${this.#repo.owner}/${this.#repo.name}`) continue;
				items.push({
					id: `github:pr:${p.number}:${p.node_id}`,
					state: p.merged_at ? "merged" : p.state === "open" ? "open" : "closed",
					draft: p.draft === true,
					head: p.head.sha,
					marker: MARKER.exec(p.body ?? "")?.[1] ?? null,
					actor: p.user?.login === this.#config.actor,
					merge: p.merged_at && p.merge_commit_sha ? { main: p.base.ref === this.#repo.base, commit: p.merge_commit_sha } : null,
				});
			}
			url = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1] ?? null;
		}
		return {
			capabilities: this.capabilities(),
			head: { commit: head },
			proposals: { complete, items },
			observedAt: new Date().toISOString(),
		};
	}
	async apply(request: ForgeRequest): Promise<ForgeDispatch> {
		const result = (outcome: ForgeDispatch["outcome"], reason: string | null, created: string | null = null): ForgeDispatch => ({
			outcome,
			reason,
			created,
			head: null,
		});
		const branch = forgeBranch(request.proposal);
		if (request.type === "publishSource") {
			const pushed = await this.#git(
				[
					"push",
					"--porcelain",
					`--force-with-lease=refs/heads/${branch}:${request.expected ?? ""}`,
					this.#remote(),
					`${request.commit}:refs/heads/${branch}`,
				],
				this.#auth(),
			);
			const line = pushed.stdout.split("\n").find((l) => l.endsWith(`refs/heads/${branch}`) || l.includes(`:refs/heads/${branch}\t`));
			const head = await this.#head(request.proposal);
			const seen = head === undefined ? null : { commit: head };
			if (line && pushed.exitCode === 0 && !line.startsWith("!")) return { ...result("applied", null), head: seen };
			if (line?.startsWith("!"))
				return {
					...result("rejected", line.includes("stale info") ? "stale-expected" : `rejected: ${line.split("\t").at(-1)}`),
					head: seen,
				};
			return { ...result("unknown", `push outcome unknown (exit ${pushed.exitCode})`), head: seen };
		}
		if (request.type === "createDraftProposal") {
			const response = await this.#request("POST", `${this.#base()}/pulls`, {
				title: request.title,
				head: branch,
				base: this.#repo.base,
				body: request.body,
				draft: true,
			}).catch((error: Error) => error);
			if (response instanceof Error) return result("unknown", `create reply lost: ${response.name}`);
			if (response.status === 201) {
				const pull = (await response.json().catch(() => undefined)) as Pull | undefined;
				return pull ? result("applied", null, `github:pr:${pull.number}:${pull.node_id}`) : result("unknown", "unreadable create reply");
			}
			const text = await response.text().catch(() => "");
			if (response.status === 422 && /draft pull requests are not supported/i.test(text)) return result("rejected", "draft-unsupported");
			return response.status >= 400 && response.status < 500
				? result("rejected", `http-${response.status}`)
				: result("unknown", `http-${response.status}`);
		}
		const number = /^github:pr:(\d+):/.exec(request.pr)?.[1];
		if (!number) return result("rejected", "foreign-pr-id");
		const url = `${this.#base()}/pulls/${number}`;
		const current = await this.#request("GET", url).catch((error: Error) => error);
		if (current instanceof Error || current.status >= 500) return result("unknown", "summary read failed");
		if (!current.ok) return result("rejected", `http-${current.status}`);
		const body = ((await current.json()) as Pull).body ?? "";
		const next = SECTION.test(body) ? body.replace(SECTION, () => request.summary) : `${body}\n\n${request.summary}`;
		const patched = await this.#request("PATCH", url, { body: next }).catch((error: Error) => error);
		if (patched instanceof Error) return result("unknown", `summary reply lost: ${patched.name}`);
		if (patched.ok) return result("applied", null);
		return patched.status < 500 ? result("rejected", `http-${patched.status}`) : result("unknown", `http-${patched.status}`);
	}
	/** The authorized source ref's head; `null` when absent, `undefined` when the remote cannot be read. */
	async #head(proposal: string): Promise<string | null | undefined> {
		const ref = `refs/heads/${forgeBranch(proposal)}`;
		const listed = await this.#git(["ls-remote", this.#remote(), ref], this.#auth());
		if (listed.exitCode !== 0) return undefined;
		return (
			listed.stdout
				.split("\n")
				.find((l) => l.endsWith(`\t${ref}`))
				?.split("\t")[0] ?? null
		);
	}
	#base(): string {
		return `${this.#config.api}/repos/${this.#repo.owner}/${this.#repo.name}`;
	}
	#remote(): string {
		return `${this.#config.git}/${this.#repo.owner}/${this.#repo.name}.git`;
	}
	#auth(): Record<string, string> {
		return {
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "http.extraHeader",
			GIT_CONFIG_VALUE_0: `Authorization: Basic ${Buffer.from(`x-access-token:${this.#config.token}`).toString("base64")}`,
		};
	}
	#request(method: string, url: string, body?: unknown): Promise<Response> {
		return fetch(url, {
			method,
			headers: {
				authorization: `Bearer ${this.#config.token}`,
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
				"user-agent": "render",
				...(body === undefined ? {} : { "content-type": "application/json" }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			signal: AbortSignal.timeout(30000),
		});
	}
}
