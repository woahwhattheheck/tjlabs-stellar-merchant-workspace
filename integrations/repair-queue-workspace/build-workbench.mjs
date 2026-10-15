#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildRepairQueueApps} from "./workbench/build.mjs";
const root=path.dirname(fileURLToPath(import.meta.url)),out=process.argv[2];
try{if(!out)throw Error("Usage: node build-workbench.mjs NEW_DIRECTORY");const names=["archive-codec.js","repair-queue-core.js","workbench/browser-store.js","workbench/operator.js","workbench/style.css","workbench/template.html","examples/intake.json","examples/workbench-empty-workspace.json","examples/workbench-complete-workspace.json"],files=Object.fromEntries(await Promise.all(names.map(async n=>[n,await fs.readFile(path.join(root,n),"utf8")])));await fs.mkdir(out,{recursive:false});for(const [name,text]of Object.entries(buildRepairQueueApps(files)))await fs.writeFile(path.join(out,name),text,{encoding:"utf8",flag:"wx"});console.log(out);}catch(e){console.error(e.stack||String(e));process.exitCode=1}
