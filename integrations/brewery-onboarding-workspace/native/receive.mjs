#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {createBreweryCore} from "../src/brewery-core.mjs";
import {runBreweryReceiving} from "../receiving/authored-course.mjs";
const directory=process.argv[2];if(!directory)throw Error("Usage: node native/receive.mjs NEW_OUTPUT_DIRECTORY");
const core=createBreweryCore(),result=runBreweryReceiving(core);result.runtime="Node.js "+process.version+" actual maintained core and authored receiving course";
await fs.mkdir(directory,{recursive:false});
const write=(name,body)=>fs.writeFile(path.join(directory,name),body,{encoding:"utf8",flag:"wx"});
await write("receiving-result.json",JSON.stringify(result,null,2)+"\n");await write("workspace.json",JSON.stringify(result.workspace,null,2)+"\n");
await write("initial-reconciliation.html",core.report(result.workspace,"opening-to-cutoff-1"));await write("corrected-reconciliation.html",core.report(result.workspace,"opening-to-cutoff-2"));
for(const kind of ["buckets","movements","exceptions","reviews","duplicates","recipes","accounts","orders"])await write(kind+".csv",core.csv(result.workspace,"opening-to-cutoff-1",kind));
console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.every(c=>c.passed),revision:result.workspace.revision,directory}));
