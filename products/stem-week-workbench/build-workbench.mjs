#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createStemWeekCore} from "./stem-week-core.mjs";
const root=path.dirname(fileURLToPath(import.meta.url)),read=p=>fs.readFile(path.join(root,p),"utf8"),safe=x=>JSON.stringify(x).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
try{
 const out=process.argv[2];if(!out)throw Error("Usage: node build-workbench.mjs NEW_DIRECTORY");
 const [template,style,core,storage,operator,empty,worked]=await Promise.all(["workbench/template.html","workbench/style.css","stem-week-core.js","workbench/browser-store.js","workbench/operator.js","examples/empty-workspace.json","examples/workbench-complete-workspace.json"].map(read));
 const runtime=core+"\n"+storage+"\n"+operator+'\nmountStemWeekWorkbench(document.getElementById("desk"),JSON.parse(document.getElementById("initial-data").textContent),createStemWeekCore(),createStemWeekCopyStore(globalThis.indexedDB));';
 const make=w=>template.replace("__STYLE__",()=>style).replace("__ACTIONS__",()=>createStemWeekCore().actions.map(a=>"<option>"+a+"</option>").join("")).replace("__INITIAL__",()=>safe(JSON.parse(w))).replace("__RUNTIME__",()=>runtime);
 const files={"Stem_Week_Workbench.html":make(empty),"Stem_Week_Worked_Example.html":make(worked)};await fs.mkdir(out,{recursive:false});for(const [name,text]of Object.entries(files))await fs.writeFile(path.join(out,name),text,{encoding:"utf8",flag:"wx"});console.log(out);
}catch(e){console.error(e.stack||String(e));process.exitCode=1}
