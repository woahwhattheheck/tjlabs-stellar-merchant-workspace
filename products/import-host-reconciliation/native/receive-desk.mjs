import {readFile} from "node:fs/promises";import path from "node:path";import {fileURLToPath} from "node:url";import vm from "node:vm";import * as codec from "../operator/codec.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),get=async p=>readFile(path.join(root,p),"utf8"),context=vm.createContext({});
for(const p of ["src/source-parsers.js","src/import-host-core.js","operator/session.js","operator/receive-course.js"])vm.runInContext(await get(p),context,{filename:p});
const parsers=context.createSourceParsers(),core=context.createImportHostCore({codec,parsers}),r=context.runDeskCourse({core,codec,parsers,createSession:context.createDeskSessionAPI,authoredWorking:await get("examples/complete-authored-workspace.json")});
console.log(JSON.stringify({...r,working:undefined,report:undefined,csv:undefined,runtime:"Node.js "+process.version+" / unchanged production source APIs / authored observations"},null,2));
