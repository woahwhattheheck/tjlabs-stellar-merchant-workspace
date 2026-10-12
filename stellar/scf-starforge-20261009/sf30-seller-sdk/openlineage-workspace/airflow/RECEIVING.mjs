#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { startServer } from "../server.mjs";
import { LineageClient } from "../client.mjs";
import { LineageWorkspace } from "../store.mjs";
import { createPlan, validatePlan, installationFiles } from "./plan.mjs";
import { connectionClient, beginSession, captureSession, compareSessions } from "./client.mjs";
import { exportHandover, verifyHandover, receiveHandover } from "./handover.mjs";
import { jsonBytes, sha256, readJSON, readFile, writeNew, atomicJSON, need } from "./io.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const OPERATION_ID = "SCF-AIRFLOW-PROVIDER-COMMISSIONING-E258-20261012";
const SCHEMA = "commons.openlineage.airflow-native-receiving.v1";
const DAG_ID = "commons_csv_settlement";
const FIRST_CSV = "invoice_id,customer,currency,amount\nINV-1001,Northwind,USD,125.00\nINV-1002,Northwind,USD,75.25\nINV-2001,Harbor,USD,210.50\nCR-2002,Harbor,USD,-10.50\n";
const CORRECTION_CSV = "invoice_id,customer,currency,amount\nINV-1001,Northwind,USD,125.00\nINV-1002,Northwind,USD,95.25\nINV-2001,Harbor,USD,210.50\nCR-2002,Harbor,USD,-10.50\nINV-1003,Northwind,USD,40.00\n";

