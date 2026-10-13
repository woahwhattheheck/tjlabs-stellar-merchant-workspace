#!/usr/bin/env node
"use strict";
const fs=require("node:fs");
const model=require("./planner.cjs");
const [command,file,...extra]=process.argv.slice(2);
function main(){
 if(extra.length||!["default","calculate"].includes(command)||(command==="default"&&file)||(command==="calculate"&&!file)){
  throw new Error("Usage: node planner_cli.cjs default | calculate saved-case.json");
 }
 if(command==="default"){process.stdout.write(JSON.stringify(model.createCase(),null,2)+"\n");return;}
 const saved=JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""));
 model.validate(saved);
 process.stdout.write(JSON.stringify({schema:"mpc-backup-calculation/v1",case:saved,result:model.calculate(saved)},null,2)+"\n");
}
try{main();}catch(error){process.stderr.write(error.message+"\n");process.exitCode=1;}
