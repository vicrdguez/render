import { mkdir, symlink, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
async function link(target,file){try{await lstat(file);}catch(e){if(e.code!=="ENOENT")throw e;await symlink(target,file);}}
await mkdir(path.join(root,"node_modules/@earendil-works"),{recursive:true});
for(const name of ["pi-durable","pi-schema","pi-ai","chord"]){
  await link("/tmp/render-spike/pi-1.5.2/node_modules/@earendil-works/"+name,path.join(root,"node_modules/@earendil-works",name));
}
for(const dir of ["store","host","kit","websearch","w2","w1","tau"]){
  await link(path.join(root,"../sketch/packages",dir),path.join(root,"node_modules",dir==="tau"?"tau":"tau-"+dir));
}
await link(path.join(root,"node_modules"),path.join(root,"../sketch/node_modules"));
console.log("linked published pi 1.5.2 read-only; workspace links confined to candidate-2");
