// Test-owned process and transport helpers. They deliberately avoid the product client so that
// transport-level expectations are checked with independent code.
import { type ChildProcess, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const HOST_MAIN = join(ROOT, "src/host/main.ts");
export const CLIENT_CLI = join(ROOT, "src/client/cli.ts");

export type HostEvent = { event: string; [key: string]: unknown };

export type HostProcess = {
	proc: ChildProcess;
	data: string;
	url: string;
	admin: string;
	ready: HostEvent;
	events: HostEvent[];
	stderr: string[];
	stdout: string[];
	exited: Promise<number | null>;
	waitForEvent(name: string, timeoutMs?: number): Promise<HostEvent>;
	kill(): Promise<void>;
	stop(): Promise<void>;
};

export async function tempDir(prefix: string): Promise<{ path: string; remove(): Promise<void> }> {
	const path = await mkdtemp(join(tmpdir(), `render-${prefix}-`));
	return { path, remove: () => rm(path, { recursive: true, force: true }) };
}

export type SpawnResult = { code: number | null; events: HostEvent[]; stderr: string; stdout: string };

/** Spawn a host and wait for it to exit or become ready. */
export function spawnHost(
	data: string,
	env: Record<string, string> = {},
): {
	proc: ChildProcess;
	events: HostEvent[];
	stdout: string[];
	stderr: string[];
	exited: Promise<number | null>;
	next(name: string, timeoutMs?: number): Promise<HostEvent>;
} {
	const proc = spawn(process.execPath, [HOST_MAIN, "serve", "--data", data, "--port", "0"], {
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	const events: HostEvent[] = [];
	const stdout: string[] = [];
	const stderr: string[] = [];
	const waiters: { name: string; resolve(e: HostEvent): void }[] = [];
	const onLine = (line: string, sink: string[]) => {
		sink.push(line);
		try {
			const e = JSON.parse(line) as HostEvent;
			if (typeof e.event === "string") {
				events.push(e);
				for (const w of waiters.splice(0)) {
					if (w.name === e.event) w.resolve(e);
					else waiters.push(w);
				}
			}
		} catch {
			// Non-JSON diagnostic line.
		}
	};
	createInterface({ input: proc.stdout as NodeJS.ReadableStream }).on("line", (l) => onLine(l, stdout));
	createInterface({ input: proc.stderr as NodeJS.ReadableStream }).on("line", (l) => onLine(l, stderr));
	const exited = new Promise<number | null>((resolve) => proc.on("exit", (code) => resolve(code)));
	const next = (name: string, timeoutMs = 15_000) =>
		new Promise<HostEvent>((resolve, reject) => {
			const found = events.find((e) => e.event === name);
			if (found) return resolve(found);
			const timer = setTimeout(() => reject(new Error(`timed out waiting for ${name}; stderr: ${stderr.join("\n")}`)), timeoutMs);
			waiters.push({
				name,
				resolve: (e) => {
					clearTimeout(timer);
					resolve(e);
				},
			});
			exited.then((code) => {
				clearTimeout(timer);
				if (!events.some((e) => e.event === name)) reject(new Error(`host exited ${code} before ${name}; stderr: ${stderr.join("\n")}`));
			});
		});
	return { proc, events, stdout, stderr, exited, next };
}

export async function startHost(data: string, env: Record<string, string> = {}): Promise<HostProcess> {
	const s = spawnHost(data, env);
	const ready = await s.next("ready");
	const kill = async () => {
		if (s.proc.exitCode === null && s.proc.signalCode === null) s.proc.kill("SIGKILL");
		await s.exited;
	};
	const stop = async () => {
		if (s.proc.exitCode === null && s.proc.signalCode === null) {
			s.proc.kill("SIGTERM");
			const timer = setTimeout(() => s.proc.kill("SIGKILL"), 2_000);
			await s.exited;
			clearTimeout(timer);
		}
	};
	return {
		proc: s.proc,
		data,
		url: String(ready.url),
		admin: String(ready.admin),
		ready,
		events: s.events,
		stderr: s.stderr,
		stdout: s.stdout,
		exited: s.exited,
		waitForEvent: s.next,
		kill,
		stop,
	};
}

export type Reply = { status: number; body: Record<string, unknown>; text: string };

export async function http(
	url: string,
	method: string,
	path: string,
	options: { bearer?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
	const headers: Record<string, string> = { ...(options.headers ?? {}) };
	if (options.bearer !== undefined) headers.authorization = `Bearer ${options.bearer}`;
	if (options.body !== undefined) headers["content-type"] = "application/json";
	const res = await fetch(new URL(path, url), {
		method,
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await res.text();
	let body: Record<string, unknown> = {};
	try {
		body = JSON.parse(text) as Record<string, unknown>;
	} catch {
		body = {};
	}
	return { status: res.status, body, text };
}

export function adminRequest(socketPath: string, method: string, path: string, body?: unknown): Promise<Reply> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = request(
			{ socketPath, method, path, headers: payload === undefined ? {} : { "content-type": "application/json" } },
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (c: Buffer) => chunks.push(c));
				res.on("end", () => {
					const text = Buffer.concat(chunks).toString("utf8");
					let parsed: Record<string, unknown> = {};
					try {
						parsed = JSON.parse(text) as Record<string, unknown>;
					} catch {
						parsed = {};
					}
					resolve({ status: res.statusCode ?? 0, body: parsed, text });
				});
			},
		);
		req.on("error", reject);
		if (payload !== undefined) req.write(payload);
		req.end();
	});
}

export function envelope(
	authorityEpoch: string,
	command: Record<string, unknown>,
	extra: { commandId?: string; workflow?: string; expected?: Record<string, unknown> } = {},
): Record<string, unknown> {
	const e: Record<string, unknown> = { version: 1, authorityEpoch, commandId: extra.commandId ?? `t-${randomUUID()}`, command };
	if (extra.workflow !== undefined) e.workflow = extra.workflow;
	if (extra.expected !== undefined) e.expected = extra.expected;
	return e;
}

export async function enroll(
	host: { admin: string; ready: HostEvent },
	label: string,
	workflows: "all" | string[] = "all",
): Promise<{ device: string; bearer: string; reply: Reply }> {
	const reply = await adminRequest(
		host.admin,
		"POST",
		"/v1/admin/commands",
		envelope(String(host.ready.authorityEpoch), { type: "enrollDevice", label, scope: { workflows } }),
	);
	if (reply.status !== 200) throw new Error(`enroll failed: ${reply.text}`);
	const result = reply.body.result as Record<string, unknown>;
	const credential = reply.body.credential as Record<string, unknown>;
	return { device: String(result.device), bearer: String(credential.bearer), reply };
}

export async function createWorkflow(host: { url: string; ready: HostEvent }, bearer: string, title: string): Promise<string> {
	const r = await http(host.url, "POST", "/v1/commands", {
		bearer,
		body: envelope(String(host.ready.authorityEpoch), { type: "createWorkflow", title }),
	});
	if (r.status !== 200) throw new Error(`createWorkflow failed: ${r.text}`);
	return String((r.body.result as Record<string, unknown>).workflow);
}

export function save(
	host: { url: string; ready: HostEvent },
	bearer: string,
	workflow: string,
	document: string,
	bytes: Buffer,
	expected: string | null,
	commandId?: string,
): Promise<Reply> {
	return http(host.url, "POST", "/v1/commands", {
		bearer,
		body: envelope(
			String(host.ready.authorityEpoch),
			{ type: "saveDocument", document, mediaType: "text/markdown", content: bytes.toString("base64") },
			{ workflow, expected: { document: expected }, commandId },
		),
	});
}

export function sha256(bytes: Buffer): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export const NO_DISCLOSURE_KEYS = ["receipt", "result", "sequence", "workflows", "content", "acceptedBy"];

export function assertNoDisclosure(body: Record<string, unknown>): void {
	for (const key of NO_DISCLOSURE_KEYS) {
		if (key in body) throw new Error(`refusal disclosed ${key}: ${JSON.stringify(body)}`);
	}
}

export function percentile(values: number[], p: number): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN;
}
