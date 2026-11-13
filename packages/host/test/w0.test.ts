import assert from "node:assert/strict";
import { type ChildProcess, fork } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { requestAdmin } from "../src/index.js";
import { modules, WEEK } from "./extensions.js";
import { faux, newHome, send, start, until } from "./helpers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const children: ChildProcess[] = [];
after(() => {
	for (const child of children) child.kill("SIGKILL");
});

test("a server killed mid-run comes back: the decision is still open, the run continues, and an answer lands", async () => {
	const home = await newHome();
	const child = fork(path.join(here, "serve.js"), [home, "mid-run"], {
		stdio: "ignore",
	});
	children.push(child);
	const { port } = (await once(child, "message"))[0] as { port: number };
	const url = `http://127.0.0.1:${port}`;
	const pairing = async (device: string) => {
		const issued = await requestAdmin(home, { command: "pair", device });
		assert.ok("code" in issued);
		return (await send(url, "/v1/pair", JSON.stringify({ code: issued.code })))
			.body.result.token as string;
	};
	const laptop = await pairing("laptop");
	const phone = await pairing("phone");
	const call = (name: string, body: object, token = laptop) =>
		send(url, `/v1/${name}`, JSON.stringify(body), {
			Authorization: `Bearer ${token}`,
		});
	await call("bind", { project: "p", workdir: "/p", extensions: ["flow"] });
	await call("setOptions", {
		project: "p",
		extension: "flow",
		patch: { designer: "faux/a" },
	});
	const d = (await call("create", { project: "p", workflow: "flow" })).body
		.result.conversation;
	await call("input", {
		project: "p",
		conversation: d,
		text: "Design it.",
		requestId: "r1",
	});
	await until(
		"the decision opens",
		async () =>
			(await call("decision", { project: "p", decision: "flow:k#1" }))
				.status === 200,
	);
	await until("the second request is in flight", async () => {
		const page = await call("conversations", { project: "p" });
		return page.body.result.items.some(
			(c: { state: string }) => c.state === "running",
		);
	});
	const exit = once(child, "exit");
	child.kill("SIGKILL");
	await exit;

	const models = faux();
	models.faux.setResponses([
		fauxAssistantMessage("Continued after the restart."),
	]);
	const s = await start({ home, modules, models, token: phone });
	try {
		const inbox = s.watch("inbox", {});
		await inbox.until((w) => w.value !== undefined);
		assert.equal(inbox.value.p["flow:k"].id, "flow:k#1");
		const text = async () =>
			JSON.stringify(
				(await s.call("history", { project: "p", conversation: d })).body
					.result,
			);
		await until("the cut-off run continues", async () =>
			(await text()).includes("Continued after the restart."),
		);
		const shown = await s.call("decision", {
			project: "p",
			decision: "flow:k#1",
		});
		const answered = await s.call("answer", {
			project: "p",
			decision: "flow:k#1",
			basis: shown.body.result.decision.basis,
			choice: "approve",
			annotations: [],
		});
		assert.equal(answered.body.result.decision.by, "phone");
		await inbox.until(
			(w) => w.value.p["flow:k"] === undefined,
			"the answer clears the slot",
		);
		await until("the answer lands", async () =>
			(await text()).includes('"flow.answered"'),
		);
		models.faux.setResponses([fauxAssistantMessage("Still here.")]);
		await s.call("input", {
			project: "p",
			conversation: d,
			text: "Go on.",
			requestId: "r2",
		});
		await until("the phone continues", async () =>
			(await text()).includes("Still here."),
		);
		inbox.close();
	} finally {
		await s.close();
	}
});

test("a timer that came due while the server was down runs once the start installs its extension", async () => {
	let clock = Date.UTC(2026, 10, 14);
	const s = await start({ modules, now: () => clock });
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: ["flow"] });
		await s.call("setOptions", {
			project: "p",
			extension: "flow",
			patch: { designer: "faux/a" },
		});
		const d = (await s.call("create", { project: "p", workflow: "flow" })).body
			.result.conversation;
		s.faux.setResponses([
			fauxAssistantMessage([fauxToolCall("schedule", {})], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage("Scheduled."),
		]);
		await s.call("input", {
			project: "p",
			conversation: d,
			text: "Remind me.",
			requestId: "r",
		});
		const history = async (r = s) =>
			JSON.stringify(
				(await r.call("history", { project: "p", conversation: d })).body
					.result,
			);
		await until("scheduled", async () =>
			(await history()).includes("Scheduled."),
		);
		await s.close();
		clock += WEEK + 1;
		const again = await s.restart();
		try {
			await until("the timer runs", async () =>
				(await history(again)).includes('"flow.woke"'),
			);
		} finally {
			await again.close();
		}
	} finally {
		await s.close();
	}
});
