// Owned-process driver for C3: Ledger accepts a human message, then the host dies at a delivery barrier.
// `crash` builds the workflow, settles the coordinator idle and posts; `recover` reopens and reports deliveries.
import { setTimeout } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId, Harness } from "@earendil-works/pi-durable";
import * as Effect from "effect/Effect";
import { Engine } from "../../src/engine/runtime.ts";
import type { RoleAssignment } from "../../src/kernel/roles.ts";
import { openLedger } from "../../src/ledger/startup.ts";
import { chatProvider, coordinatorPacket, until, WORKFLOW } from "./chat.ts";
import { addProject, admin, claudeFixture, PROJECT, scheduler } from "./roles.ts";

const [data, mode, commandId] = process.argv.slice(2) as [string, "crash" | "recover", string];
const TEXT = "Deliver me exactly once.";
const chat = chatProvider();
let harness!: Harness;
const opened = await Effect.runPromise(
	openLedger({
		data,
		onFatal: (error) => console.error(error),
		runtime: (report) => {
			const options = new Engine({ provider: chat.provider, ...claudeFixture }).options(report);
			return {
				...options,
				bindLedger: (ledger, h) => {
					harness = h;
					options.bindLedger?.(ledger, h);
				},
			};
		},
	}),
);
const send = (command: Record<string, unknown>, id: string, context = admin, workflow: string | null = WORKFLOW) =>
	Effect.runPromise(
		opened.ledger.command(
			{ version: 1, authorityEpoch: opened.authorityEpoch, commandId: id, ...(workflow === null ? {} : { workflow }), command },
			context,
		),
	);
const coordinator = () => ((opened.ledger.snapshot(admin) as unknown as { assignments: RoleAssignment[] }).assignments ?? [])[0];
const idle = () => until(() => (coordinator()?.status === "idle" && !coordinator()?.executing) || undefined, "idle coordinator", 15_000);
try {
	if (mode === "crash") {
		await send(addProject(), "project", admin, null);
		await send({ type: "createWorkflow", title: "chat crash", project: PROJECT }, "create", admin, null);
		await Effect.runPromise(
			opened.ledger.command(
				{
					version: 1,
					authorityEpoch: opened.authorityEpoch,
					commandId: "input",
					workflow: WORKFLOW,
					expected: { document: null },
					command: {
						type: "saveDocument",
						document: "principles",
						mediaType: "text/plain",
						content: Buffer.from("Keep.\n").toString("base64"),
					},
				},
				admin,
			),
		);
		await send({ type: "assignTask", slice: WORKFLOW, delivery: false, packet: coordinatorPacket() }, "coordinator", scheduler);
		await idle();
		process.env.RENDER_FAULT_BARRIER = process.env.RENDER_CHAT_BARRIER;
		process.env.RENDER_FAULT_COMMAND = commandId;
		await send({ type: "postCoordinatorMessage", text: TEXT, whenBusy: "followUp" }, commandId);
		await setTimeout(15_000);
		throw new Error("barrier did not stop worker");
	}
	const a = await until(() => coordinator(), "the coordinator");
	await until(
		async () => {
			const c = await harness.conversation(a.conversation as ConversationId, BACKGROUND_CONTEXT);
			const page = await c!.entries({ order: "ascending" }, 500, undefined, BACKGROUND_CONTEXT);
			return page.items.some((e) => e.kind === "render.human") && coordinator()?.status === "idle" ? true : undefined;
		},
		"the recovered delivery",
		15_000,
	);
	const c = await harness.conversation(a.conversation as ConversationId, BACKGROUND_CONTEXT);
	const entries = (await c!.entries({ order: "ascending" }, 500, undefined, BACKGROUND_CONTEXT)).items;
	console.log(
		JSON.stringify({
			placed: entries.filter((e) => e.kind === "render.human" && (e.data as { commandId?: string }).commandId === commandId).length,
			submissions: (await harness.inspect(BACKGROUND_CONTEXT)).submissions.length,
		}),
	);
} finally {
	await Effect.runPromise(opened.close());
}
