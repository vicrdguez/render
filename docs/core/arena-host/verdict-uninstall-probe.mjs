import assert from 'node:assert/strict';
const base = process.env.PI_MODULES;
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { Harness, createRegistry, defineTask, defineExtension } = await import(`${base}/pi-durable/dist/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
let entered;
const started = new Promise(resolve => { entered = resolve; });
let release;
const gate = new Promise(resolve => { release = resolve; });
const steps = [];
const reports = [];
const task = defineTask({
  name: 'judge.running', version: 1,
  initial: () => ({ phase: 'first' }),
  phases: {
    first: async (_task, runtime, context) => {
      entered();
      await gate;
      steps.push('first-after-uninstall');
      await runtime.commit(() => ({status:'running', checkpoint:{phase:'second'}}), context);
    },
    second: async (_task, runtime, context) => {
      steps.push('second-after-uninstall');
      await runtime.commit(() => ({status:'terminal', outcome:{status:'completed'}}), context);
    }
  },
  abort: async (_task, runtime, context) => runtime.commit(() => ({status:'terminal', outcome:{status:'aborted'}}), context)
});
const extension = defineExtension({name:'judge', tasks:[task]});
const registry = createRegistry();
registry.install(extension);
const h = await Harness.open(await openNodeSqliteStorage('/tmp/arena-host/judge/uninstall.sqlite'), {registry, models: createModels(), onReport: report => reports.push(report)}, ctx);
const conversation = await h.createConversation({ownership:{kind:'ownerless'}}, ctx);
const id = await conversation.commit(tx => tx.createTask(task, {}, {ownership:{kind:'conversation'}, background:true}), ctx);
h.resume();
await started;
registry.uninstall(extension);
release();
const result = await h.waitForTask(id, ctx);
assert.equal(result.state.outcome.status, 'completed');
assert.deepEqual(steps, ['first-after-uninstall','second-after-uninstall']);
console.log(`J1: uninstall did not park running task; outcome=${result.state.outcome.status}; steps=${JSON.stringify(steps)}; task_outdated=${reports.some(r => r.kind === 'task_outdated')}`);
await h.close(ctx);
