// Stateless command-line client. Device commands need --url and --token-file (or RENDER_URL / RENDER_TOKEN_FILE);
// admin commands use the data directory's owner-only socket. Results are JSON on stdout, except `chat`, which prints the
// conversation as text.
// Exit codes: 0 accepted/ok, 1 refused, 2 usage, 3 transport failure or unknown outcome, 4 stream ended, 5 upgrade needed.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { text as readStream } from "node:stream/consumers";
import { parseArgs } from "node:util";
import * as Effect from "effect/Effect";
import { fromPromise, runPromise } from "../effect.ts";
import { AdminClient, type RenderClient as Client, RenderClient, type Reply, UnsupportedFrameVersion } from "./client.ts";

const USAGE = `usage:
  cli.ts [--url U] [--token-file F] snapshot
  cli.ts ... create-workflow --title T --project P [--command-id ID]
  cli.ts ... save --workflow W --document D --file PATH --expected REVISION|none [--media-type text/markdown|text/plain] [--command-id ID]
  cli.ts ... read --revision R --out PATH
  cli.ts ... add-project --name N --remote URL --default-branch B --check-image IMAGE [--principles PATH] [--command-id ID]
  cli.ts ... edit-project --project P --expected REVISION [--name N] [--default-branch B] [--check-image IMAGE] [--principles PATH]
  cli.ts ... settings show
  cli.ts ... settings change --file SETTINGS.json --expected REVISION [--command-id ID]
  cli.ts ... secrets list
  cli.ts ... secrets set NAME            (reads the value from stdin)
  cli.ts ... send --workflow W --text T [--steer|--follow-up] [--command-id ID]
  cli.ts ... withdraw --workflow W --message COMMAND-ID [--command-id ID]
  cli.ts ... interrupt --workflow W [--command-id ID]
  cli.ts ... chat --workflow W
  cli.ts ... messages --workflow W
  cli.ts ... confirm-ground --workflow W [--command-id ID]
  cli.ts ... accept-intake --workflow W [--command-id ID]
  cli.ts ... approve --workflow W --decide NODE=ALTERNATIVE... [--nonbinding CONCERN,...] [--command-id ID]
  cli.ts ... cancel --workflow W [--command-id ID]
  cli.ts ... intake-concern --workflow W (--text T|--file PATH) [--command-id ID]
  cli.ts ... checkpoint-concern --workflow W (--text T|--file PATH) [--edit] [--command-id ID]
  cli.ts ... cancel-checkpoint --workflow W --reason R [--command-id ID]
  cli.ts ... receipt --command-id ID
  cli.ts ... observe [--frames N]
  cli.ts admin --data DIR enroll --label L [--workflows all|W1,W2]
  cli.ts admin --data DIR import-checkpoint-settings --file PATH --expected REVISION
  cli.ts admin --data DIR revoke --device D
  cli.ts admin --data DIR devices|status`;

type Values = Record<string, string | boolean | string[] | undefined>;
type Action = { readonly type: string; readonly [key: string]: unknown };

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

function need(values: Values, name: string): string {
	const value = values[name];
	if (typeof value !== "string") usage(`missing --${name}`);
	return value;
}

function revision(values: Values): number {
	const expected = Number(need(values, "expected"));
	if (!Number.isSafeInteger(expected)) usage("--expected is a revision number");
	return expected;
}

/** Sends one command envelope; `body` holds `command` and, when the command needs them, `workflow` and `expected`. */
function command(client: Client, body: Record<string, unknown>, commandId: unknown): Effect.Effect<Reply, unknown> {
	return Effect.gen(function* () {
		const snap = yield* client.snapshot();
		if (snap.status !== 200) finish(snap);
		return yield* client.command({
			version: 1,
			authorityEpoch: snap.body.authorityEpoch,
			commandId: typeof commandId === "string" ? commandId : `cli-${randomUUID()}`,
			...body,
		});
	});
}

function nextHumanAction(snapshot: Reply, workflow: string): Action | null {
	const views = (snapshot.body.workflows ?? []) as { workflow: string; nextHumanAction: Action }[];
	return views.find((w) => w.workflow === workflow)?.nextHumanAction ?? null;
}

