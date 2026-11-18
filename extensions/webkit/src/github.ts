import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	statSync,
} from "node:fs";
import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
	basename,
	dirname,
	extname,
	join,
	sep as pathSep,
	resolve as resolvePath,
} from "node:path";
import {
	type HttpResponse,
	type RequestScope,
	type SourceDocument,
	WebkitError,
} from "./domain.ts";
import { nativeTool, runNative } from "./runtime.ts";

const BINARY_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".bmp",
	".ico",
	".webp",
	".svg",
	".tiff",
	".tif",
	".mp3",
	".mp4",
	".avi",
	".mov",
	".mkv",
	".flv",
	".wmv",
	".wav",
	".ogg",
	".webm",
	".flac",
	".aac",
	".zip",
	".tar",
	".gz",
	".bz2",
	".xz",
	".7z",
	".rar",
	".zst",
	".exe",
	".dll",
	".so",
	".dylib",
	".bin",
	".o",
	".a",
	".lib",
	".woff",
	".woff2",
	".ttf",
	".otf",
	".eot",
	".pdf",
	".doc",
	".docx",
	".xls",
	".xlsx",
	".ppt",
	".pptx",
	".sqlite",
	".db",
	".sqlite3",
	".pyc",
	".pyo",
	".class",
	".jar",
	".war",
	".iso",
	".img",
	".dmg",
]);

const NOISE_DIRS = new Set([
	"node_modules",
	"vendor",
	".next",
	"dist",
	"build",
	"__pycache__",
	".venv",
	"venv",
	".tox",
	".mypy_cache",
	".pytest_cache",
	"target",
	".gradle",
	".idea",
	".vscode",
]);

const NON_CODE_SEGMENTS = new Set([
	"issues",
	"pull",
	"pulls",
	"discussions",
	"releases",
	"wiki",
	"actions",
	"settings",
	"security",
	"projects",
	"graphs",
	"compare",
	"commits",
	"tags",
	"branches",
	"stargazers",
	"watchers",
	"network",
	"forks",
	"milestone",
	"labels",
	"packages",
	"codespaces",
	"contribute",
	"community",
	"sponsors",
	"invitations",
	"notifications",
	"insights",
]);

const MAX_INLINE_FILE_CHARS = 100_000;
const MAX_README_CHARS = 8192;
const MAX_TREE_ENTRIES = 200;
const MAX_REPO_SIZE_MB = 350;
const CLONE_PREFIX = "tau-webkit-clone-";
const OWNED_CLONE_DIR = /^tau-webkit-clone-[A-Za-z0-9]{6}$/;
const API_HEADERS = {
	Accept: "application/vnd.github+json",
	"User-Agent": "tau-webkit",
	"X-GitHub-Api-Version": "2022-11-28",
};
const EXPLORE_HINT =
	"Use `read` and `bash` tools at the path above to explore further.";
const RETRIEVAL_TOOL = "get_search_content";

const MAX_DOC_CHARS = 150_000;
const BODY_INLINE_CHARS = 4_000;
const COMMENT_INLINE_CHARS = 700;
const MAX_INLINE_COMMENTS = 15;
const MAX_INLINE_REVIEWS = 10;
const MAX_INLINE_CHECKS = 15;
const MAX_INLINE_FILES = 50;
const MAX_INLINE_COMMITS = 20;
const MAX_INLINE_REVIEW_THREADS = 30;
const PR_SUBPATHS = new Set(["files", "commits", "checks", "conversation"]);

export interface GitHubUrlInfo {
	owner: string;
	repo: string;
	ref?: string;
	refIsFullSha: boolean;
	path?: string;
	type: "root" | "blob" | "tree";
}

type Kind = "pull" | "issue";

export interface GitHubIssuePrUrlInfo {
	owner: string;
	repo: string;
	kind: Kind;
	number: number;
	anchor?: string;
}

interface RenderData {
	url: string;
	owner: string;
	repo: string;
	kind: Kind;
	number: number;
	anchor?: string | undefined;
	view: Record<string, unknown>;
	reviewThreads: Record<string, unknown>[];
	reviewThreadsBounded?: boolean;
	reviewThreadsUnavailable?: boolean;
	fallbackNotes: string[];
}

interface Rendered {
	title: string;
	text: string;
	truncated: boolean;
}

export type Clones = Map<string, Promise<string | null>>;

function validOwner(owner: string): boolean {
	return (
		/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) &&
		!owner.includes("--")
	);
}

function validRepo(repo: string): boolean {
	return /^[A-Za-z0-9._-]{1,100}$/.test(repo) && repo !== "." && repo !== "..";
}

function githubSegments(
	url: string,
): { segments: string[]; hash: string } | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = parsed.hostname.toLowerCase();
	if (host !== "github.com" && host !== "www.github.com") return null;
	const segments: string[] = [];
	for (const segment of parsed.pathname.split("/").filter(Boolean)) {
		try {
			segments.push(decodeURIComponent(segment));
		} catch {
			return null;
		}
	}
	return { segments, hash: parsed.hash };
}

export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
	const segments = githubSegments(url)?.segments;
	if (!segments || segments.length < 2) return null;
	const owner = segments[0]!;
	const repo = segments[1]!.replace(/\.git$/, "");
	if (!validOwner(owner) || !validRepo(repo)) return null;
	if (NON_CODE_SEGMENTS.has(segments[2]?.toLowerCase() ?? "")) return null;
	if (segments.length === 2)
		return { owner, repo, refIsFullSha: false, type: "root" };

	const action = segments[2];
	if ((action !== "blob" && action !== "tree") || segments.length < 4)
		return null;
	const ref = segments[3]!;
	const control = [...ref].some(
		(character) =>
			character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f,
	);
	if (ref.length === 0 || ref.length > 1024 || control) return null;
	const path = segments.slice(4).join("/");
	if (
		path.startsWith("/") ||
		path.includes("\\") ||
		path.split("/").some((part) => part === "." || part === "..") ||
		[...path].some(
			(character) =>
				character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f,
		)
	)
		return null;
	return {
		owner,
		repo,
		ref,
		refIsFullSha: /^[0-9a-f]{40}$/.test(ref),
		path,
		type: action,
	};
}

