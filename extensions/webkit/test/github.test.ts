import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type {
	FetchRequest,
	HttpRequest,
	SourceDocument,
} from "../src/domain.ts";
import { cleanupClones, fetchPages } from "../src/extract.ts";
import {
	parseGitHubIssuePrUrl,
	parseGitHubUrl,
	renderGitHubPrIssue,
} from "../src/github.ts";
import { fakeGit } from "./fixtures/git.ts";
import {
	documentAt,
	failureAt,
	fixture,
	type Handler,
	html,
	isFailure,
	json,
	untilAborted,
} from "./fixtures/http.ts";

const fetchOf = (
	urls: string[],
	options: Partial<FetchRequest> = {},
): FetchRequest => ({
	urls,
	mode: "readable",
	forceClone: false,
	redirects: "follow",
	...options,
});
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const apiPath = (request: HttpRequest) => {
	const url = new URL(request.url);
	return url.host === "api.github.com" ? `${url.pathname}${url.search}` : null;
};
const article = `<html><head><title>GitHub page</title></head><body><article><h1>GitHub page</h1>${"<p>Rendered GitHub HTML fallback content for the page.</p>".repeat(20)}</article></body></html>`;

function repoApi(overrides: Record<string, unknown> = {}): Handler {
	return (request) => {
		const path = apiPath(request);
		const routes: Record<string, unknown> = {
			"/repos/owner/repo": { size: 100, default_branch: "main" },
			"/repos/owner/repo/git/trees/main?recursive=1": {
				tree: [{ path: "README.md" }, { path: "src" }, { path: "src/file.ts" }],
			},
			"/repos/owner/repo/readme?ref=main": {
				content: base64("# API README\n"),
			},
			"/repos/owner/repo/contents/src/file.ts?ref=main": {
				content: base64("export const fromApi = true;\n"),
			},
			...overrides,
		};
		if (path !== null && path in routes) return json(routes[path]);
		if (path !== null) return json({ message: "Not Found" }, 404);
		return html(article);
	};
}

test("GitHub code URLs parse strictly and keep normal paths", () => {
	assert.equal(parseGitHubUrl("https://github.com/%2E%2E%2Fvictim/repo"), null);
	assert.equal(parseGitHubUrl("https://github.com/..%2Fvictim/repo"), null);
	assert.equal(parseGitHubUrl("https://github.com/owner/repo%2Fother"), null);
	assert.equal(parseGitHubUrl("https://github.com/owner%ZZ/repo"), null);
	assert.equal(parseGitHubUrl("https://github.com/owner/repo/issues"), null);
	assert.equal(parseGitHubUrl("https://gist.github.com/owner/repo"), null);
	for (const path of [
		"src%2F..%2F..%2Foutside",
		"%2Foutside",
		"src%00file",
		"src%5C..%5Coutside",
	]) {
		assert.equal(
			parseGitHubUrl(`https://github.com/owner/repo/tree/main/${path}`),
			null,
		);
	}
	assert.deepEqual(parseGitHubUrl("https://github.com/owner/repo.git"), {
		owner: "owner",
		repo: "repo",
		refIsFullSha: false,
		type: "root",
	});
	assert.deepEqual(
		parseGitHubUrl("https://github.com/owner/repo/blob/main/src/file.ts"),
		{
			owner: "owner",
			repo: "repo",
			ref: "main",
			refIsFullSha: false,
			path: "src/file.ts",
			type: "blob",
		},
	);
	assert.deepEqual(
		parseGitHubUrl("https://github.com/owner/repo/tree/feature%2Fbranch/src"),
		{
			owner: "owner",
			repo: "repo",
			ref: "feature/branch",
			refIsFullSha: false,
			path: "src",
			type: "tree",
		},
	);
});

test("GitHub issue and pull request URLs parse with their comment anchors", () => {
	assert.deepEqual(
		parseGitHubIssuePrUrl(
			"https://github.com/owner/repo/pull/123/files#discussion_r42",
		),
		{
			owner: "owner",
			repo: "repo",
			kind: "pull",
			number: 123,
			anchor: "discussion_r42",
		},
	);
	assert.deepEqual(
		parseGitHubIssuePrUrl(
			"https://www.github.com/owner/repo/issues/5#issuecomment-99",
		),
		{
			owner: "owner",
			repo: "repo",
			kind: "issue",
			number: 5,
			anchor: "issuecomment-99",
		},
	);
	assert.deepEqual(
		parseGitHubIssuePrUrl(
			"https://www.github.com/owner/repo/issues/5#discussion_r99",
		),
		{ owner: "owner", repo: "repo", kind: "issue", number: 5 },
	);
	for (const url of [
		"https://github.com/owner/repo/pulls",
		"https://github.com/owner/repo/issues/new",
		"https://github.com/owner/repo/pull/123/unknown",
		"https://github.com/owner/repo/issues/5/edit",
		"https://github.com/owner%2Frepo/repo/issues/1",
	]) {
		assert.equal(parseGitHubIssuePrUrl(url), null, url);
	}
});

