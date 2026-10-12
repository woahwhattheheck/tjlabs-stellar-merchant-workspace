#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { savePlan,validatePlan } from "./plan.mjs";
import { connectionClient,beginSession,captureSession,compareSessions } from "./client.mjs";
import { exportHandover,verifyHandover,receiveHandover } from "./handover.mjs";
import { commissioningReport } from "./report.mjs";
import { readJSON,readFile,writeNew,jsonBytes,sha256,need } from "./io.mjs";
const HELP=[
"Airflow commissioning",
"",
"  node airflow/cli.mjs plan --environment ENV.json --connection CONNECTION.json --selection SELECTION.json --directory DIR",
"  node airflow/cli.mjs begin --directory DIR --session first [--token-file FILE]",
"  python airflow/execute.py --help",
"  node airflow/cli.mjs review --directory DIR --session first --execution EXECUTION.json [--run-ids IDS.json] [--token-file FILE]",
"  node airflow/cli.mjs compare --directory DIR --first first --second second [--token-file FILE]",
"  node airflow/cli.mjs report --directory DIR --out REPORT.html",
"  node airflow/cli.mjs export --directory DIR --out HANDOVER.json [--token-file FILE]",
"  node airflow/cli.mjs verify --input HANDOVER.json",
"  node airflow/cli.mjs receive --input HANDOVER.json --directory NEW_DIRECTORY",
"  node airflow/cli.mjs status --directory DIR",
"  node airflow/cli.mjs desk --out DESK.html",
"",
"Compile a separate saved plan for each exact cohort/date. Use --plan FILE for a later cohort plan; keep both session reviews in the same commissioning directory.",
"Tokens are read from an existing private file or the plan's named environment variable."
].join("\n");
function parse(argv){const [command,...rest]=argv,options={};for(let i=0;i<rest.length;i+=2){need(rest[i]?.startsWith("--")&&rest[i+1]!==undefined,"Use named --option value arguments");const key=rest[i].slice(2);need(!(key in options),"Repeated argument: "+key);options[key]=rest[i+1];}return {command,options};}
async function token(options,plan) {
  if(options["token-file"])return (await readFile(options["token-file"])).toString("utf8").trim();
  return process.env[plan.configuration.tokenEnv]??null;
}
async function findReviews(directory){
  const names=(await fs.readdir(directory)).filter(x=>/^review-[A-Za-z0-9_.-]+\.json$/.test(x)&&!x.endsWith("-current.json"));
  return Promise.all(names.map(x=>readJSON(join(directory,x))));
}
export async function main(argv=process.argv.slice(2)){
  if(!argv.length||["help","--help","-h"].includes(argv[0])){process.stdout.write(HELP+"\n");return;}
  const {command,options:o}=parse(argv);
  const directory=o.directory?resolve(o.directory):null;
  if(command==="desk"){need(o.out,"Choose --out");const bytes=await readFile(new URL("./desk.html",import.meta.url));await writeNew(o.out,bytes);return {path:resolve(o.out),bytes:bytes.length};}
  if(command==="plan"){
    need(directory&&o.environment&&o.connection&&o.selection,"Select environment, connection, selection and a new directory");
    const observation=await readJSON(o.environment),connection=await readJSON(o.connection),selection=await readJSON(o.selection);
    return savePlan(observation,connection,selection,directory);
  }
  if(command==="verify"){need(o.input,"Choose --input");const v=verifyHandover(await readFile(o.input));return {sha256:v.sha256,workspaceId:v.payload.workspaceId,revision:v.payload.revision,sourceFiles:v.operator.size,documents:v.documents.size};}
  if(command==="receive"){need(o.input&&directory,"Choose --input and a new --directory");return receiveHandover(await readFile(o.input),directory);}
  need(directory,"Choose --directory");
  if(command==="status"){
    const entries=await fs.readdir(directory),plan=await readJSON(join(directory,"plan.json"));
    return {directory,operationId:plan.operationId,planSha256:sha256(jsonBytes(plan)),sessions:entries.filter(x=>x.startsWith("session-")),reviews:(await findReviews(directory)).map(x=>({session:x.sessionId,complete:x.complete,edition:x.editionId})),execution:entries.includes("execution.json")};
  }
  const plan=validatePlan(await readJSON(o.plan??join(directory,"plan.json")));
  if(command==="report"){
    need(o.out,"Choose --out");const reviews=await findReviews(directory);
    const comparisonFile=(await fs.readdir(directory)).find(x=>x.startsWith("comparison-"));
    const report=commissioningReport(plan,reviews,comparisonFile?await readJSON(join(directory,comparisonFile)):null);
    await writeNew(o.out,Buffer.from(report));return {path:resolve(o.out),bytes:Buffer.byteLength(report)};
  }
  const client=connectionClient(plan,{token:await token(o,plan)});
  if(command==="begin")return beginSession(client,plan,directory,{sessionId:o.session??"first"});
  if(command==="review")return captureSession(client,plan,directory,{sessionId:o.session??"first",title:o.title,
    execution:o.execution?await readJSON(o.execution):null,runIds:o["run-ids"]?await readJSON(o["run-ids"]):{}});
  if(command==="compare")return compareSessions(client,directory,o.first??"first",o.second??"second");
  if(command==="export"){need(o.out,"Choose --out");return exportHandover(client,directory,o.out);}
  throw new Error("Unknown command. Use --help.");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().then(result=>{if(result!==undefined)process.stdout.write(JSON.stringify(result,null,2)+"\n");})
    .catch(error=>{process.stderr.write(error.message+"\n");process.exitCode=1;});
}
