import { execFileSync,spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
function run(command,args,expected=0,cwd=root){
  const result=spawnSync(command,args,{cwd,encoding:"utf8"});
  const output=(result.stdout??"")+(result.stderr??"");
  console.log("$",command,...args,"\n"+output);
  if(result.status!==expected)throw new Error("unexpected exit "+result.status);
  return output;
}
console.log("Node",process.version,"npm",execFileSync("npm",["--version"],{encoding:"utf8"}).trim());
run("node",["setup-links.mjs"]);
const tsc=path.join(root,"node_modules/.bin/tsc");
run(tsc,["-b","fixture/consumer/tsconfig.json"]);
run("node",["--test","fixture/consumer/dist/test/import.test.js"]);
run("node",["fixture/consumer/dist/src/main.js"]);
run(tsc,["-b"],0,path.join(root,"../sketch"));
console.log("full sketch strict TypeScript: pass");
run("node",["tools/assets.mjs"],0,path.join(root,"../sketch"));
for(const [pkg,file] of [["w2","agent.md"],["w1","designer.md"],["w1","implementer.md"],["w1","reviewer.md"]]) {
  const source=await readFile(path.join(root,"../sketch/packages",pkg,"src",file),"utf8");
  const copied=await readFile(path.join(root,"../sketch/packages",pkg,"dist/src",file),"utf8");
  if(source!==copied)throw new Error("prose asset mismatch "+file);
}
console.log("module-relative Markdown copied beside emitted extension modules: pass");
run(path.join(root,"node_modules/.bin/biome"),["check",".","--diagnostic-level=error"],0,path.join(root,"../sketch"));
const args=["--noEmit","--strict","--skipLibCheck","--module","NodeNext","--target","ES2023"];
run(tsc,[...args,"public-types.ts"]);
console.log("five helpers + choice coverage: pass (narrow then task rejected)");
const noAnswer=run(tsc,[...args,"negative-import.ts"],2);
if(!noAnswer.includes("TS2305"))throw new Error("did not reject missing answer export");
const noInternal=run(tsc,[...args,"private-import.ts"],2);
if(!noInternal.includes("TS2307"))throw new Error("did not reject hidden internal subpath");
try{await import("tau-store/src/decisions.js");throw new Error("private import worked");}
catch(error){if(error.code!=="ERR_PACKAGE_PATH_NOT_EXPORTED")throw error;console.log("runtime hidden subpath:",error.code);}
run("node",["--test","boundaries.test.mjs","lock.test.mjs"]);
run("node",["tools/check-boundaries.mjs"],0,path.join(root,"../sketch"));
const {calls}=await import("../sketch/packages/host/dist/src/calls.js");
const names=Object.keys(calls);
if(names.length!==20)throw new Error("host calls are not 20");
console.log("single host registry:",names.length,names.join(", "));
const {compile}=await import("@earendil-works/pi-schema");
for(const[name,descriptor]of Object.entries(calls)){
  const validator=compile(descriptor.schema);
  if(validator.check({by:"forged"}))throw new Error("schema accepts unexpected field "+name);
}
console.log("20 closed pi-schema request schemas: unknown by rejected");
console.log("Architecture probes pass. No Tau behavior is implemented or accepted.");
