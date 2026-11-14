import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const checkout=process.argv[2];
const {default:ts}=await import(pathToFileURL(path.join(checkout,'node_modules/typescript/lib/typescript.js')).href);
const found=new Map();
const add=(spec,name,type)=>{if(!spec.startsWith('@earendil-works/'))return;const row=found.get(spec)??{values:new Set(),types:new Set()};row[type?'types':'values'].add(name);found.set(spec,row)};
async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory()){await visit(f);continue}if(!f.endsWith('.ts'))continue;const source=ts.createSourceFile(f,await readFile(f,'utf8'),ts.ScriptTarget.Latest,true);for(const s of source.statements){if(ts.isImportDeclaration(s)&&ts.isStringLiteral(s.moduleSpecifier)&&s.importClause){const b=s.importClause.namedBindings;if(b&&ts.isNamedImports(b))for(const el of b.elements)add(s.moduleSpecifier.text,(el.propertyName??el.name).text,s.importClause.isTypeOnly||el.isTypeOnly)}}}}
for(const pkg of ['w1','w2','websearch','kit'])for(const area of ['src','test'])await visit(path.join(checkout,'packages',pkg,area));
for(const [origin,row]of [...found].sort())console.log(JSON.stringify({origin,values:[...row.values].sort(),types:[...row.types].filter(n=>!row.values.has(n)).sort()}));
