// Stateless command-line client. Device commands need --url and --token-file (or RENDER_URL / RENDER_TOKEN_FILE);
// admin commands use the data directory's owner-only socket. Results are JSON on stdout.
// Exit codes: 0 accepted/ok, 1 refused, 2 usage, 3 transport failure or unknown outcome, 4 stream ended, 5 upgrade needed.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import * as Effect from "effect/Effect";
import { fromPromise, runPromise } from "../effect.ts";
import { AdminClient, type RenderClient as Client, RenderClient, type Reply, UnsupportedFrameVersion } from "./client.ts";

const USAGE = `usage:
  cli.ts [--url U] [--token-file F] snapshot
  cli.ts ... create-workflow --title T --project P [--command-id ID]
  cli.ts ... save --workflow W --document D --file PATH --expected REVISION|none [--media-type text/markdown|text/plain] [--command-id ID]
  cli.ts ... read --revision R --out PATH
  cli.ts ... message --workflow W --text T [--command-id ID]
  cli.ts ... messages --workflow W
  cli.ts ... receipt --command-id ID
  cli.ts ... observe [--frames N]
  cli.ts admin --data DIR enroll --label L [--workflows all|W1,W2]
  cli.ts admin --data DIR import-checkpoint-settings --file PATH --expected REVISION
  cli.ts admin --data DIR revoke --device D
  cli.ts admin --data DIR devices|status`;

function out(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}

function finish(reply: Reply): never {
	out(reply.body);
	process.exit(reply.status === 200 ? 0 : reply.status === 503 ? 3 : 1);
}

function usage(message?: string): never {
	process.stderr.write(`${message === undefined ? "" : `${message}\n`}${USAGE}\n`);
	process.exit(2);
}

function need(values: Record<string, string | undefined>, name: string): string {
	const value = values[name];
	if (value === undefined) usage(`missing --${name}`);
	return value;
}

function command(client: Client, body: Record<string, unknown>, commandId: string | undefined): Effect.Effect<never, unknown> {
	return Effect.gen(function* () {
		const snap = yield* client.snapshot();
		if (snap.status !== 200) finish(snap);
		return finish(
			yield* client.command({
				version: 1,
				authorityEpoch: snap.body.authorityEpoch,
				commandId: commandId ?? `cli-${randomUUID()}`,
				...body,
			}),
		);
	});
}

function admin(data: string, verb: string | undefined, values: Record<string, string | undefined>): Effect.Effect<never, unknown> {
	return Effect.gen(function* () {
		const socket = join(data, "admin.sock");
		if (!existsSync(socket)) {
			process.stderr.write(`no admin socket at ${socket}; is a Render host running on this data directory?\n`);
			process.exit(3);
		}
		const client = new AdminClient(socket);
		const status = yield* client.request("GET", "/v1/admin/status");
		const envelope = (command: Record<string, unknown>) => ({
			version: 1,
			authorityEpoch: status.body.authorityEpoch,
			commandId: values["command-id"] ?? `admin-${randomUUID()}`,
			command,
		});
		switch (verb) {
			case "enroll": {
				const workflows = values.workflows === undefined || values.workflows === "all" ? "all" : values.workflows.split(",");
				const r = yield* client.request(
					"POST",
					"/v1/admin/commands",
					envelope({ type: "enrollDevice", label: need(values, "label"), scope: { workflows } }),
				);
				if (r.status !== 200) finish(r);
				const result = r.body.result as Record<string, unknown>;
				const credential = r.body.credential as Record<string, unknown> | undefined;
				// The bearer is shown exactly once; store it in a 0600 file for the client device.
				out({ device: result.device, scope: result.scope, bearer: credential?.bearer ?? null, receipt: r.body.receipt });
				process.exit(0);
				break;
			}
			case "import-checkpoint-settings": {
				const expectedRevision = need(values, "expected");
				const file = yield* fromPromise(() => readFile(need(values, "file"), "utf8"));
				finish(
					yield* client.request(
						"POST",
						"/v1/admin/commands",
						envelope({
							type: "importCheckpointSettings",
							expectedRevision,
							modes: JSON.parse(file),
						}),
					),
				);
				break;
			}
			case "revoke":
				finish(yield* client.request("POST", "/v1/admin/commands", envelope({ type: "revokeDevice", device: need(values, "device") })));
				break;
			case "devices":
				finish(yield* client.request("GET", "/v1/admin/devices"));
				break;
			case "status":
				finish(status);
				break;
			default:
				usage(`unknown admin command ${verb}`);
		}
	});
}

