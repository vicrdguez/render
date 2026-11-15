import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { Tx } from "@earendil-works/pi-durable";
import { calls } from "../../src/host/calls.js";
import { Projects } from "../../src/host/projects.js";
import { gate, modules } from "./extensions.js";
import { type Running, start, until } from "./helpers.js";

const flowOptions = modules.flow.options;
assert.ok(flowOptions);

function latch() {
	let release = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

const bind = (s: Running, project: string) =>
	s.call("bind", {
		project,
		workdir: `/${project}`,
		extensions: ["flow"],
	});
const patch = (s: Running, project = "p") =>
	s.call("setOptions", {
		project,
		extension: "flow",
		patch: { designer: "faux/a" },
	});

for (const second of [
	"setOptions",
	"create",
	"options",
	"bind",
	"addExtensions",
] as const) {
	test(`a held setOptions orders ${second} server-wide`, {
		timeout: 5000,
	}, async (t) => {
		const entered = latch();
		const held = latch();
		let holding = false;
		let probing = false;
		let started = false;
		const pending: Promise<unknown>[] = [];
		for (const method of ["bind", "addExtensions"] as const) {
			const original = Projects.prototype[method];
			t.mock.method(
				Projects.prototype,
				method,
				function (this: Projects, ...args: unknown[]) {
					if (probing) started = true;
					return Reflect.apply(original, this, args);
				},
			);
		}
		const flow = {
			...modules.flow,
			options: {
				...flowOptions,
				get: async (tx: Tx) => {
					if (holding) {
						holding = false;
						entered.release();
						await held.promise;
					} else if (probing) started = true;
					return flowOptions.get(tx);
				},
			},
		};
		const s = await start({
			source: () => ({ modules: { ...modules, flow }, failures: [] }),
		});
		try {
			await bind(s, "p");
			await bind(s, "q");
			await patch(s, "q");
			holding = true;
			const first = patch(s);
			pending.push(first);
			await entered.promise;
			probing = true;
			const accepted = latch();
			const call = calls[second];
			assert.ok(call);
			const dispatch = call.dispatch;
			t.mock.method(
				call,
				"dispatch",
				(...args: Parameters<typeof dispatch>) => {
					const result = dispatch(...args);
					accepted.release();
					return result;
				},
			);
			let finished = false;
			const body =
				second === "setOptions"
					? { project: "q", extension: "flow", patch: {} }
					: second === "create"
						? { project: "q", workflow: "flow" }
						: second === "bind"
							? { project: "r", workdir: "/r", extensions: [] }
							: second === "addExtensions"
								? { project: "q", extensions: ["notes"] }
								: { project: "q" };
			const next = s.call(second, body).then((r) => {
				finished = true;
				return r;
			});
			pending.push(next);
			await accepted.promise;
			await s.call("models", {});
			await setImmediate();
			assert.equal(started, false, "the second structural call must not start");
			assert.equal(finished, false);
			holding = false;
			held.release();
			assert.equal((await first).status, 200);
			assert.equal((await next).status, 200);
		} finally {
			holding = false;
			held.release();
			await Promise.allSettled(pending);
			await s.close();
		}
	});
}

test("bind precedes addExtensions before either project queue is taken", {
	timeout: 5000,
}, async (t) => {
	const held = latch();
	const entered = latch();
	const s = await start({ source: () => ({ modules, failures: [] }) });
	await bind(s, "p");
	const original = Projects.prototype.bind;
	t.mock.method(
		Projects.prototype,
		"bind",
		async function (this: Projects, ...args: Parameters<typeof original>) {
			entered.release();
			await held.promise;
			return original.apply(this, args);
		},
	);
	let addEntered = false;
	const add = Projects.prototype.addExtensions;
	t.mock.method(
		Projects.prototype,
		"addExtensions",
		function (this: Projects, ...args: Parameters<typeof add>) {
			addEntered = true;
			return add.apply(this, args);
		},
	);
	try {
		const first = bind(s, "p");
		await entered.promise;
		const next = s.call("addExtensions", {
			project: "p",
			extensions: ["notes"],
		});
		await s.call("models", {});
		assert.equal(
			addEntered,
			false,
			"waiting calls must not enter the project queue first",
		);
		held.release();
		assert.equal((await first).status, 200);
		assert.equal(
			(await next).status,
			200,
			"taking the project queue before the structural queue would deadlock the repeated bind",
		);
		assert.equal(addEntered, true);
	} finally {
		held.release();
		await s.close();
	}
});

test("addExtensions completes before create reads the project selection", {
	timeout: 5000,
}, async (t) => {
	const s = await start({ source: () => ({ modules, failures: [] }) });
	const held = latch();
	const entered = latch();
	try {
		await s.call("bind", { project: "p", workdir: "/p", extensions: [] });
		const original = Projects.prototype.addExtensions;
		t.mock.method(
			Projects.prototype,
			"addExtensions",
			async function (this: Projects, ...args: Parameters<typeof original>) {
				entered.release();
				await held.promise;
				return original.apply(this, args);
			},
		);
		const first = s.call("addExtensions", {
			project: "p",
			extensions: ["flow"],
		});
		await entered.promise;
		let finished = false;
		const next = s
			.call("create", { project: "p", workflow: "flow" })
			.then((r) => {
				finished = true;
				return r;
			});
		await s.call("models", {});
		assert.equal(finished, false);
		held.release();
		assert.equal((await first).status, 200);
		assert.equal((await next).body.refused?.code, "options_invalid");
	} finally {
		held.release();
		await s.close();
	}
});

test("a thrown structural call and a refused call leave the queue usable", {
	timeout: 5000,
}, async () => {
	let fail = true;
	const s = await start({
		source: () => ({
			modules: {
				flow: {
					...modules.flow,
					options: {
						...flowOptions,
						get: async (tx: Tx) => {
							if (fail) throw new Error("controlled get failure");
							return flowOptions.get(tx);
						},
					},
				},
			},
			failures: [],
		}),
	});
	try {
		await bind(s, "p");
		assert.equal((await patch(s)).body.unknown?.code, "storage_failed");
		fail = false;
		assert.equal(
			(await s.call("create", { project: "p", workflow: "gone" })).body.refused
				?.code,
			"not_a_workflow",
		);
		assert.equal((await patch(s)).status, 200);
	} finally {
		await s.close();
	}
});

test("close finishes the running structural call and refuses waiting and new calls", {
	timeout: 5000,
}, async (t) => {
	const entered = latch();
	const held = latch();
	const accepted = latch();
	const s = await start({
		source: () => ({
			modules: {
				flow: {
					...modules.flow,
					options: {
						...flowOptions,
						get: async (tx: Tx) => {
							entered.release();
							await held.promise;
							return flowOptions.get(tx);
						},
					},
				},
			},
			failures: [],
		}),
	});
	try {
		await bind(s, "p");
		const first = patch(s);
		await entered.promise;
		const call = calls.create;
		assert.ok(call);
		const dispatch = call.dispatch;
		t.mock.method(call, "dispatch", (...args: Parameters<typeof dispatch>) => {
			const result = dispatch(...args);
			accepted.release();
			return result;
		});
		const next = s.call("create", { project: "p", model: "faux/a" });
		await accepted.promise;
		let closed = false;
		const close = s.close().then(() => {
			closed = true;
		});
		await setImmediate();
		assert.equal(closed, false);
		assert.equal(
			(await s.call("options", { project: "p" })).body.refused?.code,
			"busy",
		);
		held.release();
		assert.equal((await first).status, 200);
		assert.equal((await next).body.refused?.code, "busy");
		await close;
		assert.equal(closed, true);
	} finally {
		held.release();
		await s.close();
	}
});

for (const heldProject of ["p", "q"]) {
	test(`held structural work in ${heldProject} does not block input, answer, streams or tools in p`, {
		timeout: 5000,
	}, async (t) => {
		const entered = latch();
		const held = latch();
		const original = Projects.prototype.addExtensions;
		const s = await start({ source: () => ({ modules, failures: [] }) });
		try {
			await bind(s, "p");
			await bind(s, "q");
			await patch(s);
			const conversation = (
				await s.call("create", { project: "p", workflow: "flow" })
			).body.result.conversation;
			const inbox = s.watch("inbox", {});
			const open = s.watch("open", { project: "p", conversation });
			await open.until((w) => w.value !== undefined);
			s.faux.setResponses([
				fauxAssistantMessage([fauxToolCall("ask", { key: "queue" })], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage("asked"),
			]);
			await s.call("input", {
				project: "p",
				conversation,
				text: "ask",
				requestId: "ask",
			});
			await inbox.until((w) => w.value?.p?.["flow:queue"] !== undefined);
			await until("idle", async () =>
				(
					await s.call("conversations", { project: "p" })
				).body.result.items.every((c: { state: string }) => c.state === "idle"),
			);
			const decision = (
				await s.call("decision", { project: "p", decision: "flow:queue#1" })
			).body.result.decision;
			gate.arm();
			s.faux.setResponses([
				fauxAssistantMessage([fauxToolCall("hold", {})], {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage("finished"),
				fauxAssistantMessage("later finished"),
			]);
			await s.call("input", {
				project: "p",
				conversation,
				text: "hold",
				requestId: "hold",
			});
			await gate.entered;
			t.mock.method(
				Projects.prototype,
				"addExtensions",
				async function (this: Projects, ...args: Parameters<typeof original>) {
					entered.release();
					await held.promise;
					return original.apply(this, args);
				},
			);
			const structural = s.call("addExtensions", {
				project: heldProject,
				extensions: ["notes"],
			});
			await entered.promise;
			const frames = open.frames;
			assert.equal(
				(
					await s.call("input", {
						project: "p",
						conversation,
						text: "later",
						requestId: "later",
						whenBusy: "followUp",
					})
				).status,
				200,
			);
			assert.equal(
				(
					await s.call("answer", {
						project: "p",
						decision: decision.id,
						basis: decision.basis,
						choice: "approve",
						annotations: [],
					})
				).status,
				200,
			);
			gate.release();
			await until("tool finished while structural work waits", async () =>
				(
					await s.call("conversations", { project: "p" })
				).body.result.items.every((c: { state: string }) => c.state === "idle"),
			);
			await open.until((w) => w.frames > frames);
			assert.equal(open.closed, false);
			held.release();
			assert.equal((await structural).status, 200);
			open.close();
			inbox.close();
		} finally {
			held.release();
			gate.release();
			await s.close();
		}
	});
}