/**
 * Each human decision answers one host-offered action and sends that action's host-authored basis unchanged; the human
 * adds only the choices the action lists. `decidable` decisions wait for a non-null basis; concerns and cancellations
 * name only the revision under review.
 */
const DECISIONS: Readonly<
	Record<string, { readonly action: string; readonly decidable?: true; build(action: Action, values: Values): Record<string, unknown> }>
> = {
	"confirm-ground": {
		action: "confirmGround",
		build: (a) => ({
			expected: { document: a.expected },
			command: {
				type: "saveDocument",
				document: "ground",
				mediaType: "text/plain",
				content: Buffer.from(String(a.content)).toString("base64"),
			},
		}),
	},
	"accept-intake": {
		action: "reviewIntake",
		decidable: true,
		build: (a) => ({ command: { type: "acceptIntake", ...(a.basis as object) } }),
	},
	"intake-concern": {
		action: "reviewIntake",
		build: (a, values) => ({ command: { type: "saveIntakeConcern", intake: a.intake, text: need(values, "text") } }),
	},
	approve: {
		action: "reviewCheckpoint",
		decidable: true,
		build: (a, values) => {
			const choices = (values.decide ?? []) as string[];
			const decided = Object.fromEntries(choices.map((d) => [d.slice(0, d.indexOf("=")), d.slice(d.indexOf("=") + 1)]));
			const nodes = a.decisions as { node: string; alternatives: string[] }[];
			if (choices.some((d) => d.indexOf("=") < 1) || nodes.some((n) => !Object.hasOwn(decided, n.node)))
				usage(
					`Decide every node with --decide NODE=ALTERNATIVE:\n${nodes.map((n) => `  ${n.node}: ${n.alternatives.join(" | ")}`).join("\n")}`,
				);
			const nonbinding = typeof values.nonbinding === "string" ? values.nonbinding.split(",").filter((c) => c !== "") : [];
			return { command: { type: "approveCheckpoint", ...(a.basis as object), decisions: decided, nonbinding } };
		},
	},
	"checkpoint-concern": {
		action: "reviewCheckpoint",
		build: (a, values) => ({
			command: {
				type: "saveCheckpointConcern",
				request: a.request,
				base: a.emission,
				text: need(values, "text"),
				kind: values.edit ? "edit" : "reason",
			},
		}),
	},
	"cancel-checkpoint": {
		action: "reviewCheckpoint",
		build: (a, values) => ({
			command: { type: "cancelCheckpoint", request: a.request, expectedEmission: a.emission, reason: need(values, "reason") },
		}),
	},
	cancel: {
		action: "cancelWork",
		build: (a) => ({ command: { type: "cancelWork", assignment: a.assignment, generation: a.generation, attempt: a.attempt } }),
	},
};

function decide(client: Client, verb: string, values: Values): Effect.Effect<never, unknown> {
	const decision = DECISIONS[verb]!;
	const workflow = need(values, "workflow");
	return Effect.gen(function* () {
		if (typeof values.file === "string") values.text = yield* fromPromise(() => readFile(values.file as string, "utf8"));
		const commandId = values["command-id"];
		// A rerun after a timeout shows the original outcome instead of deciding again on a newer action.
		if (typeof commandId === "string") {
			const prior = yield* client.receipt(commandId);
			if (prior.status === 200) finish(prior);
		}
		const snap = yield* client.snapshot();
		if (snap.status !== 200) finish(snap);
		const action = nextHumanAction(snap, workflow);
		if (action?.type !== decision.action || (decision.decidable && action.basis === null)) {
			out({ nextHumanAction: action });
			process.stderr.write(
				action?.type === decision.action
					? `${workflow} is not decidable yet; see nextHumanAction.\n`
					: `${workflow} does not offer ${decision.action}; its next human action is ${action?.type ?? "unknown"}.\n`,
			);
			process.exit(1);
		}
		const reply = yield* client.command({
			version: 1,
			authorityEpoch: snap.body.authorityEpoch,
			commandId: typeof commandId === "string" ? commandId : `cli-${randomUUID()}`,
			workflow,
			...decision.build(action, values),
		});
		if (reply.status !== 200 && reply.body.code === "stale_basis") {
			const fresh = yield* client.snapshot();
			out({ refused: reply.body, nextHumanAction: nextHumanAction(fresh, workflow) });
			process.exit(1);
		}
		return finish(reply);
	});
}

