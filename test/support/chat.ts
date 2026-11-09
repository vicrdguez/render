// Chat fixtures: a scripted provider whose replies a test can hold open across turns, and a coordinator started
// through the host scheduling path (no launcher yet), on the role fixture's Ledger and Engine.
import { setTimeout } from "node:timers/promises";
import type { AssistantMessage, TranscriptContext } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment, RolePacket } from "../../src/kernel/roles.ts";
import type { Ledger } from "../../src/ledger/ledger.ts";
import type { AuthenticatedContext, Principals } from "../../src/ledger/principals.ts";
import { admin, claudeFixture, packet, roleFixture } from "./roles.ts";

export const WORKFLOW = "workflow:3";

export type ChatRequest = {
	readonly assignment: string;
	readonly role: string;
	/** Every user message the model sees, oldest first. */
	readonly users: readonly string[];
	readonly signal: AbortSignal | undefined;
};
export type Reply = (request: ChatRequest) => AssistantMessage | Promise<AssistantMessage>;

/** A reply the test releases; an abort of the request ends it as the provider would. */
export function held(reply: () => AssistantMessage): Reply & { readonly reached: Promise<void>; release(): void } {
	const reached = Promise.withResolvers<void>();
	const released = Promise.withResolvers<void>();
	const step = async (request: ChatRequest) => {
		reached.resolve();
		const aborted = new Promise<void>((resolve) => request.signal?.addEventListener("abort", () => resolve(), { once: true }));
		await Promise.race([released.promise, aborted]);
		return request.signal?.aborted ? fauxAssistantMessage("", { stopReason: "aborted", errorMessage: "aborted" }) : reply();
	};
	return Object.assign(step, { reached: reached.promise, release: () => released.resolve() });
}

function text(content: unknown): string {
	if (typeof content === "string") return content;
	return Array.isArray(content)
		? content.map((block: { type?: string; text?: string }) => (block.type === "text" ? block.text : "")).join("")
		: "";
}

/**
 * Replies by assignment: each request takes the next reply queued for its assignment, or the fallback. The first
 * packet round of a coordinator ends without a report unless a test queues otherwise.
 */
export function chatProvider() {
	const p = fauxProvider({ provider: "anthropic", api: "anthropic-messages", models: [{ id: "claude-sonnet-4-6" }] });
	const requests: ChatRequest[] = [];
	const queues = new Map<string, Reply[]>();
	p.setResponses(
		Array.from({ length: 400 }, () => async (context: TranscriptContext, options: { signal?: AbortSignal } | undefined) => {
			const system = context.messages.find((m) => m.role === "system" && m.sections && Object.hasOwn(m.sections, "role-packet"));
			const section = String((system as { sections: Record<string, string> } | undefined)?.sections["role-packet"] ?? "{}");
			const rendered = JSON.parse(section.slice(section.indexOf("{"), section.lastIndexOf("}") + 1));
			const request: ChatRequest = {
				assignment: String(rendered.assignment),
				role: String(rendered.packet?.role),
				users: context.messages.filter((m) => m.role === "user").map((m) => text(m.content)),
				signal: options?.signal,
			};
			requests.push(request);
			const next = (queues.get(request.assignment)?.length ? queues.get(request.assignment) : queues.get(request.role))?.shift();
			return next ? next(request) : fauxAssistantMessage(`reply ${requests.length}`);
		}),
	);
	return {
		provider: p.provider,
		requests,
		/** Queue replies for the next requests of one assignment, or of any assignment of a role, in order. */
		reply(key: string, ...replies: Reply[]) {
			queues.set(key, [...(queues.get(key) ?? []), ...replies]);
		},
	};
}

export async function until<T>(read: () => T | undefined | Promise<T | undefined>, what: string, ms = 10_000): Promise<T> {
	const deadline = Date.now() + ms;
	for (;;) {
		const value = await read();
		if (value !== undefined && value !== false) return value;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await setTimeout(10);
	}
}

export function coordinatorPacket(overrides: Partial<RolePacket> = {}): RolePacket {
	return packet({ maxInputBytes: 1024 * 1024, maxTurns: 3, ...overrides });
}

/** An enrolled device: its id, bearer and the context the transport would establish for it. */
export async function device(f: { ledger: Ledger; principals: Principals }, workflows: "all" | string[] = "all") {
	const enrolled = await Effect.runPromise(
		f.ledger.command(
			{
				version: 1,
				authorityEpoch: f.ledger.status().authorityEpoch,
				commandId: `enroll:${Math.random()}`,
				command: { type: "enrollDevice", label: "laptop", scope: { workflows } },
			},
			admin,
		),
	);
	const bearer = (enrolled as { credential?: { bearer: string } }).credential?.bearer;
	if (enrolled.status !== "accepted" || !bearer) throw new Error(JSON.stringify(enrolled));
	const context = f.principals.device(`Bearer ${bearer}`);
	if (!context) throw new Error("device context");
	return { id: String(enrolled.result.device), bearer, context };
}

/** A workflow whose coordinator was assigned by the host and has finished its first packet run. */
export async function chatFixture(options: { packet?: Partial<RolePacket> } = {}) {
	const chat = chatProvider();
	const f = await roleFixture(new Engine({ provider: chat.provider, ...claudeFixture }));
	let n = 0;
	const human = (command: Record<string, unknown>, id = `human:${++n}`, context: AuthenticatedContext = admin) =>
		Effect.runPromise(
			f.ledger.command(
				{ version: 1, authorityEpoch: f.ledger.status().authorityEpoch, commandId: id, workflow: WORKFLOW, command },
				context,
			),
		);
	const assignments = () => (f.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments;
	const assigned = await f.command({ type: "assignTask", slice: WORKFLOW, delivery: false, packet: coordinatorPacket(options.packet) });
	if (assigned.status !== "accepted") throw new Error(JSON.stringify(assigned));
	const coordinator = String(assigned.result.assignment);
	const current = () => assignments().find((a) => a.id === coordinator)!;
	return {
		...f,
		chat,
		coordinator,
		current,
		assignments,
		human,
		post: (text: string, whenBusy: "steer" | "followUp" = "followUp", id?: string, context?: AuthenticatedContext) =>
			human({ type: "postCoordinatorMessage", text, whenBusy }, id, context),
		withdraw: (message: string, id?: string) => human({ type: "withdrawCoordinatorMessage", message }, id),
		interrupt: (id?: string) => human({ type: "interruptCoordinator" }, id),
		view: () =>
			(f.ledger.snapshot(admin) as unknown as { workflows: { workflow: string; messages: Record<string, unknown> }[] }).workflows.find(
				(w) => w.workflow === WORKFLOW,
			)!.messages,
		transcript: async () => {
			const page = await Effect.runPromise(f.ledger.messages(admin, WORKFLOW, undefined, 500));
			if ("status" in page) throw new Error(JSON.stringify(page));
			return page.messages;
		},
	};
}