test("the issue and PR renderer orders sections, keeps cut text once, and forces anchored comments inline", () => {
	const comments = Array.from({ length: 20 }, (_, index) => ({
		id: index + 1,
		user: { login: `user${index + 1}` },
		created_at: "2026-01-01T00:00:00Z",
		body: index === 18 ? "anchored comment body" : `comment ${index + 1}`,
	}));
	const result = renderGitHubPrIssue({
		url: "https://github.com/owner/repo/pull/7#issuecomment-19",
		owner: "owner",
		repo: "repo",
		kind: "pull",
		number: 7,
		anchor: "issuecomment-19",
		reviewThreads: [],
		fallbackNotes: [],
		view: {
			number: 7,
			title: "Improve fetch",
			state: "OPEN",
			isDraft: false,
			author: { login: "alice" },
			baseRefName: "main",
			headRefName: "feature",
			headRepositoryOwner: { login: "fork" },
			createdAt: "2026-01-01T00:00:00Z",
			labels: [{ name: "bug" }],
			additions: 5,
			deletions: 1,
			changedFiles: 1,
			body: "x".repeat(4100),
			files: [{ path: "a.ts", additions: 5, deletions: 1 }],
			commits: [{ oid: "abcdef123456", messageHeadline: "commit subject" }],
			comments,
			statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }],
		},
	});
	assert.equal(result.title, "owner/repo pull #7: Improve fetch");
	assert.match(result.text, /^#7 Improve fetch/);
	assert.match(result.text, /- branch: main ← fork:feature/);
	assert.ok(result.text.indexOf("## Body") < result.text.indexOf("## Checks"));
	assert.ok(
		result.text.includes(
			'[body truncated; the rest is stored under "body (continued)": use get_search_content findText or offset]',
		),
	);
	assert.match(result.text, /user19.*\[anchored\]/s);
	assert.ok(
		result.text.includes(
			'[16 of 20 comments shown; 4 more stored under "Conversation comments (continued)": use get_search_content findText or offset, or gh issue view -c]',
		),
	);
	assert.equal(result.text.split("anchored comment body").length - 1, 1);
	assert.match(result.text, /gh pr diff 7 --repo owner\/repo/);
});

test("renderer markers distinguish stored overflow from never-fetched data and the document has a ceiling", () => {
	const render = (view: Record<string, unknown>) =>
		renderGitHubPrIssue({
			url: "https://github.com/owner/repo/pull/7",
			owner: "owner",
			repo: "repo",
			kind: "pull",
			number: 7,
			reviewThreads: [],
			fallbackNotes: [],
			view: { number: 7, title: "T", state: "OPEN", ...view },
		});
	const comments = (count: number) =>
		Array.from({ length: count }, (_, index) => ({
			id: index + 1,
			author: { login: "a" },
			body: `comment ${index}`,
		}));
	assert.ok(
		render({ comments: comments(2), commentsCount: 40 }).text.includes(
			"[2 comments shown from at least 40; use gh issue view -c]",
		),
	);
	assert.ok(
		render({ comments: comments(16), commentsCount: 40 }).text.includes(
			'[15 comments shown from at least 40; 1 more stored under "Conversation comments (continued)": use get_search_content findText or offset; for the rest use gh issue view -c]',
		),
	);
	assert.ok(
		render({ changedFiles: 3, files: [] }).text.includes(
			"[0 files shown from at least 3; use the gh command below]",
		),
	);
	assert.equal(
		render({ body: `${"word ".repeat(799)}BOUNDARY_TOKEN tail` }).text.split(
			"BOUNDARY_TOKEN",
		).length - 1,
		1,
	);
	const huge = render({ body: "y".repeat(200_000) });
	assert.equal(huge.truncated, true);
	assert.ok(huge.text.includes("## Escalation commands"));
	assert.ok(
		huge.text.endsWith(
			"[GitHub document truncated at 150000 chars; use `gh pr view 7 --repo owner/repo` or `gh pr diff 7 --repo owner/repo` for complete data]",
		),
	);
});

