// Judge-only check against the approved 1.5.2 installation, never downloaded source.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const base = process.env.PI_MODULES;
assert.ok(base);
const { BACKGROUND_CONTEXT: ctx } = await import(`${base}/chord/dist/context/index.js`);
const { Harness, createRegistry } = await import(`${base}/pi-durable/dist/index.js`);
const { createModels } = await import(`${base}/pi-ai/dist/models.js`);
const { openNodeSqliteStorage } = await import(`${base}/pi-durable/dist/storage/sqlite/node.js`);
const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), 'durable-facts-'));
const h = await Harness.open(await openNodeSqliteStorage(join(dir, 'store.sqlite')), { registry: createRegistry(), models: createModels() }, ctx);
try {
  const c = await h.createConversation({ ownership: { kind: 'ownerless' } }, ctx);
  const laptop = await c.submit({ type: 'input', requestId: 'client:r1', content: 'Laptop input' }, ctx);
  const phone = await c.submit({ type: 'input', requestId: 'client:r1', content: 'Different phone input' }, ctx);
  assert.equal(phone.id, laptop.id);
  const page = await c.entries({}, 100, undefined, ctx);
  const users = page.items.filter(e => e.kind === 'pi.user');
  assert.equal(users.length, 1);
  assert.equal(users[0].model[0].content, 'Laptop input');
  console.log('PASS cross-device requestId counterexample: same client:r1 returns the first submission and drops the distinct phone input');
  const log = await h.createConversation({ ownership: { kind: 'ownerless' } }, ctx);
  const watch = await log.watch(ctx);
  for (let n = 1; n <= 11000; n++) {
    await log.commit(tx => tx.appendEntry(log.id, { kind: 'judge.event', data: { n } }), ctx);
  }
  const next = Promise.withResolvers();
  watch.start(async call => next.resolve(call));
  const call = await next.promise;
  assert.equal(call.kind, 'value');
  assert.equal(call.ops[0][0], 'r');
  assert.equal(call.value.entries.at(-1).data.n, 11000);
  assert.ok(call.value.entries.length <= 100);
  console.log(`PASS folded event window: 11000 durable events, root replacement contains ${call.value.entries.length} entries, first event=${call.value.entries[0].data.n}; before=${call.value.before}`);
  await watch.stop();
} finally {
  await h.close(ctx);
}
console.log('PASS judge durable checks');
