#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {createTurnoverCore} from "../src/turnover-core.mjs";
import {runTurnoverReceiving} from "../receiving/authored-course.mjs";
const directory=process.argv[2];
if(!directory)throw Error("Usage: node native/receive.mjs NEW_OUTPUT_DIRECTORY");
const core=createTurnoverCore(),result=runTurnoverReceiving(core);
result.runtime="Node.js "+process.version+"; production pure core and authored receiving course";
await fs.mkdir(directory,{recursive:false});
const write=(name,body)=>fs.writeFile(path.join(directory,name),body,{encoding:"utf8",flag:"wx"});
await write("result.json",JSON.stringify(result,null,2)+"\n");
await write("workspace.json",JSON.stringify(result.workspace,null,2)+"\n");
await write("report.html",core.report(result.workspace,"v07-v08"));
for(const kind of ["cues","events","added","reviews","receiving"])await write(kind+".csv",core.csv(result.workspace,"v07-v08",kind));
console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.every(x=>x.passed),revision:result.workspace.revision,directory}));