test("public REST issues fetch an anchored comment outside the first page", async () => {
	const { scope, requests } = fixture(
		(request) =>
			(
				({
					"/repos/owner/repo/issues/12": () =>
						json({
							number: 12,
							title: "Issue",
							state: "open",
							user: { login: "owner" },
							body: "body",
							comments: 75,
						}),
					"/repos/owner/repo/issues/12/comments?per_page=50": () =>
						json([
							{
								id: 1,
								user: { login: "first" },
								created_at: "2026-01-01T00:00:00Z",
								body: "first page",
							},
						]),
					"/repos/owner/repo/issues/comments/99": () =>
						json({
							id: 99,
							issue_url: "https://api.github.com/repos/owner/repo/issues/12",
							user: { login: "anchored" },
							created_at: "2026-01-02T00:00:00Z",
							body: "outside first page",
						}),
				}) as Record<string, () => ReturnType<typeof json>>
			)[apiPath(request) ?? ""]?.() ?? json({}, 500),
	);
	const document = documentAt(
		await fetchPages(
			fetchOf(["https://github.com/owner/repo/issues/12#issuecomment-99"]),
			scope,
		),
	);
	assert.equal(document.extractor, "github-api");
	assert.equal(document.title, "owner/repo issue #12: Issue");
	assert.match(document.text, /anchored.*\[anchored\]/s);
	assert.match(document.text, /outside first page/);
	assert.match(document.text, /comments: at least 75/);
	assert.match(document.text, /comments shown from at least 75/);
	assert.ok(
		requests.every((request) => new URL(request.url).host === "api.github.com"),
	);
	assert.ok(
		requests.every(
			(request) =>
				!Object.keys(request.headers ?? {}).some(
					(name) => name.toLowerCase() === "authorization",
				),
		),
	);
});

test("public REST rejects an anchored comment from another work item", async () => {
	const { scope } = fixture(
		(request) =>
			(
				({
					"/repos/owner/repo/issues/12": json({
						number: 12,
						title: "Issue",
						state: "open",
						user: { login: "owner" },
						body: "body",
						comments: 1,
					}),
					"/repos/owner/repo/issues/12/comments?per_page=50": json([]),
					"/repos/owner/repo/issues/comments/99": json({
						id: 98,
						issue_url: "https://api.github.com/repos/other/repo/issues/12",
						user: { login: "wrong" },
						body: "wrong issue",
					}),
				}) as Record<string, ReturnType<typeof json>>
			)[apiPath(request) ?? ""] ?? json({}, 500),
	);
	const document = documentAt(
		await fetchPages(
			fetchOf(["https://github.com/owner/repo/issues/12#issuecomment-99"]),
			scope,
		),
	);
	assert.doesNotMatch(document.text, /wrong issue/);
	assert.match(
		document.text,
		/anchored comment unavailable for this issue or pull request/,
	);
});

test("public REST pull requests fetch an anchored review comment and mark unavailable sections", async () => {
	const { scope } = fixture(
		(request) =>
			(
				({
					"/repos/owner/repo/pulls/7": json({
						number: 7,
						title: "PR",
						state: "open",
						user: { login: "owner" },
						body: "body",
						draft: false,
						base: { ref: "main" },
						head: { ref: "feature", repo: { owner: { login: "owner" } } },
						additions: 1,
						deletions: 0,
						changed_files: 75,
						review_comments: 12,
					}),
					"/repos/owner/repo/issues/7/comments?per_page=50": json([]),
					"/repos/owner/repo/pulls/7/files?per_page=50": json(
						Array.from({ length: 50 }, (_, index) => ({
							filename: `file${index}.ts`,
							additions: 1,
							deletions: 0,
						})),
					),
					"/repos/owner/repo/pulls/7/comments?per_page=50": json([
						{
							id: 1,
							user: { login: "first" },
							path: "a.ts",
							line: 1,
							body: "first review",
						},
					]),
					"/repos/owner/repo/pulls/comments/42": json({
						id: 42,
						pull_request_url: "https://api.github.com/repos/owner/repo/pulls/7",
						user: { login: "reviewer" },
						path: "b.ts",
						line: 9,
						body: "outside review page",
					}),
				}) as Record<string, ReturnType<typeof json>>
			)[apiPath(request) ?? ""] ?? json({}, 500),
	);
	const { text } = documentAt(
		await fetchPages(
			fetchOf(["https://github.com/owner/repo/pull/7#discussion_r42"]),
			scope,
		),
	);
	assert.match(text, /reviewer.*\[anchored\]/s);
	assert.match(text, /outside review page/);
	assert.match(text, /commits unavailable/);
	assert.match(text, /Review verdicts\nUnavailable in this GitHub fetch path/);
	assert.match(text, /50 files shown from at least 75/);
	assert.match(text, /Commits\nUnavailable in this GitHub fetch path/);
	assert.match(text, /review threads: at least 12/);
	assert.match(text, /review thread comments shown from at least 12/);
	assert.match(
		text,
		/Linked references\nUnavailable in this GitHub fetch path/,
	);
});

