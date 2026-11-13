import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
function contender(file) {
  const child = fork(path.join(root,"lock-holder.mjs"),[file], { stdio:["ignore","pipe","pipe","ipc"] });
  return { child, first: once(child,"message").then(([message])=>message) };
}
test("SQLite lock excludes a second process and releases on SIGKILL", async () => {
  await mkdir(path.join(root,"lock-state"),{recursive:true});
  const file=path.join(root,"lock-state","store.lock");
  const a=contender(file);
  try {
    assert.deepEqual(await a.first,{locked:true});
    const b=contender(file);
    const refused=await b.first;
    assert.equal(refused.locked,false);
    assert.match(refused.message,/locked/);
    console.log("second process:", refused.message);
    const death=once(a.child,"exit"); a.child.kill("SIGKILL"); await death;
    const c=contender(file);
    try { assert.deepEqual(await c.first,{locked:true}); console.log("after SIGKILL: acquired"); }
    finally { const exit=once(c.child,"exit");c.child.kill("SIGKILL");await exit; }
  } finally { if(a.child.exitCode===null && a.child.signalCode===null) a.child.kill("SIGKILL"); }
});
