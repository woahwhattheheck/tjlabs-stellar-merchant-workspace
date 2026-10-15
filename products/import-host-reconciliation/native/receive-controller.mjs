import {readFile} from "node:fs/promises";import path from "node:path";import {fileURLToPath} from "node:url";import vm from "node:vm";import * as codec from "../operator/codec.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),raw=await readFile(path.join(root,"source-manifest.json"),"utf8"),manifest=JSON.parse(raw),files={"source-manifest.json":raw};
for(const f of manifest.files){if(!f.path||f.path.startsWith("/")||f.path.includes("\\")||f.path.split("/").some(x=>!x||x==="."||x===".."))throw Error("Unsafe source path");const b=await readFile(path.join(root,f.path));if(b.length!==f.bytes||codec.sha256Bytes(b)!==f.sha256)throw Error("Source differs: "+f.path);files[f.path]=codec.utf8Decode(b);}
const context=vm.createContext({});for(const p of ["operator/build.js","commissioning/run-operator-controller.js"])vm.runInContext(files[p],context,{filename:p});
const result=await context.runOperatorControllerCourse({files,codec,build:context.buildImportHostDesk});
console.log(JSON.stringify({...result,working:undefined,runtime:"Node.js "+process.version+"; production controller with explicit in-memory DOM/storage/download adapters"},null,2));
