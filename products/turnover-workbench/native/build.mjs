#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),".."),read=p=>fs.readFile(path.join(root,p),"utf8");
const safe=x=>JSON.stringify(x).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
try{
 const out=process.argv[2];if(!out)throw Error("Usage: node native/build.mjs NEW_APP_DIRECTORY");
 const f={};for(const p of ["workbench/template.html","workbench/style.css","src/turnover-core.js","workbench/browser-store.js","workbench/operator.js","examples/workbench-complete-workspace.json","examples/workbench-empty-workspace.json","examples/workbench-intake-example.json"])f[p]=await read(p);
 const runtime=f["src/turnover-core.js"]+"\n"+f["workbench/browser-store.js"]+"\n"+f["workbench/operator.js"]+'\nmountTurnoverWorkbench(document.getElementById("desk"),JSON.parse(document.getElementById("initial-data").textContent),createTurnoverCore(),createTurnoverCopyStore(globalThis.indexedDB),JSON.parse(document.getElementById("example-data").textContent));';
 const make=p=>f["workbench/template.html"].replace("__STYLE__",()=>f["workbench/style.css"]).replace("__INITIAL__",()=>safe(JSON.parse(f[p]))).replace("__EXAMPLE__",()=>safe(JSON.parse(f["examples/workbench-intake-example.json"]))).replace("__RUNTIME__",()=>runtime);
 await fs.mkdir(out,{recursive:false});for(const [name,p]of Object.entries({"Turnover_Workbench.html":"examples/workbench-empty-workspace.json","Turnover_Worked_Example.html":"examples/workbench-complete-workspace.json"}))await fs.writeFile(path.join(out,name),make(p),{encoding:"utf8",flag:"wx"});
 console.log(out);
}catch(e){console.error(e.stack||String(e));process.exitCode=1}