test("a positive changed file count is never rendered as no files", async () => {
	const { scope } = fixture(
		(request) =>
			(
				({
					"/repos/owner/repo/pulls/7": json({
						number: 7,
						title: "PR",
						state: "open",
						user: { login: "owner" },
						body: "body",
						draft: false,
						base: { ref: "main" },
						head: { ref: "feature" },
						additions: 1,
						deletions: 0,
						changed_files: 3,
					}),
					"/repos/owner/repo/issues/7/comments?per_page=50": json([]),
					"/repos/owner/repo/pulls/7/files?per_page=50": json([]),
					"/repos/owner/repo/pulls/7/comments?per_page=50": json([]),
				}) as Record<string, ReturnType<typeof json>>
			)[apiPath(request) ?? ""] ?? json({}, 500),
	);
	const { text } = documentAt(
		await fetchPages(fetchOf(["https://github.com/owner/repo/pull/7"]), scope),
	);
	assert.match(text, /0 files shown from at least 3/);
	assert.doesNotMatch(text, /Files\nnone/);
});

test("a GitHub rate limit is a quota failure, not an HTML fall-through", async () => {
	const { scope, requests } = fixture(() =>
		json({ message: "rate limited" }, 403, {
			"x-ratelimit-remaining": "0",
			"x-ratelimit-reset": String(Date.parse("2026-04-20T12:01:00Z") / 1000),
		}),
	);
	const failure = failureAt(
		await fetchPages(
			fetchOf(["https://github.com/owner/repo/issues/12"]),
			scope,
		),
		"quota",
	);
	assert.match(failure.message, /rate limit/i);
	assert.equal(failure.retryAfterMs, 60_000);
	assert.ok(
		requests.every((request) => new URL(request.url).host === "api.github.com"),
	);
});

test("a missing issue in the API falls through to the GitHub page", async () => {
	const { scope, requests } = fixture((request) =>
		apiPath(request) === null
			? html(article)
			: json({ message: "Not Found" }, 404),
	);
	const document = documentAt(
		await fetchPages(
			fetchOf(["https://github.com/owner/repo/issues/12"]),
			scope,
		),
	);
	assert.equal(document.extractor, "readability");
	assert.ok(
		requests.some(
			(request) => request.url === "https://github.com/owner/repo/issues/12",
		),
	);
});

test("caller cancellation during the REST request rejects without the HTML fall-through", async () => {
	const controller = new AbortController();
	const { scope, requests } = fixture(
		(_request, signal) => {
			setTimeout(() => controller.abort(), 5);
			return untilAborted(signal);
		},
		{},
		{ signal: controller.signal },
	);
	await assert.rejects(
		fetchPages(fetchOf(["https://github.com/owner/repo/issues/12"]), scope),
		isFailure("cancelled"),
	);
	assert.deepEqual(
		requests.map((request) => request.url),
		["https://api.github.com/repos/owner/repo/issues/12"],
	);
});

test("same-origin redirect constraints refuse GitHub API and clone routes by name without a request", async () => {
	const git = fakeGit("ok");
	try {
		const { scope, requests } = fixture(
			repoApi(),
			{},
			{ tempRoot: git.tempRoot },
		);
		const result = await fetchPages(
			fetchOf(
				[
					"https://github.com/owner/repo",
					"https://github.com/owner/repo/pull/7",
				],
				{ redirects: "same-origin", forceClone: true },
			),
			scope,
		);
		assert.match(
			failureAt(result, "unsupported", 0).message,
			/GitHub repository.*same-origin/,
		);
		assert.match(
			failureAt(result, "unsupported", 1).message,
			/GitHub issue\/PR.*same-origin/,
		);
		assert.deepEqual(requests, []);
		assert.equal(git.log(), "");
	} finally {
		git.restore();
	}
});

