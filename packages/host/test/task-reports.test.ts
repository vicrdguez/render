import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { type ConversationId, defineExtension, defineTask } from "@earendil-works/pi-durable";
import { Projects } from "../src/projects.js";
import { requestAdmin } from "../src/index.js";
import { start, until } from "./helpers.js";

for (const migrate of [false, true]) test(`reload reports sleeping and blocked tasks and repairs them with migrate ${migrate}`, async (t) => {
 let projects!: Projects;
 const original = Projects.prototype.start;
 t.mock.method(Projects.prototype, "start", function(this: Projects) { projects = this; return original.call(this); });
 let stderr = "";
 t.mock.method(process.stderr, "write", (chunk: string) => { stderr += String(chunk); return true; });
 const definition = (version: number, migrates = false) => defineTask<Record<string, never>, {phase: "sleep" | "wake"}, string>({
  name: "timer.due", version, initial: () => ({phase: "sleep"}),
  phases: {
   sleep: async (_task, runtime, c) => { await runtime.sleepUntil(runtime.now() + 1000, {phase: "wake"}, c); },
   wake: async (_task, runtime, c) => { await runtime.commit(() => ({status: "terminal", outcome: {status: "completed", result: "migrated"}}), c); },
  },
  abort: async () => {},
  ...(migrates ? {migrate: () => ({input: {}, checkpoint: {phase: "wake" as const}})} : {}),
 });
 const old = definition(1);
 let task = old;
 let s = await start({source: () => ({modules: {timer: {extension: defineExtension({name: "timer", tasks: [task]})}}, failures: []})});
 try {
  await s.call("bind", {project: "p", workdir: "/p", extensions: ["timer"]});
  const conversation = (await s.call("create", {project: "p", model: "faux/a"})).body.result.conversation as ConversationId;
  let p = projects.get("p")!;
  const id = await p.store.harness.commit(tx => tx.createTask(old, {}, {ownership: {kind: "conversation"}, conversationId: conversation, background: true}), context);
  await until("sleeping", async () => (await p.store.harness.inspect(context)).tasks.some(t => t.record.id === id && t.state.kind === "sleeping"));
  task = definition(2, migrate);
  const report = await requestAdmin(s.home, {command: "extension_reload"} as never) as unknown as {reload: {tasks: {project: string; task: number; kind: string; conversation: number; stored: number; installed: number; status: string; reason: string; until?: number}[]}};
  assert.ok(report.reload, JSON.stringify(report));
  if (migrate) assert.deepEqual(report.reload.tasks, []);
  else {
   assert.deepEqual(report.reload.tasks.map(({until, ...rest}) => rest), [{project: "p", task: id, kind: "timer.due", conversation, stored: 1, installed: 2, status: "migration-needed-on-reservation", reason: "migration_failed"}]);
   assert.equal(typeof report.reload.tasks[0]?.until, "number");
   s = await s.restart();
   p = projects.get("p")!;
   assert.match(stderr, /migration-needed-on-reservation p task=.*kind=timer.due.*version=1->2/);
   await until("blocked", async () => (await p.store.harness.inspect(context)).tasks.some(t => t.record.id === id && t.state.kind === "blocked"));
   const blocked = await requestAdmin(s.home, {command: "extension_reload"} as never) as unknown as typeof report;
   assert.equal(blocked.reload.tasks[0]?.status, "blocked");
   assert.equal(blocked.reload.tasks[0]?.reason, "migration_failed");
   assert.match(stderr, /migration_failed p task=/);
   task = definition(2, true);
   await requestAdmin(s.home, {command: "extension_reload"} as never);
  }
  await until("completed", async () => !(await p.store.harness.inspect(context)).tasks.some(t => t.record.id === id));
  const stored = await p.store.harness.commit(tx => tx.task(id), context);
  assert.equal(stored?.version, 2);
  assert.equal(stored?.state.status, "terminal");
 } finally { await s.close(); }
});
