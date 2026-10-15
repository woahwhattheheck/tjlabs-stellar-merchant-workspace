import { readFile,mkdir,writeFile } from "node:fs/promises";
import { resolve,dirname,join } from "node:path";
import { createRoasteryCore } from "../src/roastery-core.mjs";
const [commandsFile,outDir]=process.argv.slice(2);if(!commandsFile||!outDir)throw Error("Usage: node native/cli.mjs commands.json new-output-directory");
const file=resolve(commandsFile),base=dirname(file),commands=JSON.parse(await readFile(file,"utf8"));if(!Array.isArray(commands))throw Error("Commands must be an array");
const core=createRoasteryCore();let workspace=core.empty();const log=[];
for(const command of commands){const at=command.at||new Date().toISOString();switch(command.op){
 case "open":workspace=core.reopen(JSON.parse(await readFile(resolve(base,command.path),"utf8")));break;
 case "name":workspace.caseName=String(command.value);break;
 case "receive":workspace=core.receive(workspace,command.table,await readFile(resolve(base,command.path),"utf8"),command.path,at);break;
 case "freeze":workspace=core.freeze(workspace,command.reviewer,command.note,at);break;
 case "outcome":workspace=core.recordOutcome(workspace,command.planId,command.batchId,command.green_g,command.roasted_g,command.reference,command.note,at);break;
 case "notes":workspace.notes=String(command.value);break;
 default:throw Error("Unknown operation "+command.op)
}log.push({op:command.op,at,captures:workspace.captures.length,plans:workspace.frozenPlans.length,outcomes:workspace.outcomes.length})}
const plan=core.analyse(workspace),directory=resolve(outDir);await mkdir(directory);
const outputs={"Roastery_Complete_Workspace.json":JSON.stringify(workspace,null,2)+"\n","Roastery_Plan.json":JSON.stringify(plan,null,2)+"\n","Roastery_Roast_Batches.csv":core.csv(plan.batches,["batch_id","lot_id","profile_id","green_g","planned_roasted_g","unallocated_roasted_g","earliest_due"]),"Roastery_Working_Report.html":'<!doctype html><meta charset="utf-8"><title>Roastery report</title><main>'+core.report(workspace)+'</main>',"Run.json":JSON.stringify({node:process.version,commands:file,log},null,2)+"\n"};
for(const [name,body]of Object.entries(outputs))await writeFile(join(directory,name),body,{flag:"wx"});console.log(JSON.stringify({directory,files:Object.keys(outputs),issues:plan.issues,totals:plan.totals},null,2));
if(plan.issues.length)process.exitCode=1;
