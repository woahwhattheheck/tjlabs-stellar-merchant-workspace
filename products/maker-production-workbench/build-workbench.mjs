#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createMakerProductionCore} from "./maker-production-core.mjs";
const root=path.dirname(fileURLToPath(import.meta.url)),read=p=>fs.readFile(path.join(root,p),"utf8"),safe=x=>JSON.stringify(x).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
try{
 const out=process.argv[2];if(!out)throw Error("Usage: node build-workbench.mjs NEW_DIRECTORY");
 const [template,style,core,storage,operator,empty,worked]=await Promise.all(["workbench/template.html","workbench/style.css","maker-production-core.js","workbench/browser-store.js","workbench/operator.js","examples/workbench-empty-workspace.json","examples/workbench-complete-workspace.json"].map(read));
 const runtime=core+"\n"+storage+"\n"+operator+'\nmountMakerProductionWorkbench(document.getElementById("desk"),JSON.parse(document.getElementById("initial-data").textContent),createMakerProductionCore(),createMakerProductionCopyStore(globalThis.indexedDB));';
 const make=w=>template.replace("__STYLE__",()=>style).replace("__ACTIONS__",()=>createMakerProductionCore().actions.map(a=>"<option>"+a+"</option>").join("")).replace("__INITIAL__",()=>safe(JSON.parse(w))).replace("__RUNTIME__",()=>runtime);
 const files={"Maker_Production_Workbench.html":make(empty),"Maker_Production_Worked_Example.html":make(worked)};await fs.mkdir(out,{recursive:false});for(const [name,text]of Object.entries(files))await fs.writeFile(path.join(out,name),text,{encoding:"utf8",flag:"wx"});console.log(out);
}catch(e){console.error(e.stack||String(e));process.exitCode=1}