async function exists(path) {
  try { await fs.lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function fileIdentity(path) {
  const bytes = await readFile(path);
  return {path:resolve(path), bytes:bytes.length, sha256:sha256(bytes)};
}
async function privateKey(path) {
  if (!await exists(path)) await writeNew(path, randomBytes(32).toString("hex"));
  return (await readFile(path)).toString("utf8").trim();
}
async function replaceWorking(path, bytes, permittedHashes) {
  if (await exists(path)) need(permittedHashes.includes(sha256(await readFile(path))),
    "The retained working source changed outside its original two editions");
  const temporary = path + ".pending-" + randomUUID();
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  try {
    await fs.rename(temporary, path);
    const parent = await fs.open(dirname(path), "r");
    try { await parent.sync(); } finally { await parent.close(); }
  } finally { await fs.unlink(temporary).catch(error => {if(error.code!=="ENOENT")throw error;}); }
}

/** A real asynchronous child leaves the collector available for provider HTTP. */
async function nativeCommand(root, name, command, env) {
  const directory = await fs.mkdtemp(join(root, "native-" + name + "-"));
  const stdoutPath = join(directory, "stdout.log"), stderrPath = join(directory, "stderr.log");
  const stdout = await fs.open(stdoutPath, "wx", 0o600), stderr = await fs.open(stderrPath, "wx", 0o600);
  const record = {name, command, directory, startedAt:new Date().toISOString()};
  let child;
  try {
    child = spawn(command[0], command.slice(1), {env, stdio:["ignore", stdout.fd, stderr.fd]});
    const completion = new Promise(accept => {
      child.once("error",error=>accept({spawnError:error}));
      child.once("close",(exitCode,signal)=>accept({exitCode,signal}));
    });
    record.pid = child.pid ?? null;
    await atomicJSON(join(directory, "command.json"), {...record, phase:"RUNNING"});
    const result = await completion;
    if(result.spawnError)throw result.spawnError;
    Object.assign(record, result, {phase:"FINISHED", finishedAt:new Date().toISOString()});
    await stdout.sync(); await stderr.sync();
    record.stdout = await fileIdentity(stdoutPath); record.stderr = await fileIdentity(stderrPath);
    await atomicJSON(join(directory, "command.json"), record);
    return record;
  } catch (error) {
    await atomicJSON(join(directory, "command.json"), {...record, phase:"INTERRUPTED",
      error:{name:error.name,code:error.code??null}, observedAt:new Date().toISOString()});
    throw error;
  } finally { await stdout.close(); await stderr.close(); }
}
async function successfulNative(root,name,command,env) {
  const record = await nativeCommand(root,name,command,env);
  need(record.exitCode===0, "Original native "+name+" returned "+record.exitCode+"; receive "+record.directory);
  return record;
}
async function captureComplete(client,plan,directory,sessionId,execution) {
  const deadline = Date.now()+60000;
  let review;
  do {
    review = await captureSession(client,plan,directory,{sessionId,execution});
    if(review.complete)return review;
    if(Date.now()<deadline)await delay(1000);
  }while(Date.now()<deadline);
  throw new Error("Receive the same native cohort from "+join(directory,"review-"+sessionId+"-current.json"));
}
function verifyNativeLineage(review,root) {
  need(review.complete && review.cohorts.length===1,"Original complete native DAG review required");
  const cohort=review.cohorts[0];
  need(cohort.airflowRunId && cohort.terminal==="COMPLETE","Original native DagRun identity and terminal required");
  for(const taskId of ["normalize_invoices","settle_customers"]){
    const runs=cohort.taskRuns.filter(row=>row.taskId===taskId);
    need(runs.some(row=>row.states.includes("START")&&row.states.includes("COMPLETE")),
      "Original provider task lifecycle is incomplete: "+taskId);
  }
  for(const [taskId,input,output] of [
    ["normalize_invoices","invoices.csv","normalized.json"],
    ["settle_customers","normalized.json","settlements.json"]
  ]){
    need(review.events.some(row=>row.event.job.name===DAG_ID+"."+taskId &&
      row.event.inputs?.some(dataset=>dataset.name===join(root,"working",input)) &&
      row.event.outputs?.some(dataset=>dataset.name===join(root,"working",output))),
      "Original provider datasets are incomplete: "+taskId);
  }
}
async function receiverChild(directory) {
  const operatorToken=(await readFile(process.env.COMMONS_AIRFLOW_OPERATOR_TOKEN_FILE)).toString("utf8").trim();
  const producerToken=(await readFile(process.env.COMMONS_AIRFLOW_PRODUCER_TOKEN_FILE)).toString("utf8").trim();
  const host=await startServer({directory,port:0,token:operatorToken,producerToken});
  let ending=false;
  const close=async()=>{if(ending)return;ending=true;await host.close();process.exitCode=0;if(process.connected)process.disconnect();};
  process.on("message",message=>{if(message?.type==="close")close().catch(error=>{console.error(error.message);process.exitCode=1;});});
  process.once("disconnect",()=>{close().catch(()=>{process.exitCode=1;});});
  process.once("SIGTERM",()=>{close().catch(()=>{process.exitCode=1;});});
  process.send?.({type:"ready",identity:host.identity});
}
async function openReceivedProcess(directory,root,environment) {
  const logDirectory=await fs.mkdtemp(join(root,"received-process-"));
  const stdout=await fs.open(join(logDirectory,"stdout.log"),"wx",0o600);
  const stderr=await fs.open(join(logDirectory,"stderr.log"),"wx",0o600);
  const entry=join(directory,"application","airflow","RECEIVING.mjs");
  let child,closed;
  try {
    child=spawn(process.execPath,[entry,"--receiver-child",directory],{
      env:environment,stdio:["ignore",stdout.fd,stderr.fd,"ipc"]});
    closed=new Promise(resolve=>child.once("close",(exitCode,signal)=>resolve({exitCode,signal})));
    const identity=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Original received application did not announce readiness: "+logDirectory)),30000);
      child.once("error",error=>{clearTimeout(timer);reject(error);});
      child.once("close",()=>{clearTimeout(timer);reject(new Error("Original received application ended before readiness: "+logDirectory));});
      child.on("message",message=>{if(message?.type==="ready"){clearTimeout(timer);resolve(message.identity);}});
    });
    return {identity,pid:child.pid,logDirectory,close:async()=>{
      if(child.connected)child.send({type:"close"});
      const timer=setTimeout(()=>child.kill("SIGTERM"),10000);
      try { const result=await closed;need(result.exitCode===0,"Original received application close failed");return result; }
      finally { clearTimeout(timer);await stdout.close();await stderr.close(); }
    }};
  } catch(error) {
    child?.kill("SIGTERM");
    if(closed)await closed;
    await stdout.close();await stderr.close();throw error;
  }
}

