import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
import { check } from "../sketch/tools/check-boundaries.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"boundary-fixture");
async function json(file,value){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value));}
test("build rejects forbidden imports including relative and type-only paths",async()=>{
  const policy={"tau-store":{},"tau-host":{"tau-store":[".","./host"]},"tau-kit":{},"tau-w2":{"tau-store":["."],"tau-kit":["."]}};
  await json(path.join(root,"boundaries.json"),policy);
  await json(path.join(root,"tsconfig.base.json"),{compilerOptions:{}});
  for(const name of Object.keys(policy)){
    const dir=path.join(root,"packages",name);
    await mkdir(path.join(dir,"src"),{recursive:true});
    await json(path.join(dir,"package.json"),{name,exports:{".":{import:"./dist/index.js"},"./host":{import:"./dist/host.js"}},dependencies:Object.fromEntries(Object.keys(policy[name]).map(n=>[n,"0.0.0"]))});
    await json(path.join(dir,"tsconfig.json"),{compilerOptions:{}});
  }
  const cases=[
    ["tau-host","import 'tau-kit';","core cannot import kit"],
    ["tau-w2","import 'tau-store/host';","extension cannot reach answer capability"],
    ["tau-w2","import '.././../../tau-store/src/internal.js';","relative internals blocked"],
    ["tau-w2","export { thing } from 'tau-store/private';","re-export internals blocked"],
    ["tau-w2","type A = import('tau-store/host').Store;","type-only bypass blocked"],
    ["tau-w2","const m = await import('tau-store/host');","dynamic literal bypass blocked"],
    ["tau-w2","const m = await import(name);","dynamic computed bypass blocked"],
  ];
  for(const[owner,source,label] of cases){
    const file=path.join(root,"packages",owner,"src/attempt.ts");
    await writeFile(file,source);
    const errors=await check(root);
    assert.ok(errors.length,label);
    console.log(label+": rejected");
    await writeFile(file,"export {};");
  }
  assert.deepEqual(await check(root),[]);
  console.log("allowed extension tau-store root + tau-kit dependencies: accepted");
});
