import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { verifyBundle, receiveBundle, LineageWorkspace } from "../store.mjs";
import { readFile, readJSON, writeNew, ordinaryPath, jsonBytes, sha256, canonical, need, withDirectoryLock } from "./io.mjs";
const ROOT=dirname(fileURLToPath(import.meta.url));
const ORIGINAL_AIRFLOW_SOURCE_FILES=[
  "OPERATING.md","client.mjs","cli.mjs","desk.html","environment.py","execute.py",
  "handover.mjs","io.mjs","mcp.mjs","package.json","plan.mjs","report.mjs","sources.json","RECEIVING.mjs","receiving_csv_dag.py","NATIVE_RECEIVING.md"
];
export const AIRFLOW_SOURCE_FILES=[...ORIGINAL_AIRFLOW_SOURCE_FILES,"runtime_bundle.py","RUNTIME_BUNDLES.md"];
const AIRFLOW_SOURCE_EDITIONS=[ORIGINAL_AIRFLOW_SOURCE_FILES,AIRFLOW_SOURCE_FILES];
function entry(path,bytes){return {path,bytes:bytes.length,sha256:sha256(bytes),base64:bytes.toString("base64")};}
function verifyReviewMembership(review,state) {
  const edition=state.editions.find(x=>x.id===review.editionId);
  need(edition,"A selected commissioning edition is absent from the workspace export");
  const eventIds=new Set(edition.eventIds),sourceIds=new Set(edition.sourceIds);
  need(review.eventIds.every(id=>eventIds.has(id))&&review.sourceIds.every(id=>sourceIds.has(id)),"A review contains events or sources outside its original saved edition");
  need(Array.isArray(review.events)&&review.events.length===review.eventIds.length&&
    review.events.every(row=>review.eventIds.includes(row.id)&&canonical(row.event)===canonical(state.events.find(x=>x.id===row.id)?.event)),
    "A review's full event body differs from its original retained event");
}
export async function exportHandover(client,directory,destination,{includePrivateExecution=false}={}) {
  return withDirectoryLock(directory,async()=>{
    const plan=await readJSON(join(directory,"plan.json"));
    const reviews=(await fs.readdir(directory)).filter(x=>/^review-[A-Za-z0-9_.-]+\.json$/.test(x)&&!x.endsWith("-current.json"));
    need(reviews.length>=2,"Receive and save the two original commissioning editions before final customer export");
    const reviewed=await Promise.all(reviews.map(x=>readJSON(join(directory,x))));
    need(reviewed.every(x=>x.complete&&x.editionId&&x.workspaceId===plan.connection.workspaceId),"Export requires complete saved editions from the original workspace");
    const exported=await client.exportWorkspace({includeApplication:true});
    const innerPath=join(directory,"workspace-"+exported.id+".json");
    await client.downloadExport(exported.id,innerPath);
    const innerBytes=await readFile(innerPath),inner=verifyBundle(innerBytes);
    need(inner.state.workspaceId===plan.connection.workspaceId,"The workspace export identity differs from the plan");
    need(inner.application.size>0,"Include the original executable application in the customer export");
    for(const review of reviewed)verifyReviewMembership(review,inner.state);
    const operator=[];
    for(const name of AIRFLOW_SOURCE_FILES)operator.push(entry(name,await readFile(join(ROOT,name))));
    const allowed=/^(?:plan|plan-[0-9a-f]{64}|environment|environment-observation|selection|installation|connection\.example|session-[A-Za-z0-9_.-]+|review-[A-Za-z0-9_.-]+|comparison-[A-Za-z0-9_.-]+)\.json$|^requirements-airflow\.txt$|^COMMISSIONING\.html$/;
    const documents=[];
    for(const name of (await fs.readdir(directory)).sort())if(allowed.test(name)){
      documents.push(entry(name,await readFile(join(directory,name))));
    }
    // Execution logs remain private by default. Include only the existing native result when selected.
    if(includePrivateExecution){
      const bytes=await readFile(join(directory,"execution.json"));
      documents.push(entry("execution.json",bytes));
    }
    const payload={schema:"commons.openlineage.airflow-handover.v1",createdAt:new Date().toISOString(),
      operationId:plan.operationId,workspaceId:inner.state.workspaceId,revision:inner.state.revision,
      workspace:entry("workspace.json",innerBytes),operator,documents};
    const envelope={...payload,payloadSha256:sha256(Buffer.from(canonical(payload)))};
    const bytes=jsonBytes(envelope);await writeNew(destination,bytes);
    return {path:resolve(destination),bytes:bytes.length,sha256:sha256(bytes),workspaceId:payload.workspaceId,
      workspaceRevision:payload.revision,editions:reviewed.map(x=>x.editionId),operatorFiles:operator.length,documents:documents.length};
  });
}
export function verifyHandover(bytes) {
  const envelope=JSON.parse(Buffer.from(bytes).toString("utf8"));
  const {payloadSha256,...payload}=envelope;
  need(payload.schema==="commons.openlineage.airflow-handover.v1"&&sha256(Buffer.from(canonical(payload)))===payloadSha256,"Airflow handover payload differs");
  function entries(rows){
    need(Array.isArray(rows),"Package file inventory is missing");
    const found=new Map();
    for(const row of rows){
      ordinaryPath("/package",row.path);need(!found.has(row.path),"Duplicate package path");
      need(typeof row.base64==="string"&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.base64),"Invalid original base64 bytes");
      const data=Buffer.from(row.base64,"base64");
      need(data.length===row.bytes&&sha256(data)===row.sha256,"Package file differs: "+row.path);found.set(row.path,data);
    }return found;
  }
  const operator=entries(payload.operator),documents=entries(payload.documents),workspace=entries([payload.workspace]);
  need(AIRFLOW_SOURCE_EDITIONS.some(files=>operator.size===files.length&&files.every(x=>operator.has(x))),"Airflow source inventory differs from a complete supported operator edition");
  need(workspace.has("workspace.json"),"Original workspace package is missing");
  const inner=verifyBundle(workspace.get("workspace.json"));
  need(inner.application.size>0&&inner.state.workspaceId===payload.workspaceId&&inner.state.revision===payload.revision,"Original workspace identity differs");
  need(documents.has("plan.json"),"Commissioning plan is missing");
  const plan=JSON.parse(documents.get("plan.json").toString("utf8"));
  need(plan.operationId===payload.operationId&&plan.connection?.workspaceId===payload.workspaceId,"Plan identity differs");
  const reviews=[...documents].filter(([name])=>/^review-/.test(name)&&!name.endsWith("-current.json")).map(([,data])=>JSON.parse(data.toString("utf8")));
  need(reviews.length>=2&&reviews.every(x=>x.complete&&inner.state.editions.some(e=>e.id===x.editionId)),"Complete review editions are missing");
  for(const review of reviews){verifyReviewMembership(review,inner.state);const original=documents.get("plan-"+review.planSha256+".json");need(original&&sha256(original)===review.planSha256,"A review is missing its exact original plan");}
  return {payload,payloadSha256,sha256:sha256(bytes),operator,documents,workspaceBytes:workspace.get("workspace.json"),inner};
}
export async function receiveHandover(bytes,destination) {
  const verified=verifyHandover(bytes),target=resolve(destination);
  const parent=dirname(target);await fs.mkdir(parent,{recursive:true,mode:0o700});
  try {
    const existing=await readJSON(join(target,"airflow-received.json"));
    need(existing.handoverSha256===verified.sha256,"Destination already contains a different handover");
    const state=await new LineageWorkspace(target).read();
    need(state.workspaceId===verified.payload.workspaceId,"Received workspace identity changed");
    // A later customer correction is preserved when the same handover is received again.
    return {...existing,directory:target,currentRevision:state.revision,alreadyPresent:true};
  }catch(e){if(e.code!=="ENOENT")throw e;}
  try {await fs.lstat(target);throw new Error("Destination already exists; choose its original complete receiving result or a new directory");}
  catch(e){if(e.code!=="ENOENT")throw e;}
  const stage=target+".airflow-receiving-"+randomUUID();
  try {
    await receiveBundle(verified.workspaceBytes,stage);
    for(const [name,data] of verified.operator)await writeNew(ordinaryPath(join(stage,"application","airflow"),name),data);
    for(const [name,data] of verified.documents)await writeNew(ordinaryPath(join(stage,"commissioning"),name),data);
    const record={schema:"commons.openlineage.airflow-received.v1",handoverSha256:verified.sha256,
      workspaceId:verified.payload.workspaceId,revision:verified.payload.revision,
      receivedAt:new Date().toISOString(),operatorFiles:verified.operator.size,documentFiles:verified.documents.size};
    await writeNew(join(stage,"airflow-received.json"),jsonBytes(record));
    await fs.rename(stage,target);return {...record,directory:target};
  }catch(e){await fs.rm(stage,{recursive:true,force:true});throw e;}
}