/** Continue this original private native operation; each completed phase is reused. */
export async function receiveOriginalAirflow(directory,{python="python3"}={}) {
  const root=resolve(directory), checkpoint=join(root,"airflow-native-operation.json");
  await fs.mkdir(root,{recursive:true,mode:0o700});
  const stat=await fs.stat(root);
  need((stat.mode&0o077)===0,"Use a private original operation directory");
  if(!await exists(checkpoint))need((await fs.readdir(root)).every(name=>name===".native-receiving.lock"),
    "Select an empty directory or this original Airflow receiving operation");
  const operation=await exists(checkpoint)?await readJSON(checkpoint):{
    schema:SCHEMA,operationId:OPERATION_ID,directory:root,python,startedAt:new Date().toISOString(),completed:{}
  };
  need(operation.schema===SCHEMA&&operation.operationId===OPERATION_ID&&operation.directory===root&&operation.python===python,
    "Continue the original operation, directory and Python interpreter");
  const sourceFiles=[];
  for(const name of ["environment.py","execute.py","receiving_csv_dag.py","RECEIVING.mjs"])
    sourceFiles.push({name,...await fileIdentity(join(ROOT,name))});
  operation.sourceEditions??=[];
  const sourceKey=sha256(jsonBytes(sourceFiles));
  if(!operation.sourceEditions.some(item=>item.sha256===sourceKey))
    operation.sourceEditions.push({sha256:sourceKey,files:sourceFiles,receivedAt:new Date().toISOString()});
  await atomicJSON(checkpoint,operation);
  const phase=async(name,run)=>{
    if(Object.hasOwn(operation.completed,name))return operation.completed[name];
    const value=await run();operation.completed[name]=value;await atomicJSON(checkpoint,operation);return value;
  };
  for(const name of ["inputs","working","artifacts","airflow-home","commissioning"])
    await fs.mkdir(join(root,name),{recursive:true,mode:0o700});
  await writeNew(join(root,"inputs","first.csv"),FIRST_CSV);
  await writeNew(join(root,"inputs","corrected.csv"),CORRECTION_CSV);
  const operatorPath=join(root,"operator-token"),producerPath=join(root,"producer-token");
  const operatorToken=await privateKey(operatorPath),producerToken=await privateKey(producerPath);
  const environment={...process.env,AIRFLOW_HOME:join(root,"airflow-home"),
    AIRFLOW__CORE__DAGS_FOLDER:join(root,"airflow-home","dags"),AIRFLOW__CORE__LOAD_EXAMPLES:"false",
    AIRFLOW__DATABASE__SQL_ALCHEMY_CONN:"sqlite:///"+join(root,"airflow-home","airflow.db"),
    AIRFLOW__OPENLINEAGE__DISABLED:"true",OPENLINEAGE_DISABLED:"true",
    COMMONS_AIRFLOW_RECEIVING_ROOT:root,COMMONS_OPENLINEAGE_TOKEN:producerToken,
    COMMONS_AIRFLOW_OPERATOR_TOKEN_FILE:operatorPath,COMMONS_AIRFLOW_PRODUCER_TOKEN_FILE:producerPath};
  const dagPath=join(environment.AIRFLOW__CORE__DAGS_FOLDER,"receiving_csv_dag.py");
  await writeNew(dagPath,await readFile(join(ROOT,"receiving_csv_dag.py")));
  let host,received;
  try {
    const inspection=await phase("native-environment",async()=>{
      const result=await successfulNative(root,"environment",
        [python,join(ROOT,"environment.py"),"--output","-"],environment);
      const observation=JSON.parse((await readFile(result.stdout.path)).toString("utf8"));
      need(observation.requirementsSatisfied,"Prepare the pinned provider and its reported installed dependencies");
      await atomicJSON(join(root,"commissioning","environment-observation.json"),observation);
      return {command:result,observation};
    });
    environment.AIRFLOW__CORE__EXECUTOR=Number(inspection.observation.airflow.version.split(".")[0])<3?
      "SequentialExecutor":"LocalExecutor";
    environment.AIRFLOW__CORE__PARALLELISM="1";
    await phase("native-database",()=>successfulNative(root,"database",
      [python,"-m","airflow","db","migrate"],environment));
    // This standalone private database has no scheduler to register its original DAG.
    // Airflow 2 list-runs requires that native DagModel before its first empty inventory.
    if(Number(inspection.observation.airflow.version.split(".")[0])<3)
      await phase("native-dag-registration",()=>successfulNative(root,"dag-registration",
        [python,"-m","airflow","dags","reserialize","--subdir",dagPath],environment));
    host=await startServer({directory:join(root,"workspace"),port:operation.collectorPort??0,
      token:operatorToken,producerToken});
    if(operation.workspaceId)need(host.identity.workspaceId===operation.workspaceId,"Original collector workspace changed");
    operation.workspaceId=host.identity.workspaceId;
    operation.collectorPort=Number(new URL(host.url).port);
    operation.collectorInstances??=[];operation.collectorInstances.push(host.identity);
    await atomicJSON(checkpoint,operation);
    const commission=join(root,"commissioning");
    const operator=()=>new LineageClient(host.url,{token:operatorToken,expectedWorkspaceId:operation.workspaceId});
    const runEdition=async(sessionId,csv,logicalDate,documentCount,totalCents,northwindCents)=>{
      const plan=await phase(sessionId+"-plan",async()=>{
        const savedPlanPath=join(commission,sessionId==="first"?"plan.json":"plan-corrected.json");
        const selected=await exists(savedPlanPath)?validatePlan(await readJSON(savedPlanPath)):
          createPlan(inspection.observation,host.identity,{
            operationId:OPERATION_ID,namespace:"commons-airflow-native",mode:sessionId==="first"?"connection":"environment",
            title:"CSV settlement "+sessionId,dags:[{dagId:DAG_ID,logicalDate,dagFilePath:dagPath,
              taskIds:["normalize_invoices","settle_customers"],conf:{edition:sessionId},expectedTerminal:"COMPLETE"}]
          });
        need(selected.operationId===OPERATION_ID&&selected.dags.length===1&&
          selected.dags[0].dagId===DAG_ID&&selected.dags[0].logicalDate===logicalDate&&
          selected.dags[0].conf?.edition===sessionId,"Original prepared native plan differs");
        await writeNew(savedPlanPath,jsonBytes(selected));
        if(sessionId==="first")for(const [name,body]of Object.entries(installationFiles(selected)))
          await writeNew(join(commission,name),body);
        return selected;
      });
      need(plan.connection.url===host.url&&plan.connection.workspaceId===operation.workspaceId,
        "Reopen the original collector address retained by this exact plan");
      const client=connectionClient(plan,{token:operatorToken});
      await phase(sessionId+"-input",async()=>{
        await replaceWorking(join(root,"working","invoices.csv"),Buffer.from(csv),
          [sha256(Buffer.from(FIRST_CSV)),sha256(Buffer.from(CORRECTION_CSV))]);
        return await fileIdentity(join(root,"working","invoices.csv"));
      });
      await phase(sessionId+"-session",()=>beginSession(client,plan,commission,{sessionId}));
      const executed=await phase(sessionId+"-native",async()=>{
        const planPath=join(commission,sessionId==="first"?"plan.json":"plan-corrected.json");
        const executionDirectory=join(root,"native-execution-"+sessionId);
        const command=await nativeCommand(root,sessionId+"-dag",
          [python,join(ROOT,"execute.py"),"--plan",planPath,"--plan-sha256",sha256(jsonBytes(plan)),
           "--output",executionDirectory],environment);
        const execution=await readJSON(join(executionDirectory,"execution.json"));
        need(command.exitCode===0&&execution.phase==="FINISHED",
          "Receive the same native "+sessionId+" execution from "+executionDirectory);
        need(execution.runReceivingComplete,"Receive the original native DagRun ID in "+executionDirectory);
        const normalized=await readJSON(join(root,"working","normalized.json"));
        const settlement=await readJSON(join(root,"working","settlements.json"));
        need(normalized.edition===sessionId&&normalized.sourceSha256===sha256(Buffer.from(csv)),
          "Normalized output must bind the exact CSV edition");
        need(settlement.edition===sessionId&&settlement.documentCount===documentCount&&
          settlement.customerCount===2&&settlement.totalsByCurrency.USD===totalCents,
          "Original native settlement totals differ");
        need(settlement.customers.find(row=>row.customer==="Northwind").amountCents===northwindCents,
          "Original Northwind correction differs");
        for(const name of ["normalized","settlements"])
          await writeNew(join(root,"artifacts",sessionId+"-"+name+".json"),
            await readFile(join(root,"working",name+".json")));
        return {command,execution,normalized,settlement};
      });
      const review=await phase(sessionId+"-review",async()=>{
        const captured=await captureComplete(client,plan,commission,sessionId,executed.execution);
        verifyNativeLineage(captured,root);
        return captured;
      });
      return {plan,review,executed};
    };
    const first=await runEdition("first",FIRST_CSV,"2026-10-10T09:00:00+00:00",4,40025,20025);
    const second=await runEdition("corrected",CORRECTION_CSV,"2026-10-11T09:00:00+00:00",5,46025,26025);
    await phase("original-correction-comparison",async()=>{
      need(first.review.cohorts[0].airflowRunId!==second.review.cohorts[0].airflowRunId,
        "Both original native DagRun IDs must be retained");
      need(first.review.eventIds.every(id=>!second.review.eventIds.includes(id)),
        "Review event membership must stay in its original cohort");
      const comparison=await compareSessions(operator(),commission,"first","corrected");
      return {comparison,correctionCents:second.executed.settlement.totalsByCurrency.USD-
        first.executed.settlement.totalsByCurrency.USD};
    });
    const exported=await phase("complete-customer-export",async()=>{
      const path=join(root,"airflow-customer-handover.json");
      if(await exists(path)){
        const bytes=await readFile(path),prior=verifyHandover(bytes);
        need(prior.payload.operationId===OPERATION_ID&&prior.payload.workspaceId===operation.workspaceId&&
          [first.review,second.review].every(review=>prior.inner.state.editions.some(row=>row.id===review.editionId)),
          "Original prepared customer export differs");
        return {path,bytes:bytes.length,sha256:sha256(bytes),workspaceId:prior.payload.workspaceId,
          workspaceRevision:prior.payload.revision,editions:[first.review.editionId,second.review.editionId],
          operatorFiles:prior.operator.size,documents:prior.documents.size};
      }
      return exportHandover(operator(),commission,path);
    });
    const archive=await readFile(exported.path),verified=verifyHandover(archive);
    need(verified.sha256===exported.sha256&&verified.inner.state.workspaceId===operation.workspaceId,
      "Original complete customer handover differs");
    const destination=join(root,"received");
    await phase("complete-destination-receiving",()=>receiveHandover(archive,destination));
    received=await openReceivedProcess(destination,root,environment);
    need(received.identity.workspaceId===operation.workspaceId,"Original received workspace differs");
    const receiver=()=>new LineageClient(received.identity.url,{token:operatorToken,
      expectedWorkspaceId:operation.workspaceId});
    await phase("receiving-source-readback",async()=>{
      const state=await new LineageWorkspace(destination).read();
      for(const review of [first.review,second.review]){
        need(state.editions.some(edition=>edition.id===review.editionId),"Received edition is missing");
        for(const original of review.sources){
          const source=await receiver().action("source.read",{id:original.id,decode:true});
          need(sha256(Buffer.from(source.base64,"base64"))===original.id,"Received native wire bytes differ");
        }
      }
      return {workspaceId:state.workspaceId,revision:state.revision,eventCount:state.events.length,
        sourceCount:state.sources.length,instanceId:received.identity.instanceId,pid:received.pid};
    });
    const later=await phase("receiving-operator-edition",async()=>{
      const requestPath=join(root,"receiving-edition-request.json");
      let request;
      if(await exists(requestPath))request=await readJSON(requestPath);
      else {
        request={title:"Receiving operator review of both native Airflow editions",
          description:"Both original CSV processing editions, native provider source and corrected settlement received.",
          operationId:OPERATION_ID+":receiving-operator-edition",
          expectedRevision:(await receiver().metadata()).revision};
        await writeNew(requestPath,jsonBytes(request));
      }
      return await receiver().saveEdition(request);
    });
    await phase("same-handover-preserves-later-work",async()=>{
      const before=await receiver().metadata();
      const replay=await receiveHandover(archive,destination);
      const after=await receiver().metadata();
      need(replay.alreadyPresent&&before.revision===after.revision,
        "Same handover replay must preserve later receiving work");
      const state=await new LineageWorkspace(destination).read();
      need(state.editions.some(edition=>edition.id===later.edition.id),"Later receiving edition was lost");
      return {replay,laterEditionId:later.edition.id,revision:after.revision};
    });
    const oldIdentity=received.identity,firstClose=await received.close();received=null;
    received=await openReceivedProcess(destination,root,environment);
    await phase("independent-cold-reopen",async()=>{
      need(received.identity.instanceId!==oldIdentity.instanceId,"Open a new received application process");
      const state=await new LineageWorkspace(destination).read();
      need(state.workspaceId===operation.workspaceId&&state.editions.some(edition=>edition.id===later.edition.id),
        "Cold receiving application lost original or later state");
      const exact=await receiveHandover(archive,destination);
      need(exact.currentRevision===state.revision,"Cold same-archive receiving changed the workspace");
      return {previousInstanceId:oldIdentity.instanceId,instanceId:received.identity.instanceId,
        pid:received.pid,workspaceId:state.workspaceId,revision:state.revision,firstClose,
        eventCount:state.events.length,sourceCount:state.sources.length,editionIds:state.editions.map(row=>row.id)};
    });
    operation.completedAt??=new Date().toISOString();
    delete operation.interruption;
    await atomicJSON(checkpoint,operation);
    const result={...operation,customerHandover:exported};
    await atomicJSON(join(root,"airflow-native-receiving.json"),result);
    return result;
  }catch(error){
    operation.interruption={at:new Date().toISOString(),name:error.name,message:error.message};
    await atomicJSON(checkpoint,operation);throw error;
  }finally{
    if(received)await received.close();
    if(host)await host.close();
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==="--receiver-child")await receiverChild(resolve(process.argv[3]));
  else {
    const directory=process.argv[2],index=process.argv.indexOf("--python");
    need(directory,"Provide the original private Airflow receiving directory");
    receiveOriginalAirflow(directory,{python:index<0?"python3":process.argv[index+1]})
      .then(result=>console.log(JSON.stringify(result,null,2)))
      .catch(error=>{console.error(JSON.stringify({error:error.message}));process.exitCode=1;});
  }
}
