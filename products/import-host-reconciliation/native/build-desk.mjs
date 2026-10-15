import {readFile,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";import {fileURLToPath} from "node:url";import vm from "node:vm";import * as C from "../operator/codec.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),raw=await readFile(path.join(root,"source-manifest.json"),"utf8"),manifest=JSON.parse(raw),files={"source-manifest.json":raw};
for(const r of manifest.files){if(!r.path||r.path.startsWith("/")||r.path.includes("\\")||r.path.split("/").some(x=>!x||x==="."||x===".."))throw Error("Unsafe source path");const b=await readFile(path.join(root,r.path));if(b.length!==r.bytes||C.sha256Bytes(b)!==r.sha256)throw Error("Source identity changed: "+r.path);files[r.path]=C.utf8Decode(b);}
const build=vm.runInNewContext(files["operator/build.js"]+"\n;buildImportHostDesk;"),out=path.resolve(process.argv[2]||path.join(root,"output","Import_Host_Desk.html")),result=build(files,C);
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,result.html,{flag:"wx",mode:0o600});
console.log(JSON.stringify({path:out,bytes:C.utf8Encode(result.html).length,sha256:C.sha256Bytes(C.utf8Encode(result.html)),sourceBytes:result.sourceBytes,sourceSha256:result.sourceSha256,defaultWorkspace:"blank"}));