test("a public repository root is shallow-cloned without prompts into an owned directory the agent can read", async () => {
	const git = fakeGit("ok");
	try {
		const { scope } = fixture(repoApi(), {}, { tempRoot: git.tempRoot });
		const document = documentAt(
			await fetchPages(fetchOf(["https://github.com/owner/repo"]), scope),
		);
		assert.equal(document.extractor, "github-clone");
		assert.equal(document.title, "owner/repo");
		assert.ok(document.localPath);
		assert.equal(dirname(dirname(document.localPath)), git.tempRoot);
		assert.equal(
			readFileSync(join(document.localPath, "src/file.ts"), "utf8"),
			"export const answer = 42;\n",
		);
		assert.ok(
			document.text.startsWith(`Repository cloned to: ${document.localPath}\n`),
		);
		assert.match(
			document.text,
			/## Structure\nREADME\.md\nsrc\/\nsrc\/file\.ts/,
		);
		assert.match(document.text, /## README\.md\n# Fixture README/);
		assert.match(
			git.log(),
			/^clone --depth 1 --single-branch https:\/\/github\.com\/owner\/repo\.git .+\nprompt=0 gcm=Never$/m,
		);
	} finally {
		git.restore();
	}
});

test("blob and tree URLs read the cloned path, with the requested branch", async () => {
	const git = fakeGit("ok");
	try {
		const { scope } = fixture(repoApi(), {}, { tempRoot: git.tempRoot });
		const result = await fetchPages(
			fetchOf([
				"https://github.com/owner/repo/blob/main/src/file.ts",
				"https://github.com/owner/repo/tree/main/src",
				"https://github.com/owner/repo/blob/main/missing.ts",
			]),
			scope,
		);
		const blob = documentAt(result, 0);
		assert.equal(blob.title, "owner/repo - src/file.ts");
		assert.match(blob.text, /## src\/file\.ts\nexport const answer = 42;/);
		assert.match(
			documentAt(result, 1).text,
			/## src\n {2}file\.ts {2}\(26 B\)/,
		);
		assert.match(
			documentAt(result, 2).text,
			/Path `missing\.ts` not found in clone\. Showing repository root instead\./,
		);
		assert.match(git.log(), /--branch main/);
		assert.equal(
			git.log().match(/^clone /gm)?.length,
			1,
			"one clone serves every URL for the same repository and ref in a call",
		);
		assert.equal(
			new Set(result.documents.map((document) => document.localPath)).size,
			1,
		);
	} finally {
		git.restore();
	}
});

test("oversized repositories use the API view unless forceClone is requested", async () => {
	const git = fakeGit("ok");
	try {
		const { scope } = fixture(
			repoApi({
				"/repos/owner/repo": { size: 400 * 1024, default_branch: "main" },
			}),
			{},
			{ tempRoot: git.tempRoot },
		);
		const api = documentAt(
			await fetchPages(
				fetchOf(["https://github.com/owner/repo/blob/main/src/file.ts"]),
				scope,
			),
		);
		assert.equal(api.extractor, "github-api");
		assert.equal(api.localPath, undefined);
		assert.match(
			api.text,
			/^Note: Repository is 400MB \(threshold: 350MB\)\. .*forceClone: true/,
		);
		assert.match(api.text, /## src\/file\.ts\nexport const fromApi = true;/);
		assert.equal(git.log(), "");

		const root = documentAt(
			await fetchPages(fetchOf(["https://github.com/owner/repo"]), scope),
		);
		assert.match(root.text, /## Structure\nREADME\.md\nsrc\nsrc\/file\.ts/);
		assert.match(root.text, /## README\.md\n# API README/);

		const forced = documentAt(
			await fetchPages(
				fetchOf(["https://github.com/owner/repo"], { forceClone: true }),
				scope,
			),
		);
		assert.equal(forced.extractor, "github-clone");
		assert.match(git.log(), /^clone /m);
	} finally {
		git.restore();
	}
});

test("commit SHA URLs use the API instead of cloning", async () => {
	const git = fakeGit("ok");
	const sha = "0123456789abcdef0123456789abcdef01234567";
	try {
		const { scope } = fixture(
			repoApi({
				[`/repos/owner/repo/contents/src/file.ts?ref=${sha}`]: {
					content: base64("at sha\n"),
				},
			}),
			{},
			{ tempRoot: git.tempRoot },
		);
		const document = documentAt(
			await fetchPages(
				fetchOf([`https://github.com/owner/repo/blob/${sha}/src/file.ts`], {
					forceClone: true,
				}),
				scope,
			),
		);
		assert.equal(document.extractor, "github-api");
		assert.match(
			document.text,
			/^Note: Commit SHA URLs use the GitHub API instead of cloning\.\n\n## src\/file\.ts\nat sha/,
		);
		assert.equal(git.log(), "");
	} finally {
		git.restore();
	}
});

test("API tree fallbacks keep the requested directory and its README", async (t) => {
	const sha = "0123456789abcdef0123456789abcdef01234567";
	for (const reason of [
		"sha",
		"oversized",
		"clone-failed",
		"missing-git",
	] as const) {
		await t.test(reason, async () => {
			const git = fakeGit(
				reason === "clone-failed"
					? "fail"
					: reason === "missing-git"
						? "missing"
						: "ok",
			);
			const ref = reason === "sha" ? sha : "main";
			try {
				const { scope, requests } = fixture(
					repoApi({
						"/repos/owner/repo": {
							size: reason === "oversized" ? 400 * 1024 : 100,
							default_branch: "main",
						},
						[`/repos/owner/repo/contents/src?ref=${ref}`]: [
							{ path: "src/README.md", type: "file" },
							{ path: "src/file.ts", type: "file" },
							{ path: "src/nested", type: "dir" },
						],
						[`/repos/owner/repo/readme/src?ref=${ref}`]: {
							content: base64("# Directory README\n"),
						},
					}),
					{},
					{ tempRoot: git.tempRoot },
				);
				const document = documentAt(
					await fetchPages(
						fetchOf([`https://github.com/owner/repo/tree/${ref}/src`]),
						scope,
					),
				);
				assert.equal(document.extractor, "github-api");
				assert.equal(document.title, "owner/repo - src");
				assert.match(
					document.text,
					/## src\nsrc\/README\.md\nsrc\/file\.ts\nsrc\/nested\//,
				);
				assert.match(document.text, /# Directory README/);
				assert.doesNotMatch(document.text, /# API README/);
				assert.ok(
					requests.some(
						(request) =>
							apiPath(request) === `/repos/owner/repo/contents/src?ref=${ref}`,
					),
				);
				assert.ok(
					!requests.some(
						(request) =>
							apiPath(request)?.includes("/git/trees/") ||
							apiPath(request) === `/repos/owner/repo/readme?ref=${ref}`,
					),
				);
				assert.equal(document.truncated, false);
				if (reason !== "clone-failed") assert.equal(git.log(), "");
			} finally {
				git.restore();
			}
		});
	}
});

test("directory API views bound entries and the scoped README", async () => {
	const sha = "0123456789abcdef0123456789abcdef01234567";
	const { scope } = fixture(
		repoApi({
			[`/repos/owner/repo/contents/src?ref=${sha}`]: Array.from(
				{ length: 201 },
				(_, index) => ({ path: `src/file${index}.ts`, type: "file" }),
			),
			[`/repos/owner/repo/readme/src?ref=${sha}`]: {
				content: base64("z".repeat(8193)),
			},
		}),
	);
	const document = documentAt(
		await fetchPages(
			fetchOf([`https://github.com/owner/repo/tree/${sha}/src`]),
			scope,
		),
	);
	assert.equal(document.truncated, true);
	assert.match(document.text, /src\/file199\.ts/);
	assert.doesNotMatch(document.text, /src\/file200\.ts/);
	assert.match(document.text, /201 total entries/);
	assert.match(document.text, /README truncated at 8K chars/);
	assert.equal(document.text.match(/z/g)?.length, 8192);
});

test("API directory paths preserve encoded source names and escape query delimiters", async () => {
	const sha = "0123456789abcdef0123456789abcdef01234567";
	const path = "docs/api%20%23%3F";
	const { scope, requests } = fixture(
		repoApi({
			[`/repos/owner/repo/contents/${path}?ref=${sha}`]: [
				{ path: "docs/api #?/guide.md", type: "file" },
			],
		}),
	);
	const document = documentAt(
		await fetchPages(
			fetchOf([`https://github.com/owner/repo/tree/${sha}/${path}`]),
			scope,
		),
	);
	assert.equal(document.title, "owner/repo - docs/api #?");
	assert.match(document.text, /docs\/api #\?\/guide\.md/);
	assert.ok(
		requests.some(
			(request) =>
				apiPath(request) === `/repos/owner/repo/contents/${path}?ref=${sha}`,
		),
	);
});

test("raw repository API errors remain safe HTML fallbacks", async () => {
	const sha = "0123456789abcdef0123456789abcdef01234567";
	const { scope } = fixture((request) => {
		if (apiPath(request) !== null) throw new Error("raw transport secret");
		return html(article);
	});
	const document = documentAt(
		await fetchPages(
			fetchOf([`https://github.com/owner/repo/tree/${sha}/src`]),
			scope,
		),
	);
	assert.equal(document.extractor, "readability");
	assert.doesNotMatch(document.text, /raw transport secret/);
});

test("a missing API directory falls through without substituting the root tree or README", async () => {
	const sha = "0123456789abcdef0123456789abcdef01234567";
	const { scope } = fixture(
		repoApi({
			[`/repos/owner/repo/git/trees/${sha}?recursive=1`]: {
				tree: [{ path: "unrelated.ts" }],
			},
			[`/repos/owner/repo/readme?ref=${sha}`]: {
				content: base64("unrelated root README"),
			},
		}),
	);
	const document = documentAt(
		await fetchPages(
			fetchOf([`https://github.com/owner/repo/tree/${sha}/missing`]),
			scope,
		),
	);
	assert.equal(document.extractor, "readability");
	assert.doesNotMatch(document.text, /unrelated/);
});

test("clones cannot authenticate through ambient Git configuration or the user's home", async () => {
	const git = fakeGit("auth", {
		env: {
			GIT_DIR: "/ambient/project/.git",
			GIT_WORK_TREE: "/ambient/project",
			GIT_CONFIG: "/ambient/config",
			GIT_CONFIG_GLOBAL: "/ambient/global",
			GIT_CONFIG_SYSTEM: "/ambient/system",
			GIT_CONFIG_PARAMETERS: "'credential.helper=ambient-helper'",
			GIT_CONFIG_COUNT: "1",
			GIT_CONFIG_KEY_0: "credential.helper",
			GIT_CONFIG_VALUE_0: "ambient-helper",
			GIT_CONFIG_KEY_99: "url.https://private.invalid/.insteadOf",
			GIT_CONFIG_VALUE_99: "https://github.com/",
			GIT_ASKPASS: "/ambient/askpass",
			SSH_ASKPASS: "/ambient/ssh-askpass",
		},
	});
	try {
		const { scope } = fixture(repoApi(), {}, { tempRoot: git.tempRoot });
		const document = documentAt(
			await fetchPages(fetchOf(["https://github.com/owner/repo"]), scope),
		);
		assert.equal(
			document.extractor,
			"github-api",
			"the simulated private clone must not authenticate",
		);
		const env = git.environment();
		assert.equal(env.wouldAuthenticate, false);
		assert.equal(env.homeIsCwd, true);
		assert.equal(env.xdgIsCwd, true);
		assert.equal(dirname(env.cwd), realpathSync(git.tempRoot));
		assert.equal(env.globalConfigDisabled, true);
		assert.equal(env.systemConfigDisabled, true);
		assert.equal(env.credentialHelpersDisabled, true);
		assert.equal(env.interactiveCredentialsDisabled, true);
		assert.equal(env.promptDisabled, true);
		assert.equal(env.askpassCleared, true);
		assert.deepEqual(env.unexpectedGitVariables, []);
		assert.deepEqual(git.owned(), []);
		assert.equal(
			process.env.GIT_CONFIG_GLOBAL,
			"/ambient/global",
			"request isolation does not mutate the parent environment",
		);
	} finally {
		git.restore();
	}
});

test("clones honor the project proxy or explicit direct routing without ambient bypasses", async (t) => {
	const secretProxy = "http://proxy-user:proxy-secret@proxy.example:8080";
	for (const proxy of [undefined, "", secretProxy]) {
		await t.test(
			proxy
				? "project proxy"
				: proxy === ""
					? "explicit direct"
					: "default direct",
			async () => {
				const git = fakeGit("ok", {
					...(proxy === undefined ? {} : { proxy }),
					env: {
						HTTP_PROXY: "http://ambient.example:1",
						http_proxy: "http://ambient.example:2",
						HTTPS_PROXY: "http://ambient.example:3",
						https_proxy: "http://ambient.example:4",
						ALL_PROXY: "http://ambient.example:5",
						all_proxy: "http://ambient.example:6",
						NO_PROXY: "*",
						no_proxy: "github.com",
					},
				});
				try {
					const { scope } = fixture(
						repoApi(),
						proxy === undefined ? {} : { proxy },
						{ tempRoot: git.tempRoot },
					);
					const document = documentAt(
						await fetchPages(fetchOf(["https://github.com/owner/repo"]), scope),
					);
					assert.equal(document.extractor, "github-clone");
					assert.equal(
						git.environment().proxyRoute,
						proxy ? "project" : "direct",
					);
					assert.deepEqual(git.environment().ambientProxyVariables, []);
					assert.doesNotMatch(git.log(), /proxy-user|proxy-secret/);
					assert.doesNotMatch(document.text, /proxy-user|proxy-secret/);
				} finally {
					git.restore();
				}
			},
		);
	}
});

test("failed proxy clones keep stderr secrets out of API fallback documents", async () => {
	const proxy = "http://proxy-user:proxy-secret@proxy.example:8080";
	const git = fakeGit("fail", { proxy });
	try {
		const { scope } = fixture(repoApi(), { proxy }, { tempRoot: git.tempRoot });
		const document = documentAt(
			await fetchPages(fetchOf(["https://github.com/owner/repo"]), scope),
		);
		assert.equal(document.extractor, "github-api");
		assert.doesNotMatch(document.text + git.log(), /proxy-user|proxy-secret/);
		assert.deepEqual(git.owned(), []);
	} finally {
		git.restore();
	}
});

test("API file views are bounded and say so", async () => {
	const git = fakeGit("ok");
	try {
		const { scope } = fixture(
			repoApi({
				"/repos/owner/repo": { size: 400 * 1024, default_branch: "main" },
				"/repos/owner/repo/contents/src/file.ts?ref=main": {
					content: base64("z".repeat(100_001)),
				},
			}),
			{},
			{ tempRoot: git.tempRoot },
		);
		const document = documentAt(
			await fetchPages(
				fetchOf(["https://github.com/owner/repo/blob/main/src/file.ts"]),
				scope,
			),
		);
		assert.equal(document.truncated, true);
		assert.match(document.text, /\[File truncated at 100K chars\]/);
		assert.equal(document.text.match(/z/g)?.length, 100_000);
	} finally {
		git.restore();
	}
});

test("a failed clone removes its partial directory and falls back to the API view", async () => {
	const git = fakeGit("fail");
	try {
		const { scope } = fixture(repoApi(), {}, { tempRoot: git.tempRoot });
		const document = documentAt(
			await fetchPages(fetchOf(["https://github.com/owner/repo"]), scope),
		);
		assert.equal(document.extractor, "github-api");
		assert.match(git.log(), /^clone /m);
		assert.deepEqual(git.owned(), []);
	} finally {
		git.restore();
	}
});

test("cancelling during a clone stops git and leaves no clone directory", async () => {
	const git = fakeGit("hang");
	try {
		const controller = new AbortController();
		const { scope } = fixture(
			repoApi(),
			{},
			{ tempRoot: git.tempRoot, signal: controller.signal },
		);
		const pending = fetchPages(
			fetchOf(["https://github.com/owner/repo"]),
			scope,
		);
		while (!git.log()) await new Promise((resolve) => setTimeout(resolve, 10));
		controller.abort();
		const started = Date.now();
		await assert.rejects(pending, isFailure("cancelled"));
		assert.ok(
			Date.now() - started < 5000,
			"cancellation does not wait for git to finish",
		);
		assert.deepEqual(git.owned(), []);
	} finally {
		git.restore();
	}
});

test("cancelling after a clone finished in the same call removes that clone too", async () => {
	const git = fakeGit("ok");
	try {
		const controller = new AbortController();
		const { scope } = fixture(
			(request, signal) => {
				if (request.url.startsWith("https://example.com/")) {
					const waitForClone = async () => {
						while (!git.log().includes("done"))
							await new Promise((resolve) => setTimeout(resolve, 10));
						await new Promise((resolve) => setTimeout(resolve, 100));
						controller.abort();
					};
					void waitForClone();
					return untilAborted(signal);
				}
				return repoApi()(request, signal);
			},
			{},
			{ tempRoot: git.tempRoot, signal: controller.signal },
		);
		await assert.rejects(
			fetchPages(
				fetchOf(["https://github.com/owner/repo", "https://example.com/slow"]),
				scope,
			),
			isFailure("cancelled"),
		);
		assert.match(git.log(), /^clone /m);
		assert.deepEqual(git.owned(), []);
	} finally {
		git.restore();
	}
});

test("cleanupClones removes only owned clone directories named by clone documents", async () => {
	const git = fakeGit("ok");
	try {
		const { scope } = fixture(repoApi(), {}, { tempRoot: git.tempRoot });
		const result = await fetchPages(
			fetchOf(["https://github.com/owner/repo"]),
			scope,
		);
		const clone = documentAt(result);
		const victimRoot = join(dirname(git.tempRoot), "victim");
		const victim = join(victimRoot, "tau-webkit-clone-AAAAAA", "repo");
		mkdirSync(victim, { recursive: true });
		writeFileSync(join(victim, "marker.txt"), "preserve");
		symlinkSync(
			join(victimRoot, "tau-webkit-clone-AAAAAA"),
			join(git.tempRoot, "tau-webkit-clone-BBBBBB"),
		);
		const forged: SourceDocument[] = [
			{ ...clone, localPath: victim },
			{
				...clone,
				localPath: join(git.tempRoot, "tau-webkit-clone-BBBBBB", "repo"),
			},
			{
				...clone,
				extractor: "http",
				localPath: join(git.tempRoot, "tau-webkit-clone-BBBBBB", "repo"),
			},
		];
		await cleanupClones([...result.documents, ...forged], git.tempRoot);
		assert.equal(existsSync(clone.localPath!), false);
		assert.equal(readFileSync(join(victim, "marker.txt"), "utf8"), "preserve");
		assert.deepEqual(git.owned(), ["tau-webkit-clone-BBBBBB"]);
		await cleanupClones(result.documents, git.tempRoot);
	} finally {
		git.restore();
	}
});