export function parseGitHubIssuePrUrl(
	url: string,
): GitHubIssuePrUrlInfo | null {
	const parts = githubSegments(url);
	if (!parts || parts.segments.length < 4) return null;
	const { segments } = parts;
	const owner = segments[0]!;
	const repo = segments[1]!.replace(/\.git$/, "");
	if (!validOwner(owner) || !validRepo(repo)) return null;
	const route = segments[2]!.toLowerCase();
	if (route !== "pull" && route !== "issues") return null;
	if (!/^\d+$/.test(segments[3]!)) return null;
	const subpath = segments[4]?.toLowerCase();
	if (route === "pull" && subpath && !PR_SUBPATHS.has(subpath)) return null;
	if (route === "issues" && subpath) return null;
	const number = Number.parseInt(segments[3]!, 10);
	if (!Number.isSafeInteger(number) || number <= 0) return null;
	const fragment = parts.hash.slice(1);
	const anchorPattern =
		route === "pull"
			? /^(?:issuecomment-\d+|discussion_r\d+)$/i
			: /^issuecomment-\d+$/i;
	const anchor = anchorPattern.test(fragment) ? fragment : undefined;
	return {
		owner,
		repo,
		kind: route === "pull" ? "pull" : "issue",
		number,
		...(anchor ? { anchor } : {}),
	};
}

export function gitHubRoute(
	url: string,
): "GitHub issue/PR" | "GitHub repository" | null {
	if (parseGitHubIssuePrUrl(url)) return "GitHub issue/PR";
	return parseGitHubUrl(url) ? "GitHub repository" : null;
}

export async function readGitHub(
	url: string,
	scope: RequestScope,
	forceClone: boolean,
	clones: Clones,
): Promise<SourceDocument | null> {
	const issue = parseGitHubIssuePrUrl(url);
	if (issue) return readIssuePr(url, issue, scope);
	const info = parseGitHubUrl(url);
	if (!info) return null;
	try {
		return await readRepository(url, info, scope, forceClone, clones);
	} catch (error) {
		if (scope.signal.aborted) throw error;
		return null;
	}
}

export async function cleanupClones(
	documents: readonly SourceDocument[],
	tempRoot: string = tmpdir(),
): Promise<void> {
	const paths = documents
		.filter(
			(document) => document.extractor === "github-clone" && document.localPath,
		)
		.map((document) => document.localPath!);
	await Promise.all(
		[...new Set(paths)].map((path) => removeOwnedClone(path, tempRoot)),
	);
}

export async function discardClones(
	clones: Clones,
	tempRoot: string = tmpdir(),
): Promise<void> {
	const paths = await Promise.all(clones.values());
	await Promise.all(
		paths
			.filter((path): path is string => path !== null)
			.map((path) => removeOwnedClone(path, tempRoot)),
	);
}

async function removeOwnedClone(
	localPath: string,
	tempRoot: string,
): Promise<void> {
	const owned = dirname(resolvePath(localPath));
	if (
		dirname(owned) !== resolvePath(tempRoot) ||
		!OWNED_CLONE_DIR.test(basename(owned))
	)
		return;
	try {
		if (!(await lstat(owned)).isDirectory()) return;
		await rm(owned, { recursive: true, force: true });
	} catch {}
}

async function readRepository(
	url: string,
	info: GitHubUrlInfo,
	scope: RequestScope,
	forceClone: boolean,
	clones: Clones,
): Promise<SourceDocument | null> {
	if (info.refIsFullSha)
		return apiView(
			url,
			info,
			scope,
			null,
			"Note: Commit SHA URLs use the GitHub API instead of cloning.",
		);

	let meta: RepoMeta | null = null;
	if (!forceClone) {
		meta = await repoMeta(info, scope);
		const sizeMB = meta?.sizeKB !== undefined ? meta.sizeKB / 1024 : null;
		if (sizeMB !== null && sizeMB > MAX_REPO_SIZE_MB) {
			return apiView(
				url,
				info,
				scope,
				meta,
				`Note: Repository is ${Math.round(sizeMB)}MB (threshold: ${MAX_REPO_SIZE_MB}MB). ` +
					"Showing API-fetched content instead of full clone. Ask the user if they'd like to clone the full repo -- " +
					"if yes, call fetch_content again with the same URL and add forceClone: true to the params.",
			);
		}
	}

	const key = JSON.stringify([info.owner, info.repo, info.ref ?? null]);
	let clone = clones.get(key);
	if (!clone) {
		clone = cloneRepository(info, scope);
		clones.set(key, clone);
	}
	const localPath = await clone;
	scope.signal.throwIfAborted();
	if (localPath) {
		const { text, truncated } = describeClone(localPath, info);
		return {
			url,
			title: repositoryTitle(info),
			text,
			format: "markdown",
			extractor: "github-clone",
			truncated,
			localPath,
		};
	}
	return apiView(url, info, scope, meta);
}

async function cloneRepository(
	info: GitHubUrlInfo,
	scope: RequestScope,
): Promise<string | null> {
	const root = scope.tempRoot ?? tmpdir();
	await mkdir(root, { recursive: true });
	const owned = await mkdtemp(join(root, CLONE_PREFIX));
	const localPath = join(owned, info.repo);
	// Git merges this overlay with the process environment. Unset inherited config and routing inputs first.
	const env: Record<string, string | undefined> = Object.fromEntries(
		Object.keys(process.env)
			.filter((key) => /^GIT_|^(?:https?|all|no)_proxy$/i.test(key))
			.map((key) => [key, undefined]),
	);
	Object.assign(env, {
		HOME: owned,
		XDG_CONFIG_HOME: owned,
		SSH_ASKPASS: undefined,
		GIT_TERMINAL_PROMPT: "0",
		GCM_INTERACTIVE: "Never",
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_SYSTEM: "/dev/null",
		GIT_CONFIG_GLOBAL: "/dev/null",
		GIT_CONFIG_COUNT: "3",
		GIT_CONFIG_KEY_0: "credential.helper",
		GIT_CONFIG_VALUE_0: "",
		GIT_CONFIG_KEY_1: "credential.interactive",
		GIT_CONFIG_VALUE_1: "false",
		GIT_CONFIG_KEY_2: "http.proxy",
		GIT_CONFIG_VALUE_2: scope.settings.proxy ?? "",
	});
	const args = [
		"clone",
		"--depth",
		"1",
		"--single-branch",
		...(info.ref ? ["--branch", info.ref] : []),
		`https://github.com/${info.owner}/${info.repo}.git`,
		localPath,
	];
	try {
		const result = await runNative(nativeTool("git"), args, {
			signal: AbortSignal.any([
				scope.signal,
				AbortSignal.timeout(scope.settings.timeoutMs),
			]),
			maxBytes: 64 * 1024,
			cwd: owned,
			env,
		});
		if (result.status === 0) return localPath;
	} catch {}
	await rm(owned, { recursive: true, force: true });
	return null;
}