type ChatItem = {
	entry: number;
	kind: string;
	text?: string;
	content?: { type: string; text?: string; name?: string }[];
	tool?: string;
	isError?: boolean;
};

/** Prints the committed conversation, then follows it: live text as it streams, each committed item once. */
async function chat(client: Client, workflow: string): Promise<never> {
	const write = (s: string) => process.stdout.write(s);
	let cursor: string | undefined;
	// Live text already printed for the assistant message that has not committed yet; deltas are a prefix of it.
	let streamed = "";
	const print = (item: ChatItem) => {
		if (item.kind === "human") write(`you> ${item.text}\n`);
		if (item.kind === "assistant") {
			const text = (item.content ?? []).flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
			const rest = text.startsWith(streamed) ? text.slice(streamed.length) : `\n${text}`;
			if (text !== "") write(`${rest}\n`);
			streamed = "";
			for (const call of item.content ?? []) if (call.type === "toolCall") write(`[${call.name}]\n`);
		}
		if (item.kind === "tool_result" && item.isError) write(`[${item.tool} failed]\n`);
	};
	const catchUp = async () => {
		for (;;) {
			const page = await runPromise(client.messages(workflow, cursor));
			if (page.status !== 200) return;
			const items = page.body.messages as ChatItem[];
			for (const item of items) print(item);
			if (items.length) cursor = String(items.at(-1)!.entry);
			if (page.body.complete !== false) return;
		}
	};
	let printing = Promise.resolve();
	const then = (step: () => void | Promise<void>) => {
		printing = printing.then(step);
	};
	for await (const frame of client.chat(workflow)) {
		if (frame.kind === "refused") {
			out(frame);
			process.exit(1);
		}
		if (frame.kind === "end") {
			await printing;
			process.stderr.write(`chat ended: ${frame.reason}\n`);
			process.exit(4);
		}
		if (frame.kind === "chat-snapshot") then(catchUp);
		for (const event of (frame.kind === "chat-events" ? frame.events : []) as Record<string, unknown>[]) {
			if (event.type === "text_delta")
				then(() => {
					streamed += String(event.delta);
					write(String(event.delta));
				});
			if (["input_placed", "message_end", "tool_end", "run_end"].includes(String(event.type))) then(catchUp);
			if (event.type === "run_end" && event.outcome !== "completed")
				then(() => {
					write(`[run ${event.outcome}${event.reason ? `: ${event.reason}` : ""}]\n`);
				});
		}
	}
	await printing;
	process.exit(4);
}

async function upgradeNeeded<A>(stream: () => Promise<A>): Promise<A> {
	try {
		return await stream();
	} catch (error) {
		if (!(error instanceof UnsupportedFrameVersion)) throw error;
		process.stderr.write(`The host sent frame version ${error.message}; this client understands version 1. Upgrade the Render client.\n`);
		process.exit(5);
	}
}