function main(): Effect.Effect<void, unknown> {
	return Effect.gen(function* () {
		const { positionals, values } = parseArgs({
			allowPositionals: true,
			options: {
				url: { type: "string" },
				"token-file": { type: "string" },
				data: { type: "string" },
				title: { type: "string" },
				project: { type: "string" },
				workflow: { type: "string" },
				workflows: { type: "string" },
				document: { type: "string" },
				file: { type: "string" },
				expected: { type: "string" },
				"media-type": { type: "string" },
				"command-id": { type: "string" },
				revision: { type: "string" },
				out: { type: "string" },
				text: { type: "string" },
				frames: { type: "string" },
				label: { type: "string" },
				device: { type: "string" },
			},
		});
		const [verb, sub] = positionals;
		if (verb === "admin") return yield* admin(need(values, "data"), sub, values);
		const url = values.url ?? process.env.RENDER_URL;
		const tokenFile = values["token-file"] ?? process.env.RENDER_TOKEN_FILE;
		if (url === undefined || tokenFile === undefined) usage("missing --url or --token-file");
		const token = yield* fromPromise(() => readFile(tokenFile, "utf8"));
		const client = new RenderClient(url, token.trim());
		switch (verb) {
			case "snapshot":
				return finish(yield* client.snapshot());
			case "create-workflow":
				return yield* command(
					client,
					{ command: { type: "createWorkflow", title: need(values, "title"), project: need(values, "project") } },
					values["command-id"],
				);
			case "save": {
				const expected = need(values, "expected");
				const bytes = yield* fromPromise(() => readFile(need(values, "file")));
				return yield* command(
					client,
					{
						workflow: need(values, "workflow"),
						expected: { document: expected === "none" ? null : expected },
						command: {
							type: "saveDocument",
							document: need(values, "document"),
							mediaType: values["media-type"] ?? "text/markdown",
							content: bytes.toString("base64"),
						},
					},
					values["command-id"],
				);
			}
			case "read": {
				const r = yield* client.artifact(need(values, "revision"));
				if (r.status !== 200) finish(r);
				const { content, ...metadata } = r.body;
				yield* fromPromise(() => writeFile(need(values, "out"), Buffer.from(String(content), "base64")));
				out(metadata);
				process.exit(0);
				break;
			}
			case "message":
				return yield* command(
					client,
					{ workflow: need(values, "workflow"), command: { type: "postCoordinatorMessage", text: need(values, "text") } },
					values["command-id"],
				);
			case "messages":
				return finish(yield* client.messages(need(values, "workflow")));
			case "receipt":
				return finish(yield* client.receipt(need(values, "command-id")));
			case "observe": {
				const limit = values.frames === undefined ? Number.POSITIVE_INFINITY : Number(values.frames);
				yield* fromPromise(async () => {
					let count = 0;
					try {
						for await (const frame of client.observe()) {
							out(frame);
							if (frame.kind === "refused") process.exit(1);
							if (frame.kind === "end") process.exit(4);
							if (++count >= limit) process.exit(0);
						}
					} catch (error) {
						if (error instanceof UnsupportedFrameVersion) {
							process.stderr.write(
								`The host sent observation frame version ${error.message}; this client understands version 1. Upgrade the Render client.\n`,
							);
							process.exit(5);
						}
						throw error;
					}
					process.exit(0);
				});
				break;
			}
			default:
				usage(verb === undefined ? undefined : `unknown command ${verb}`);
		}
	});
}

runPromise(main()).catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(3);
});
