import {readFile,mkdir,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import * as codec from "../operator/codec.mjs";
import {buildCostingDesk} from "../operator/build.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const manifest=JSON.parse(await readFile(path.join(root,"source-manifest.json"),"utf8"));
const files={"source-manifest.json":JSON.stringify(manifest,null,2)+"\n"};
for(const e of manifest.files){const p=typeof e==="string"?e:e.path;if(!p||p.startsWith("/")||p.includes("\\")||p.split("/").some(x=>x==="."||x===".."||!x))throw Error("Unsafe source path");const b=await readFile(path.join(root,p));if(e.sha256&&codec.sha256Bytes(b)!==e.sha256)throw Error("Source identity changed: "+p);files[p]=codec.utf8Decode(b);}
const out=path.resolve(process.argv[2]||path.join(root,"output","Costing_Desk.html")),built=buildCostingDesk(files,codec);
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,built.html,{flag:"wx"});
console.log(JSON.stringify({path:out,bytes:codec.utf8Encode(built.html).length,sha256:codec.sha256Bytes(codec.utf8Encode(built.html)),sourceBytes:built.sourceBytes,sourceSha256:built.sourceSha256,defaultWorkspace:"blank",externalRuntimeDependencies:0}));