function admin(data: string, verb: string | undefined, values: Values): Effect.Effect<never, unknown> {
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
				const workflows = typeof values.workflows !== "string" || values.workflows === "all" ? "all" : values.workflows.split(",");
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
				steer: { type: "boolean" },
				"follow-up": { type: "boolean" },
				message: { type: "string" },
				frames: { type: "string" },
				label: { type: "string" },
				device: { type: "string" },
				name: { type: "string" },
				remote: { type: "string" },
				"default-branch": { type: "string" },
				"check-image": { type: "string" },
				principles: { type: "string" },
				decide: { type: "string", multiple: true },
				nonbinding: { type: "string" },
				edit: { type: "boolean" },
				reason: { type: "string" },
			},
		});
		const [verb, sub] = positionals;
		if (verb === "admin") return yield* admin(need(values, "data"), sub, values);
		const url = values.url ?? process.env.RENDER_URL;
		const tokenFile = values["token-file"] ?? process.env.RENDER_TOKEN_FILE;
		if (url === undefined || tokenFile === undefined) usage("missing --url or --token-file");
		const token = yield* fromPromise(() => readFile(tokenFile, "utf8"));
		const client = new RenderClient(url, token.trim());
		const id = values["command-id"];
		if (verb !== undefined && Object.hasOwn(DECISIONS, verb)) return yield* decide(client, verb, values);
		switch (verb) {
			case "snapshot":
				return finish(yield* client.snapshot());
			case "create-workflow":
				return finish(
					yield* command(
						client,
						{ command: { type: "createWorkflow", title: need(values, "title"), project: need(values, "project") } },
						id,
					),
				);
			case "save": {
				const expected = need(values, "expected");
				const bytes = yield* fromPromise(() => readFile(need(values, "file")));
				return finish(
					yield* command(
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
						id,
					),
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
			case "add-project":
				return finish(
					yield* command(
						client,
						{
							command: {
								type: "addProject",
								name: need(values, "name"),
								remote: need(values, "remote"),
								defaultBranch: need(values, "default-branch"),
								checkImage: need(values, "check-image"),
								...(values.principles === undefined ? {} : { principles: values.principles }),
							},
						},
						id,
					),
				);
			case "edit-project": {
				const project = need(values, "project");
				const expectedRevision = revision(values);
				const snap = yield* client.snapshot();
				if (snap.status !== 200) finish(snap);
				// Fields the human does not name keep the host's current values; the expected revision guards the rest.
				const current = ((snap.body.projects ?? []) as Record<string, string>[]).find((p) => p.id === project);
				if (!current) usage(`no visible project ${project}`);
				return finish(
					yield* client.command({
						version: 1,
						authorityEpoch: snap.body.authorityEpoch,
						commandId: id ?? `cli-${randomUUID()}`,
						command: {
							type: "editProject",
							project,
							expectedRevision,
							name: values.name ?? current.name,
							defaultBranch: values["default-branch"] ?? current.defaultBranch,
							checkImage: values["check-image"] ?? current.checkImage,
							principles: values.principles ?? current.principles,
						},
					}),
				);
			}
			case "settings": {
				if (sub === "show") {
					const snap = yield* client.snapshot();
					if (snap.status !== 200) finish(snap);
					out(snap.body.settings);
					process.exit(snap.body.settings ? 0 : 1);
				}
				if (sub !== "change") usage("settings show|change");
				const expectedRevision = revision(values);
				const settings = JSON.parse(yield* fromPromise(() => readFile(need(values, "file"), "utf8")));
				return finish(yield* command(client, { command: { type: "changeEngineSettings", expectedRevision, settings } }, id));
			}
			case "secrets": {
				if (sub === "list") return finish(yield* client.request("GET", "/v1/secrets"));
				const name = positionals[2];
				if (sub !== "set" || name === undefined) usage("secrets list|set NAME");
				// From stdin only: an argument would show in the process list and shell history.
				const value = (yield* fromPromise(() => readStream(process.stdin))).replace(/\r?\n$/, "");
				return finish(yield* client.request("PUT", `/v1/secrets/${encodeURIComponent(name)}`, { value }));
			}
			case "send": {
				if (values.steer && values["follow-up"]) usage("choose one of --steer and --follow-up");
				const whenBusy = values.steer ? "steer" : "followUp";
				return finish(
					yield* command(
						client,
						{ workflow: need(values, "workflow"), command: { type: "postCoordinatorMessage", text: need(values, "text"), whenBusy } },
						id,
					),
				);
			}
			case "withdraw":
				return finish(
					yield* command(
						client,
						{ workflow: need(values, "workflow"), command: { type: "withdrawCoordinatorMessage", message: need(values, "message") } },
						id,
					),
				);
			case "interrupt":
				return finish(yield* command(client, { workflow: need(values, "workflow"), command: { type: "interruptCoordinator" } }, id));
			case "chat":
				return yield* fromPromise(() => upgradeNeeded(() => chat(client, need(values, "workflow"))));
			case "messages":
				return finish(yield* client.messages(need(values, "workflow")));
			case "receipt":
				return finish(yield* client.receipt(need(values, "command-id")));
			case "observe": {
				const limit = values.frames === undefined ? Number.POSITIVE_INFINITY : Number(values.frames);
				yield* fromPromise(() =>
					upgradeNeeded(async () => {
						let count = 0;
						for await (const frame of client.observe()) {
							out(frame);
							if (frame.kind === "refused") process.exit(1);
							if (frame.kind === "end") process.exit(4);
							if (++count >= limit) process.exit(0);
						}
						process.exit(0);
					}),
				);
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
