// Judge-only checks. Node standard library only. All files stay in this directory.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, renameSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const home = dirname(fileURLToPath(import.meta.url));
const dir = join(home, 'mtime-fixture');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'device.json');
writeFileSync(file, JSON.stringify({ device: 'phone', hash: 'present' }));
const before = statSync(dir, { bigint: true }).mtimeNs;
await delay(20);
writeFileSync(file, JSON.stringify({ device: 'phone' }));
const afterRewrite = statSync(dir, { bigint: true }).mtimeNs;
assert.equal(afterRewrite, before);
await delay(20);
writeFileSync(`${file}.tmp`, JSON.stringify({ device: 'phone' }));
renameSync(`${file}.tmp`, file);
const afterRename = statSync(dir, { bigint: true }).mtimeNs;
assert.notEqual(afterRename, before);
console.log('PASS directory mtime: in-place rewrite unchanged; temp-file rename changed it');

// A proxy's status is not proof that the app refused the request.
let writes = 0;
const app = createServer(async (req, res) => {
  for await (const _ of req) { /* consume request */ }
  writes++;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ result: {} }));
});
app.listen(0, '127.0.0.1');
await once(app, 'listening');
const proxy = createServer(async (req, res) => {
  for await (const _ of req) { /* consume request */ }
  const upstream = await fetch(`http://127.0.0.1:${app.address().port}/`, { method: 'POST', body: '{}' });
  await upstream.text();
  res.writeHead(408, { 'content-type': 'text/html' });
  res.end('<html>Gateway timeout</html>');
});
proxy.listen(0, '127.0.0.1');
await once(proxy, 'listening');
const reply = await fetch(`http://127.0.0.1:${proxy.address().port}/`, { method: 'POST', body: '{}' });
assert.equal(reply.status, 408);
assert.equal(writes, 1);
console.log(`PASS proxy counterexample: status=${reply.status}, effects=${writes}, body=${await reply.text()}`);
for (const server of [proxy, app]) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}

// Same text sequence, serialized with each candidate's envelope. Not a durable load test.
const chunk = 'a'.repeat(100);
let text = '';
let fullBytes = 0;
let c1Bytes = 0;
let c3Bytes = 0;
const wire = x => Buffer.byteLength(`data: ${JSON.stringify(x)}\n\n`);
const value = () => ({ conversation: { id: 1 }, entries: [], docs: { 'pi.live': {
  generation: { message: { content: [{ type: 'text', text }] } }
} } });
fullBytes += wire({ kind: 'snapshot', seq: 0, value: value() });
c1Bytes += wire({ kind: 'value', value: value() });
c3Bytes += wire({ ops: [['r', value()]] });
for (let seq = 1; seq <= 1000; seq++) {
  text += chunk;
  fullBytes += wire({ kind: 'value', seq, value: value() });
  const ops = [['a', ['docs', 'pi.live', 'generation', 'message', 'content', 0, 'text'], chunk]];
  c1Bytes += wire({ kind: 'ops', ops });
  c3Bytes += wire({ ops });
}
assert.equal(text.length, 100000);
console.log(`PASS byte fixture, 1000 updates of 100 ASCII bytes, no old entries: candidate-2=${fullBytes}; candidate-1=${c1Bytes}; candidate-3=${c3Bytes}`);

// Check document limits and section order independently, without changing candidates.
const expected = ['Transport', 'Message shapes', 'Streaming', 'Auth', 'Versioning', 'The script, step by step', 'What changes in `docs/core`', 'Not verified'];
for (const n of [1, 2, 3]) {
  const design = readFileSync(`/tmp/arena-wire/candidate-${n}/design.md`, 'utf8');
  const sections = [...design.matchAll(/^## (\d+)\. (.+)$/gm)].map(m => m[2]);
  assert.deepEqual(sections, expected);
  assert.equal(/[\u2013\u2014]/u.test(design), false);
  console.log(`PASS candidate-${n}: eight required sections in order, no long dashes`);
}
console.log('PASS judge standard-library checks');
