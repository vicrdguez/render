// An owned local fake GitHub: REST pulls endpoints plus smart-HTTP Git through `git http-backend`, with controlled
// faults. Never a live GitHub service; it accepts only the one configured token.
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./source.ts";

export const TOKEN = "ghp_fixtureTOKENnotreal0123456789abcdef";
export type Pull = {
	number: number;
	node_id: string;
	title: string;
	body: string;
	draft: boolean;
	state: "open" | "closed";
	merged_at: string | null;
	head: { ref: string; sha: string; repo: { full_name: string } };
	base: { ref: string };
	user: { login: string };
};
export type Faults = {
	/** Apply the create, then drop the connection before any reply. */
	dropCreateReply?: boolean;
	/** Apply the summary PATCH, then drop the connection. */
	dropPatchReply?: boolean;
	/** PRs created while set stay out of listings until `reveal()`. */
	lagListing?: boolean;
	draftUnsupported?: boolean;
	/** Listing page that answers 500. */
	failPage?: number;
};

export async function fakeGitHub(options: { owner?: string; name?: string; actor?: string } = {}) {
	const owner = options.owner ?? "octo";
	const name = options.name ?? "render";
	const actor = options.actor ?? "render-bot";
	const root = await mkdtemp(join(tmpdir(), "render-fake-github-"));
	const repo = join(root, owner, `${name}.git`);
	execFileSync("git", ["init", "--bare", "-q", repo], {
		env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
	});
	const pulls: Pull[] = [];
	const hidden = new Set<number>();
	const requests: { method: string; path: string; body: string; authorization: string | undefined }[] = [];
	const faults: Faults = {};
	const full = `${owner}/${name}`;
	const branchHead = (ref: string) => {
		try {
			return git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${ref}`])
				.toString()
				.trim();
		} catch {
			return null;
		}
	};
	const json = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
		res.writeHead(status, { "content-type": "application/json", ...headers });
		res.end(JSON.stringify(value));
	};
	const pullsPath = `/repos/${full}/pulls`;
	async function handle(req: IncomingMessage, res: ServerResponse, body: Buffer) {
		const url = new URL(req.url ?? "/", "http://fake");
		requests.push({
			method: req.method ?? "",
			path: url.pathname + url.search,
			body: body.toString(),
			authorization: req.headers.authorization,
		});
		if (url.pathname.startsWith("/git/")) {
			if (req.headers.authorization !== `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`) {
				res.writeHead(401, { "www-authenticate": 'Basic realm="fake"' });
				return res.end();
			}
			return backend(req, res, url, body);
		}
		if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { message: "Bad credentials" });
		if (url.pathname === pullsPath && req.method === "GET") {
			const head = url.searchParams.get("head");
			const page = Number(url.searchParams.get("page") ?? "1");
			const per = Number(url.searchParams.get("per_page") ?? "30");
			if (faults.failPage === page) return json(res, 500, { message: "Server Error" });
			const all = pulls.filter((p) => !hidden.has(p.number) && (!head || `${owner}:${p.head.ref}` === head));
			const items = all.slice((page - 1) * per, page * per);
			const next =
				page * per < all.length
					? {
							link: `<http://${req.headers.host}${pullsPath}?${new URLSearchParams({ ...Object.fromEntries(url.searchParams), page: String(page + 1) })}>; rel="next"`,
						}
					: {};
			return json(res, 200, items, next);
		}
		if (url.pathname === pullsPath && req.method === "POST") {
			const input = JSON.parse(body.toString()) as { title: string; head: string; base: string; body: string; draft?: boolean };
			if (faults.draftUnsupported && input.draft)
				return json(res, 422, {
					message: "Validation Failed",
					errors: [{ message: "Draft pull requests are not supported in this repository." }],
				});
			const sha = branchHead(input.head);
			if (!sha) return json(res, 422, { message: "Validation Failed", errors: [{ field: "head", code: "invalid" }] });
			const number = pulls.length + 1;
			const pull: Pull = {
				number,
				node_id: `PR_node${number}`,
				title: input.title,
				body: input.body,
				draft: input.draft === true,
				state: "open",
				merged_at: null,
				head: { ref: input.head, sha, repo: { full_name: full } },
				base: { ref: input.base },
				user: { login: actor },
			};
			pulls.push(pull);
			if (faults.lagListing) hidden.add(number);
			if (faults.dropCreateReply) return req.socket.destroy();
			return json(res, 201, pull);
		}
		const one = new RegExp(`^${pullsPath}/(\\d+)$`).exec(url.pathname);
		const pull = one ? pulls.find((p) => p.number === Number(one[1])) : undefined;
		if (pull && req.method === "GET")
			return json(res, 200, { ...pull, head: { ...pull.head, sha: branchHead(pull.head.ref) ?? pull.head.sha } });
		if (pull && req.method === "PATCH") {
			const input = JSON.parse(body.toString()) as { body?: string };
			if (typeof input.body === "string") pull.body = input.body;
			if (faults.dropPatchReply) return req.socket.destroy();
			return json(res, 200, pull);
		}
		return json(res, 404, { message: "Not Found" });
	}
	function backend(req: IncomingMessage, res: ServerResponse, url: URL, body: Buffer) {
		const child = spawn("git", ["http-backend"], {
			env: {
				PATH: process.env.PATH,
				GIT_PROJECT_ROOT: root,
				GIT_HTTP_EXPORT_ALL: "1",
				GIT_CONFIG_NOSYSTEM: "1",
				GIT_CONFIG_GLOBAL: "/dev/null",
				REMOTE_USER: actor,
				REQUEST_METHOD: req.method ?? "GET",
				PATH_INFO: url.pathname.slice("/git".length),
				QUERY_STRING: url.search.slice(1),
				CONTENT_TYPE: req.headers["content-type"] ?? "",
				CONTENT_LENGTH: String(body.length),
				HTTP_CONTENT_ENCODING: String(req.headers["content-encoding"] ?? ""),
				GIT_PROTOCOL: String(req.headers["git-protocol"] ?? ""),
			},
		});
		const out: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
		child.on("close", () => {
			const raw = Buffer.concat(out);
			const split = raw.indexOf("\r\n\r\n");
			const headers: Record<string, string> = {};
			let status = 200;
			for (const line of raw.subarray(0, split).toString().split("\r\n")) {
				const [key, ...rest] = line.split(":");
				const value = rest.join(":").trim();
				if (key!.toLowerCase() === "status") status = Number(value.split(" ")[0]);
				else if (key) headers[key] = value;
			}
			res.writeHead(status, headers);
			res.end(raw.subarray(split + 4));
		});
		child.stdin.end(body);
	}
	const server = createServer((req, res) => {
		const chunks: Buffer[] = [];
		req.on("data", (c: Buffer) => chunks.push(c));
		req.on("end", () => {
			void handle(req, res, Buffer.concat(chunks)).catch((error) => {
				res.writeHead(500);
				res.end(String(error));
			});
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = (server.address() as AddressInfo).port;
	const base = `http://127.0.0.1:${port}`;
	return {
		owner,
		name,
		actor,
		repo,
		pulls,
		requests,
		faults,
		config: {
			api: base,
			git: `${base}/git`,
			token: TOKEN,
			actor,
			repositories: {} as Record<string, { owner: string; name: string; base: string }>,
		},
		posts: () => requests.filter((r) => r.method === "POST" && r.path === pullsPath).length,
		branch: branchHead,
		reveal() {
			hidden.clear();
		},
		/** Simulated outage: refuse every connection until `up()`. */
		async down() {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
		async up() {
			await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
		},
		async close() {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			await rm(root, { recursive: true, force: true });
		},
	};
}