function repositoryTitle(info: GitHubUrlInfo): string {
	return info.path
		? `${info.owner}/${info.repo} - ${info.path}`
		: `${info.owner}/${info.repo}`;
}

interface RepoMeta {
	sizeKB?: number;
	defaultBranch?: string;
}

async function repoMeta(
	info: GitHubUrlInfo,
	scope: RequestScope,
): Promise<RepoMeta | null> {
	const value = await apiJson(scope, `/repos/${info.owner}/${info.repo}`);
	if (!isRecord(value)) return null;
	return {
		...(typeof value.size === "number" && Number.isFinite(value.size)
			? { sizeKB: value.size }
			: {}),
		...(typeof value.default_branch === "string" && value.default_branch
			? { defaultBranch: value.default_branch }
			: {}),
	};
}

async function apiView(
	url: string,
	info: GitHubUrlInfo,
	scope: RequestScope,
	meta: RepoMeta | null,
	note?: string,
): Promise<SourceDocument | null> {
	const ref =
		info.ref ??
		meta?.defaultBranch ??
		(await repoMeta(info, scope))?.defaultBranch;
	if (!ref) return null;
	const base = `/repos/${info.owner}/${info.repo}`;
	const lines: string[] = note ? [note, ""] : [];
	let truncated = false;

	if (info.type === "blob" && info.path) {
		const file = await apiJson(
			scope,
			`${base}/contents/${info.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
		);
		const content =
			isRecord(file) && typeof file.content === "string"
				? Buffer.from(file.content, "base64").toString("utf8")
				: "";
		if (!content) return null;
		lines.push(`## ${info.path}`);
		if (content.length > MAX_INLINE_FILE_CHARS) {
			truncated = true;
			lines.push(
				content.slice(0, MAX_INLINE_FILE_CHARS),
				"\n[File truncated at 100K chars]",
			);
		} else {
			lines.push(content);
		}
		return {
			url,
			title: repositoryTitle(info),
			text: lines.join("\n"),
			format: "markdown",
			extractor: "github-api",
			truncated,
		};
	}

	const directory = info.type === "tree" && info.path ? info.path : "";
	const encodedDirectory = directory
		.split("/")
		.map(encodeURIComponent)
		.join("/");
	const [treeValue, readmeValue] = await Promise.all([
		apiJson(
			scope,
			directory
				? `${base}/contents/${encodedDirectory}?ref=${encodeURIComponent(ref)}`
				: `${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
		),
		apiJson(
			scope,
			`${base}/readme${directory ? `/${encodedDirectory}` : ""}?ref=${encodeURIComponent(ref)}`,
		),
	]);
	const entries = directory
		? Array.isArray(treeValue)
			? treeValue
			: []
		: isRecord(treeValue) && Array.isArray(treeValue.tree)
			? treeValue.tree
			: [];
	const paths = entries.flatMap((entry) =>
		isRecord(entry) && typeof entry.path === "string"
			? [entry.path + (directory && entry.type === "dir" ? "/" : "")]
			: [],
	);
	let readme =
		isRecord(readmeValue) && typeof readmeValue.content === "string"
			? Buffer.from(readmeValue.content, "base64").toString("utf8")
			: "";
	if (paths.length === 0 && !readme) return null;
	if (paths.length > 0) {
		const cut =
			paths.length > MAX_TREE_ENTRIES ||
			(isRecord(treeValue) && treeValue.truncated === true);
		truncated ||= cut;
		lines.push(
			directory ? `## ${directory}` : "## Structure",
			paths.slice(0, MAX_TREE_ENTRIES).join("\n") +
				(cut ? `\n... (${paths.length} total entries)` : ""),
			"",
		);
	}
	if (readme) {
		if (readme.length > MAX_README_CHARS) {
			truncated = true;
			readme = `${readme.slice(0, MAX_README_CHARS)}\n\n[README truncated at 8K chars]`;
		}
		lines.push("## README.md", readme, "");
	}
	lines.push(
		"This is an API-only view. Clone the repo or use `read`/`bash` for deeper exploration.",
	);
	return {
		url,
		title: repositoryTitle(info),
		text: lines.join("\n"),
		format: "markdown",
		extractor: "github-api",
		truncated,
	};
}

async function apiRequest(
	scope: RequestScope,
	path: string,
): Promise<HttpResponse> {
	return scope.http.request(
		{
			url: `${scope.endpoints.github}${path}`,
			headers: API_HEADERS,
			maxBytes: scope.settings.maxResponseBytes,
		},
		scope.signal,
	);
}

async function apiJson(scope: RequestScope, path: string): Promise<unknown> {
	const response = await apiRequest(scope, path);
	return response.status >= 200 && response.status < 300
		? parseJson(response)
		: null;
}

function parseJson(response: HttpResponse): unknown {
	try {
		return JSON.parse(new TextDecoder().decode(response.body));
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isBinaryFile(filePath: string): boolean {
	if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) return true;
	let fd: number;
	try {
		fd = openSync(filePath, "r");
	} catch {
		return false;
	}
	try {
		const buf = Buffer.alloc(512);
		const bytesRead = readSync(fd, buf, 0, 512, 0);
		return buf.subarray(0, bytesRead).includes(0);
	} catch {
		return false;
	} finally {
		closeSync(fd);
	}
}

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveWithinRepo(
	rootPath: string,
	relativePath: string,
): string | null {
	const normalizedRoot = resolvePath(rootPath);
	const candidate = resolvePath(normalizedRoot, relativePath);
	if (
		candidate !== normalizedRoot &&
		!candidate.startsWith(
			normalizedRoot.endsWith(pathSep)
				? normalizedRoot
				: normalizedRoot + pathSep,
		)
	)
		return null;
	if (!existsSync(candidate)) return candidate;
	try {
		const realRoot = realpathSync(normalizedRoot);
		const realCandidate = realpathSync(candidate);
		if (realCandidate === realRoot) return candidate;
		return realCandidate.startsWith(
			realRoot.endsWith(pathSep) ? realRoot : realRoot + pathSep,
		)
			? candidate
			: null;
	} catch {
		return null;
	}
}

function buildTree(rootPath: string): { text: string; truncated: boolean } {
	const entries: string[] = [];
	const walk = (dir: string, relPath: string): void => {
		let items: string[];
		try {
			items = readdirSync(dir).sort();
		} catch {
			return;
		}
		for (const item of items) {
			if (entries.length >= MAX_TREE_ENTRIES) return;
			if (item === ".git") continue;
			const rel = relPath ? `${relPath}/${item}` : item;
			const safePath = resolveWithinRepo(rootPath, rel);
			if (!safePath) {
				entries.push(`${rel}  [outside repo skipped]`);
				continue;
			}
			let stat: ReturnType<typeof statSync>;
			try {
				stat = statSync(safePath);
			} catch {
				continue;
			}
			if (!stat.isDirectory()) {
				entries.push(rel);
			} else if (NOISE_DIRS.has(item)) {
				entries.push(`${rel}/  [skipped]`);
			} else {
				entries.push(`${rel}/`);
				walk(safePath, rel);
			}
		}
	};
	walk(rootPath, "");
	const truncated = entries.length >= MAX_TREE_ENTRIES;
	if (truncated) entries.push(`... (truncated at ${MAX_TREE_ENTRIES} entries)`);
	return { text: entries.join("\n"), truncated };
}

function buildDirListing(rootPath: string, subPath: string): string {
	const targetPath = resolveWithinRepo(rootPath, subPath);
	if (!targetPath) return "(path escapes repository root)";
	let items: string[];
	try {
		items = readdirSync(targetPath).sort();
	} catch {
		return "(directory not readable)";
	}
	const lines: string[] = [];
	for (const item of items) {
		if (item === ".git") continue;
		const safePath = resolveWithinRepo(
			rootPath,
			subPath ? `${subPath}/${item}` : item,
		);
		if (!safePath) {
			lines.push(`  ${item}  (outside repo)`);
			continue;
		}
		try {
			const stat = statSync(safePath);
			lines.push(
				stat.isDirectory()
					? `  ${item}/`
					: `  ${item}  (${formatFileSize(stat.size)})`,
			);
		} catch {
			lines.push(`  ${item}  (unreadable)`);
		}
	}
	return lines.join("\n");
}

function readReadme(
	localPath: string,
): { text: string; truncated: boolean } | null {
	for (const name of [
		"README.md",
		"readme.md",
		"README",
		"README.txt",
		"README.rst",
	]) {
		const readmePath = resolveWithinRepo(localPath, name);
		if (!readmePath || !existsSync(readmePath)) continue;
		try {
			const content = readFileSync(readmePath, "utf-8");
			return content.length > MAX_README_CHARS
				? {
						text: `${content.slice(0, MAX_README_CHARS)}\n\n[README truncated at 8K chars]`,
						truncated: true,
					}
				: { text: content, truncated: false };
		} catch {}
	}
	return null;
}

function describeClone(
	localPath: string,
	info: GitHubUrlInfo,
): { text: string; truncated: boolean } {
	const lines = [`Repository cloned to: ${localPath}`, ""];
	let truncated = false;
	const structure = () => {
		const tree = buildTree(localPath);
		truncated ||= tree.truncated;
		lines.push("## Structure", tree.text);
	};
	const finish = () => ({
		text: [...lines, "", EXPLORE_HINT].join("\n"),
		truncated,
	});

	if (info.type === "root") {
		structure();
		lines.push("");
		const readme = readReadme(localPath);
		if (readme) {
			truncated ||= readme.truncated;
			lines.push("## README.md", readme.text, "");
		}
		lines.push(EXPLORE_HINT);
		return { text: lines.join("\n"), truncated };
	}

	const relative = info.path ?? "";
	const fullPath = resolveWithinRepo(localPath, relative);
	if (!fullPath || !existsSync(fullPath)) {
		lines.push(
			`Path \`${relative}\` not found in clone. Showing repository root instead.`,
			"",
		);
		structure();
		return finish();
	}

	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(fullPath);
	} catch (error) {
		lines.push(
			`Could not inspect \`${relative}\`: ${error instanceof Error ? error.message : String(error)}`,
		);
		return finish();
	}
	if (stat.isDirectory()) {
		lines.push(`## ${relative || "/"}`, buildDirListing(localPath, relative));
		return finish();
	}
	if (isBinaryFile(fullPath)) {
		lines.push(
			`## ${relative}`,
			`Binary file (${extname(relative).replace(".", "")}, ${formatFileSize(stat.size)}). Use \`read\` or \`bash\` tools at the path above to inspect.`,
		);
		return { text: lines.join("\n"), truncated };
	}
	let content: string;
	try {
		content = readFileSync(fullPath, "utf-8");
	} catch {
		lines.push(`Could not read \`${relative}\` as UTF-8 text.`);
		return finish();
	}
	lines.push(`## ${relative}`);
	if (content.length > MAX_INLINE_FILE_CHARS) {
		truncated = true;
		lines.push(
			content.slice(0, MAX_INLINE_FILE_CHARS),
			"",
			`[File truncated at 100K chars. Full file: ${fullPath}]`,
		);
	} else {
		lines.push(content);
	}
	return finish();
}

function rateLimitFailure(
	response: HttpResponse,
	info: GitHubIssuePrUrlInfo,
	scope: RequestScope,
): WebkitError | null {
	const exhausted =
		(response.status === 403 &&
			response.headers["x-ratelimit-remaining"] === "0") ||
		response.status === 429;
	if (!exhausted) return null;
	const reset = Number(response.headers["x-ratelimit-reset"]);
	const retryAfter = Number(response.headers["retry-after"]);
	const retryAfterMs =
		Number.isFinite(retryAfter) && retryAfter > 0
			? retryAfter * 1000
			: Number.isFinite(reset) && reset > 0
				? Math.max(0, reset * 1000 - scope.now())
				: undefined;
	return new WebkitError(
		"quota",
		`GitHub API rate limit reached for ${info.owner}/${info.repo} ${info.kind} #${info.number}.${Number.isFinite(reset) && reset > 0 ? ` Rate limit resets at Unix time ${reset}.` : ""}`,
		retryAfterMs === undefined ? {} : { retryAfterMs },
	);
}

async function restJson(
	scope: RequestScope,
	info: GitHubIssuePrUrlInfo,
	path: string,
): Promise<{ ok: boolean; value: unknown }> {
	const response = await apiRequest(scope, path);
	const limited = rateLimitFailure(response, info, scope);
	if (limited) throw limited;
	const ok = response.status >= 200 && response.status < 300;
	return { ok, value: ok ? parseJson(response) : null };
}

async function readIssuePr(
	url: string,
	info: GitHubIssuePrUrlInfo,
	scope: RequestScope,
): Promise<SourceDocument | null> {
	const base = `/repos/${info.owner}/${info.repo}`;
	const main = await restJson(
		scope,
		info,
		info.kind === "pull"
			? `${base}/pulls/${info.number}`
			: `${base}/issues/${info.number}`,
	);
	if (!main.ok) return null;
	const view = mapRestView(info, main.value);
	view.linkedReferencesUnavailable = true;

	const comments = await restJson(
		scope,
		info,
		`${base}/issues/${info.number}/comments?per_page=50`,
	);
	const conversationComments = comments.ok ? objectArray(comments.value) : [];
	const issueCommentId = anchorId(info.anchor, "issuecomment");
	if (issueCommentId && !hasCommentId(conversationComments, issueCommentId)) {
		const anchored = await restJson(
			scope,
			info,
			`${base}/issues/comments/${issueCommentId}`,
		);
		if (
			anchored.ok &&
			isRecord(anchored.value) &&
			belongsToIssue(anchored.value, issueCommentId, info)
		)
			conversationComments.push(anchored.value);
		else view.anchorUnavailable = true;
	}
	view.comments = conversationComments;

	const reviewThreads: Record<string, unknown>[] = [];
	const notes = [
		info.kind === "pull"
			? "Checks are unavailable from the public GitHub REST API; use gh for check status."
			: "Public GitHub REST API used; linked pull requests are unavailable.",
	];
	if (info.kind === "pull") {
		view.reviewsUnavailable = true;
		view.commitsUnavailable = true;
		const files = await restJson(
			scope,
			info,
			`${base}/pulls/${info.number}/files?per_page=50`,
		);
		if (files.ok && Array.isArray(files.value)) view.files = files.value;
		const threads = await restJson(
			scope,
			info,
			`${base}/pulls/${info.number}/comments?per_page=50`,
		);
		if (threads.ok) reviewThreads.push(...objectArray(threads.value));
		const discussionId = anchorId(info.anchor, "discussion_r");
		if (discussionId && !hasCommentId(reviewThreads, discussionId)) {
			const anchored = await restJson(
				scope,
				info,
				`${base}/pulls/comments/${discussionId}`,
			);
			if (
				anchored.ok &&
				isRecord(anchored.value) &&
				belongsToPull(anchored.value, discussionId, info)
			)
				reviewThreads.push(anchored.value);
			else view.anchorUnavailable = true;
		}
	}
	const rendered = renderGitHubPrIssue({
		url,
		owner: info.owner,
		repo: info.repo,
		kind: info.kind,
		number: info.number,
		anchor: info.anchor,
		view,
		reviewThreads,
		fallbackNotes: notes,
	});
	return { url, ...rendered, format: "markdown", extractor: "github-api" };
}

function anchorId(
	anchor: string | undefined,
	prefix: "issuecomment" | "discussion_r",
): string | null {
	const match = anchor?.match(
		prefix === "issuecomment"
			? /^issuecomment-(\d+)$/i
			: /^discussion_r(\d+)$/i,
	);
	return match?.[1] ?? null;
}

function hasCommentId(
	comments: Record<string, unknown>[],
	id: string,
): boolean {
	return comments.some((comment) => commentId(comment) === id);
}

function belongsToIssue(
	comment: Record<string, unknown>,
	id: string,
	info: GitHubIssuePrUrlInfo,
): boolean {
	return (
		commentId(comment) === id &&
		associationMatches(comment.issue_url, info, "issues")
	);
}

function belongsToPull(
	comment: Record<string, unknown>,
	id: string,
	info: GitHubIssuePrUrlInfo,
): boolean {
	return (
		commentId(comment) === id &&
		associationMatches(comment.pull_request_url, info, "pulls")
	);
}

function associationMatches(
	value: unknown,
	info: GitHubIssuePrUrlInfo,
	route: "issues" | "pulls",
): boolean {
	if (typeof value !== "string") return false;
	try {
		const parsed = new URL(value);
		if (
			parsed.protocol !== "https:" ||
			parsed.hostname.toLowerCase() !== "api.github.com"
		)
			return false;
		return (
			parsed.pathname.toLowerCase() ===
			`/repos/${info.owner}/${info.repo}/${route}/${info.number}`.toLowerCase()
		);
	} catch {
		return false;
	}
}

function mapRestView(
	info: GitHubIssuePrUrlInfo,
	value: unknown,
): Record<string, unknown> {
	const source = isRecord(value) ? value : {};
	const user = isRecord(source.user) ? source.user : undefined;
	const base = isRecord(source.base) ? source.base : undefined;
	const head = isRecord(source.head) ? source.head : undefined;
	const headOwner =
		head && isRecord(head.repo) && isRecord(head.repo.owner)
			? stringValue(head.repo.owner.login)
			: "";
	return {
		title: stringValue(source.title),
		number: numberValue(source.number) ?? info.number,
		state: stringValue(source.state),
		stateReason: stringValue(source.state_reason),
		isDraft: Boolean(source.draft),
		author: { login: user ? stringValue(user.login) : "" },
		baseRefName: base ? stringValue(base.ref) : "",
		headRefName: head ? stringValue(head.ref) : "",
		headRepositoryOwner: { login: headOwner },
		createdAt: stringValue(source.created_at),
		mergedAt: stringValue(source.merged_at),
		closedAt: stringValue(source.closed_at),
		labels: source.labels,
		assignees: source.assignees,
		milestone: source.milestone,
		additions: source.additions,
		deletions: source.deletions,
		changedFiles: source.changed_files,
		body: stringValue(source.body),
		url: stringValue(source.html_url),
		commentsCount: source.comments,
		reviewCommentsCount: source.review_comments,
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function authorLogin(value: unknown): string {
	if (!isRecord(value)) return "unknown";
	return typeof value.login === "string" && value.login
		? value.login
		: "unknown";
}

function listNames(value: unknown): string {
	const names = objectArray(value)
		.map(
			(item) =>
				stringValue(item.name) ||
				stringValue(item.login) ||
				stringValue(item.title),
		)
		.filter(Boolean);
	return names.length > 0 ? names.join(", ") : "none";
}

function milestoneTitle(value: unknown): string {
	return isRecord(value) ? stringValue(value.title) || "none" : "none";
}

function truncateText(
	text: string,
	limit: number,
	label: string,
	appendix: string[],
): string {
	if (text.length <= limit) return text;
	const lastSpace = text.slice(0, limit + 1).search(/\s\S*$/);
	const cut = lastSpace > limit * 0.8 ? lastSpace : limit;
	appendix.push(`## ${label} (continued)\n\n${text.slice(cut)}`);
	return `${text.slice(0, cut)}\n\n[${label} truncated; the rest is stored under "${label} (continued)": use ${RETRIEVAL_TOOL} findText or offset]`;
}

function storeOmitted(
	appendix: string[],
	section: string,
	items: string[],
): void {
	if (items.length > 0)
		appendix.push(`## ${section} (continued)\n\n${items.join("\n")}`);
}

function omissionMarker(
	section: string,
	noun: string,
	shown: number,
	fetched: number,
	atLeast: number | null,
	gh = "the gh command below",
): string | null {
	const stored =
		fetched > shown
			? `${fetched - shown} more stored under "${section} (continued)": use ${RETRIEVAL_TOOL} findText or offset`
			: "";
	if (atLeast !== null)
		return `[${shown} ${noun} shown from at least ${atLeast}; ${stored ? `${stored}; for the rest ` : ""}use ${gh}]`;
	if (fetched <= shown) return null;
	return `[${shown} of ${fetched} ${noun} shown; ${stored}, or ${gh}]`;
}

function appendLimitedSection(
	lines: string[],
	title: string,
	items: string[],
	max: number,
	marker: string,
	appendix: string[],
): void {
	lines.push(`## ${title}`);
	if (items.length === 0) {
		lines.push("none", "");
		return;
	}
	lines.push(...items.slice(0, max));
	storeOmitted(appendix, title, items.slice(max));
	const omitted = omissionMarker(title, marker, max, items.length, null);
	if (omitted) lines.push(omitted);
	lines.push("");
}

function objectArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function commentId(comment: Record<string, unknown>): string {
	return String(comment.id ?? comment.databaseId ?? "");
}

function anchorMatches(
	anchor: string | undefined,
	comment: Record<string, unknown>,
): boolean {
	if (!anchor) return false;
	const id = commentId(comment);
	return anchor === `issuecomment-${id}` || anchor === `discussion_r${id}`;
}

function renderComments(
	comments: Record<string, unknown>[],
	anchor: string | undefined,
	appendix: string[],
): string[] {
	const forced = anchor
		? comments.find((comment) => anchorMatches(anchor, comment))
		: undefined;
	const selected = comments.slice(0, MAX_INLINE_COMMENTS);
	if (forced && !selected.includes(forced)) selected.push(forced);
	const render = (comment: Record<string, unknown>, inline: boolean) => {
		const body = stringValue(comment.body);
		const label = `comment ${commentId(comment) || comments.indexOf(comment) + 1}`;
		const text = inline
			? truncateText(body, COMMENT_INLINE_CHARS, label, appendix)
			: body;
		return `- ${authorLogin(comment.author ?? comment.user)} at ${stringValue(comment.createdAt) || stringValue(comment.created_at)}${forced === comment ? " [anchored]" : ""}:\n  ${text.replace(/\n/g, "\n  ")}`;
	};
	const lines = selected.map((comment) => render(comment, true));
	storeOmitted(
		appendix,
		"Conversation comments",
		comments
			.slice(MAX_INLINE_COMMENTS)
			.filter((comment) => comment !== forced)
			.map((comment) => render(comment, false)),
	);
	return lines;
}

function commentCountText(view: Record<string, unknown>): string {
	const comments = objectArray(view.comments).length;
	const total = numberValue(view.commentsCount);
	if (total !== null && total > comments) return `at least ${total}`;
	return String(comments || total || 0);
}

function reviewThreadCountText(
	comments: Record<string, unknown>[],
	total: unknown,
	bounded?: boolean,
	unavailable?: boolean,
): string {
	if (unavailable) return "unavailable";
	const knownTotal = numberValue(total);
	if (bounded) return `at least ${comments.length}`;
	if (knownTotal !== null && knownTotal > comments.length)
		return `at least ${knownTotal}`;
	return String(comments.length || knownTotal || 0);
}

function renderChecks(value: unknown, appendix: string[]): string[] {
	const checks = objectArray(value);
	if (checks.length === 0) return ["No check rollup data available."];
	const rows = checks.map((check) => {
		const name =
			stringValue(check.name) ||
			stringValue(check.context) ||
			stringValue(check.workflowName) ||
			"check";
		const state =
			stringValue(check.conclusion) ||
			stringValue(check.status) ||
			stringValue(check.state) ||
			"unknown";
		return `- ${name}: ${state}`;
	});
	const failing = rows.filter(
		(row) => !/(success|neutral|skipped|completed)$/i.test(row),
	);
	storeOmitted(appendix, "Checks", rows.slice(MAX_INLINE_CHECKS));
	const omitted = omissionMarker(
		"Checks",
		"checks",
		MAX_INLINE_CHECKS,
		rows.length,
		null,
	);
	return [
		`Rollup: ${failing.length === 0 ? "no failing checks in shown data" : `${failing.length} non-passing checks in shown data`}`,
		...rows.slice(0, MAX_INLINE_CHECKS),
		...(omitted ? [omitted] : []),
	];
}

function renderReviewVerdicts(
	view: Record<string, unknown>,
	appendix: string[],
): string[] {
	const latest = new Map<string, Record<string, unknown>>();
	for (const review of objectArray(view.reviews))
		latest.set(authorLogin(review.author ?? review.user), review);
	const rendered = [...latest.entries()].map(([author, review]) => {
		const state = stringValue(review.state) || "COMMENTED";
		const body = truncateText(
			stringValue(review.body),
			300,
			`review by ${author}`,
			appendix,
		);
		return `- ${author}: ${state}${body ? ` — ${body.replace(/\n/g, " ")}` : ""}`;
	});
	if (rendered.length > 0) return rendered;
	return view.reviewsUnavailable === true
		? ["Unavailable in this GitHub fetch path; use gh for review verdicts."]
		: [];
}

function appendFilesSection(
	lines: string[],
	view: Record<string, unknown>,
	appendix: string[],
): void {
	lines.push("## Files");
	const files = objectArray(view.files).map((file) => {
		const path = stringValue(file.path) || stringValue(file.filename) || "file";
		return `- ${path} (+${numberValue(file.additions) ?? 0}/−${numberValue(file.deletions) ?? 0})`;
	});
	const total = numberValue(view.changedFiles);
	const omitted = omissionMarker(
		"Files",
		"files",
		Math.min(files.length, MAX_INLINE_FILES),
		files.length,
		total !== null && total > files.length ? total : null,
	);
	if (files.length === 0 && !omitted) lines.push("none");
	lines.push(...files.slice(0, MAX_INLINE_FILES));
	storeOmitted(appendix, "Files", files.slice(MAX_INLINE_FILES));
	if (omitted) lines.push(omitted);
	lines.push("");
}

function renderCommits(view: Record<string, unknown>): string[] {
	const rendered = objectArray(view.commits).map((commit) => {
		const oid = stringValue(commit.oid) || stringValue(commit.sha);
		const message =
			stringValue(commit.messageHeadline) ||
			(isRecord(commit.commit)
				? stringValue(commit.commit.message).split("\n")[0]
				: "");
		return `- ${oid.slice(0, 7)} ${message}`.trim();
	});
	if (rendered.length > 0) return rendered;
	return view.commitsUnavailable === true
		? ["Unavailable in this GitHub fetch path; use gh for commits."]
		: [];
}

function renderLinked(
	view: Record<string, unknown>,
	field: "closingIssuesReferences" | "closedByPullRequestsReferences",
): string[] {
	const linked = objectArray(view[field]).map(
		(item) =>
			`- #${numberValue(item.number) ?? "?"} ${stringValue(item.title)}${field === "closedByPullRequestsReferences" ? ` (${stringValue(item.url)})` : ""}`,
	);
	if (linked.length > 0) return linked;
	return view.linkedReferencesUnavailable === true
		? ["Unavailable in this GitHub fetch path; use gh for linked references."]
		: [];
}

function renderReviewThreads(
	comments: Record<string, unknown>[],
	anchor: string | undefined,
	appendix: string[],
	total?: unknown,
	bounded?: boolean,
	unavailable?: boolean,
): string[] {
	if (unavailable)
		return [
			"Unavailable in this GitHub fetch path; use gh for review thread comments.",
		];
	const forced = anchor
		? comments.find((comment) => anchorMatches(anchor, comment))
		: undefined;
	const selected = comments.slice(0, MAX_INLINE_REVIEW_THREADS);
	if (forced && !selected.includes(forced)) selected.push(forced);
	const render = (comment: Record<string, unknown>, inline: boolean) => {
		const path = stringValue(comment.path) || "unknown path";
		const line =
			numberValue(comment.line) ??
			numberValue(comment.original_line) ??
			numberValue(comment.position) ??
			"?";
		const text = stringValue(comment.body);
		const body = inline
			? truncateText(
					text,
					COMMENT_INLINE_CHARS,
					`review thread comment ${commentId(comment) || comments.indexOf(comment) + 1}`,
					appendix,
				)
			: text;
		return `- ${path}:${line} — ${authorLogin(comment.user ?? comment.author)}${forced === comment ? " [anchored]" : ""} (resolution state unknown):\n  ${body.replace(/\n/g, "\n  ")}`;
	};
	const lines = selected.map((comment) => render(comment, true));
	storeOmitted(
		appendix,
		"Review thread comments",
		comments
			.slice(MAX_INLINE_REVIEW_THREADS)
			.filter((comment) => comment !== forced)
			.map((comment) => render(comment, false)),
	);
	const knownTotal = numberValue(total);
	const atLeast = bounded
		? comments.length
		: knownTotal !== null && knownTotal > comments.length
			? knownTotal
			: null;
	const omitted = omissionMarker(
		"Review thread comments",
		"review thread comments",
		selected.length,
		comments.length,
		atLeast,
		"gh api repos/<owner>/<repo>/pulls/<number>/comments",
	);
	if (omitted) lines.push(omitted);
	return lines;
}

export function renderGitHubPrIssue(data: RenderData): Rendered {
	const { view } = data;
	const appendix: string[] = [];
	const title =
		stringValue(view.title) || `${data.owner}/${data.repo}#${data.number}`;
	const number = numberValue(view.number) ?? data.number;
	const stateParts = [stringValue(view.state) || "unknown"];
	if (view.isDraft === true) stateParts.push("draft");
	const lines: string[] = [`#${number} ${title}`, ""];
	lines.push(`- type: ${data.kind}`);
	lines.push(
		`- state: ${stateParts.join(" ")}${stringValue(view.stateReason) ? ` (${stringValue(view.stateReason)})` : ""}`,
	);
	lines.push(`- author: ${authorLogin(view.author)}`);
	if (data.kind === "pull") {
		const headOwner = authorLogin(view.headRepositoryOwner);
		const headRef = stringValue(view.headRefName);
		const head =
			headOwner !== "unknown" && headOwner !== data.owner
				? `${headOwner}:${headRef}`
				: headRef;
		lines.push(`- branch: ${stringValue(view.baseRefName)} ← ${head}`);
		const commitSummary =
			view.commitsUnavailable === true
				? "commits unavailable"
				: `${objectArray(view.commits).length} commits`;
		lines.push(
			`- changes: +${numberValue(view.additions) ?? 0} −${numberValue(view.deletions) ?? 0}, ${numberValue(view.changedFiles) ?? objectArray(view.files).length} files, ${commitSummary}`,
		);
	} else {
		lines.push(`- assignees: ${listNames(view.assignees)}`);
	}
	lines.push(`- created: ${stringValue(view.createdAt) || "unknown"}`);
	if (stringValue(view.mergedAt))
		lines.push(`- merged: ${stringValue(view.mergedAt)}`);
	if (stringValue(view.closedAt))
		lines.push(`- closed: ${stringValue(view.closedAt)}`);
	lines.push(`- labels: ${listNames(view.labels)}`);
	lines.push(`- milestone: ${milestoneTitle(view.milestone)}`);
	lines.push(
		`- comments: ${commentCountText(view)}; review threads: ${reviewThreadCountText(data.reviewThreads, view.reviewCommentsCount, data.reviewThreadsBounded, data.reviewThreadsUnavailable)}`,
	);
	if (data.anchor) lines.push(`- requested anchor: #${data.anchor}`);
	lines.push("");

	lines.push("## Body");
	lines.push(
		truncateText(
			stringValue(view.body) || "(empty)",
			BODY_INLINE_CHARS,
			"body",
			appendix,
		),
		"",
	);

	if (data.kind === "pull") {
		lines.push("## Checks");
		lines.push(...renderChecks(view.statusCheckRollup, appendix), "");
		appendLimitedSection(
			lines,
			"Review verdicts",
			renderReviewVerdicts(view, appendix),
			MAX_INLINE_REVIEWS,
			"review verdicts",
			appendix,
		);
		appendLimitedSection(
			lines,
			"Linked references",
			renderLinked(view, "closingIssuesReferences"),
			20,
			"linked references",
			appendix,
		);
		appendFilesSection(lines, view, appendix);
		appendLimitedSection(
			lines,
			"Commits",
			renderCommits(view),
			MAX_INLINE_COMMITS,
			"commits",
			appendix,
		);
	} else {
		appendLimitedSection(
			lines,
			"Closed by pull requests",
			renderLinked(view, "closedByPullRequestsReferences"),
			20,
			"pull requests",
			appendix,
		);
	}
	lines.push("## Conversation comments");
	const comments = objectArray(view.comments);
	const commentLines = renderComments(comments, data.anchor, appendix);
	const knownCommentTotal = numberValue(view.commentsCount);
	const commentMarker = omissionMarker(
		"Conversation comments",
		"comments",
		commentLines.length,
		comments.length,
		knownCommentTotal !== null && knownCommentTotal > comments.length
			? knownCommentTotal
			: null,
		"gh issue view -c",
	);
	if (commentMarker) commentLines.push(commentMarker);
	if (
		view.anchorUnavailable === true &&
		data.anchor?.startsWith("issuecomment-")
	)
		commentLines.push(
			"[anchored comment unavailable for this issue or pull request]",
		);
	lines.push(...(commentLines.length > 0 ? commentLines : ["none"]), "");
	if (data.kind === "pull") {
		lines.push("## Review thread comments");
		const threadLines = renderReviewThreads(
			data.reviewThreads,
			data.anchor,
			appendix,
			view.reviewCommentsCount,
			data.reviewThreadsBounded,
			data.reviewThreadsUnavailable,
		);
		if (
			view.anchorUnavailable === true &&
			data.anchor?.startsWith("discussion_r")
		)
			threadLines.push(
				"[anchored review thread comment unavailable for this pull request]",
			);
		lines.push(...(threadLines.length > 0 ? threadLines : ["none"]), "");
	}
	if (data.fallbackNotes.length > 0)
		lines.push(
			"## Availability notes",
			...data.fallbackNotes.map((note) => `- ${note}`),
			"",
		);
	const viewCommand =
		data.kind === "pull"
			? `gh pr view ${data.number} --repo ${data.owner}/${data.repo}`
			: `gh issue view ${data.number} --repo ${data.owner}/${data.repo} -c`;
	const diffCommand =
		data.kind === "pull"
			? `gh pr diff ${data.number} --repo ${data.owner}/${data.repo}`
			: "";
	lines.push("## Escalation commands");
	lines.push(`- Full view: \`${viewCommand}\``);
	if (diffCommand) lines.push(`- Complete diff: \`${diffCommand}\``);
	lines.push(
		`- Stored full document: use \`${RETRIEVAL_TOOL}\` with \`offset\` or \`findText\`.`,
	);
	if (appendix.length > 0)
		lines.push("", "## Appendix", "", appendix.join("\n\n"));
	const content = lines.join("\n");
	const truncated = content.length > MAX_DOC_CHARS;
	return {
		title: `${data.owner}/${data.repo} ${data.kind} #${data.number}: ${title}`,
		text: truncated
			? `${content.slice(0, MAX_DOC_CHARS)}\n\n[GitHub document truncated at ${MAX_DOC_CHARS} chars; use \`${viewCommand}\`${diffCommand ? ` or \`${diffCommand}\`` : ""} for complete data]`
			: content,
		truncated,
	};
}
