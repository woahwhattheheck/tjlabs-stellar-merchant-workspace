import {createHash} from "node:crypto";
import {prepareBatch,verifyPrepared,reconcileBatch,validateScope,SDPContractError} from "./sdp-contract.mjs";
import {SDPClient,strictJSON,verifyWebhook} from "./sdp-native.mjs";
const hash=value=>createHash("sha256").update(value).digest("hex");
const bytes=value=>Buffer.from(JSON.stringify(value,null,2)+"\n");
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function need(ok,code,message){if(!ok)throw new SDPContractError(code,message);}
function requestID(kind,digest){const h=hash(Buffer.from(kind+"\n"+digest));return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+"-8"+h.slice(17,20)+"-"+h.slice(20,32);}
function b64(value){need(typeof value==="string","INVALID_BASE64","Original canonical base64 required");const b=Buffer.from(value,"base64");need(b.toString("base64")===value,"INVALID_BASE64","Original canonical base64 required");return b;}
function escaped(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function table(headers,rows){return "<table><thead><tr>"+headers.map(x=>"<th>"+escaped(x)+"</th>").join("")+"</tr></thead><tbody>"+rows.map(row=>"<tr>"+row.map(x=>"<td>"+escaped(x)+"</td>").join("")+"</tr>").join("")+"</tbody></table>";}
export function renderBatchReport(prepared,snapshot,review){
 need(review.operationId===prepared.operationId&&review.disbursementId===snapshot.disbursement.id,"REPORT_SCOPE_MISMATCH","Report must select this original prepared batch and provider snapshot");
 const findings=review.findings.map(x=>[x.kind,x.paymentID??"",x.paymentId??"",JSON.stringify(x)]);
 const payments=review.items.map(x=>[x.paymentID,x.recipientExternalId,x.expectedContact??"",x.receiverId??"",x.providerRecipientExternalId??"",x.receiverWalletId??"",x.expectedAmount,x.providerAmount??"",x.status,x.stellarTransactionId??"",x.problems.join(", ")]);
 const content="<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SDP batch receiving</title><style>body{font:14px system-ui,sans-serif;color:#171717;background:#fff;margin:32px;line-height:1.5}h1{font-size:25px}h2{font-size:19px;margin-top:28px}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #aaa;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#eee}code{overflow-wrap:anywhere}.scroll{overflow:auto}dl{display:grid;grid-template-columns:180px 1fr;gap:8px}dt{font-weight:600}dd{margin:0}@media print{body{margin:0;font-size:10px}table{font-size:9px}}</style><h1>SDP batch receiving</h1><dl>"+
 [["Operation",prepared.operationId],["Disbursement",review.disbursementId],["Provider status",review.providerStatus],["Captured",review.capturedAt],["Tenant",prepared.scope.tenantName],["Source wallet",prepared.scope.sourceWalletId],["Network",prepared.scope.networkPassphrase],["Asset",prepared.scope.asset.code+" / "+prepared.scope.asset.issuer],["Expected amount",review.amounts.expected],["Recipient review",review.requiresReview?"Review required":"All captured instruction and recipient checks match"]].map(([k,v])=>"<dt>"+escaped(k)+"</dt><dd>"+escaped(v)+"</dd>").join("")+
 "</dl><p>"+escaped(snapshot.consistency)+"</p><h2>Amounts</h2>"+table(["Category","Amount"],Object.entries(review.amounts))+
 "<h2>Expected obligations by observed status</h2>"+table(["Category","Expected amount"],Object.entries(review.obligationAmounts))+
 "<h2>Provider amounts included and excluded</h2>"+table(["SDP payment","Payment reference","Provider amount","Status","Included","Category","Exclusions"],review.providerAmountRows.map(x=>[x.paymentId,x.paymentID,x.providerAmount,x.status,x.included?"Yes":"No",x.category??"",x.excluded.join(", ")]))+
 "<h2>Payments and recipient mapping</h2><div class=\"scroll\">"+table(["Payment reference","Expected recipient reference","Expected contact","SDP recipient","SDP external reference","Receiver wallet","Expected amount","Provider amount","Status","Transaction","Findings"],payments)+"</div>"+
 "<h2>Review items</h2>"+table(["Finding","Payment reference","SDP payment","Detail"],findings)+
 "<h2>Chain reconciliation</h2><p>"+escaped(review.interpretation)+"</p>"+table(["Payment reference","Transaction hash","Operation"],review.chainConfirmationRequired.map(x=>[x.paymentID,x.transactionHash,x.operationId]))+
 "<h2>Instruction handling</h2><p>"+prepared.warnings.map(escaped).join("<br>")+"</p></html>\n";
 return {filename:"sdp-batch-receiving.html",contentType:"text/html; charset=utf-8",body:Buffer.from(content)};
}
// Uses only the existing workspace sourceImport/sourceRead/sourceFile/describe methods.
// Every body, report and dispatch observation travels in its original complete export.
export function createSDPWorkspace({workspace,programmeId,programmeVersion,scope,validateAddress,getToken,transactions,connectionAlias=null,allowLoopback=false}){
 for(const name of ["describe","sourceImport","sourceRead","sourceFile"])need(typeof workspace?.[name]==="function","ORIGINAL_WORKSPACE_REQUIRED","Use the original openInvoiceWorkspace instance");
 need(typeof programmeId==="string"&&programmeId&&Number.isSafeInteger(programmeVersion)&&programmeVersion>0,"ORIGINAL_PROGRAMME_REQUIRED","Select an existing exact programme version");
 const selectedScope=validateScope(scope),sourceScope=hash(bytes(selectedScope));
 let queue=Promise.resolve();
 async function save(kind,body,{label=kind,request={},status=null,contentType="application/json",identity=null,expectedRevision=undefined}={}){
  need(Buffer.isBuffer(body),"ORIGINAL_BYTES_REQUIRED","Retain full original Buffer bytes");
  const bodySHA256=hash(body);
  const payload={provider:"document",kind:"sdp."+kind,label,programmeId,programmeVersion,network:selectedScope.networkPassphrase,sourceScope,
   bodyBase64:body.toString("base64"),contentType,status,
   request:{source:"sdp-batch-workspace",scope:selectedScope,...request}};
  const requestId=requestID(kind,identity??hash(bytes(payload)));
  const work=async()=>{
   let revision=expectedRevision??(await workspace.describe()).revision;
   need(Number.isSafeInteger(revision)&&revision>=0,"INVALID_REVISION","Use the original nonnegative workspace revision");
   // A concurrent workspace write may advance the revision. Reusing this exact
   // original requestId lets sourceImport itself distinguish a replay from a new body.
   for(let attempt=0;;attempt++){
    try{return await workspace.sourceImport({...payload,requestId,expectedRevision:revision});}
    catch(error){if(expectedRevision!==undefined||error.code!=="REVISION_CONFLICT"||attempt>=2)throw error;revision=(await workspace.describe()).revision;}
   }
  };
  const result=queue.then(work);queue=result.catch(()=>{});return result;
 }
 async function read(sourceId,{json=true}={}){
  const selected=await workspace.sourceRead({sourceId});
  const meta=selected.source;
  need(meta.provider==="document"&&meta.kind.startsWith("sdp.")&&meta.programmeId===programmeId&&meta.programmeVersion===programmeVersion&&meta.sourceScope===sourceScope,"SOURCE_SCOPE_MISMATCH","Select a source from this original programme and SDP scope");
  let offset=0;const chunks=[];let descriptor=null;
  for(;;){
   const part=await workspace.sourceFile({sourceId,offset,length:4*1024*1024});
   const body=b64(part.base64);
   need(part.offset===offset&&part.bytes===body.length,"SOURCE_RANGE_CHANGED","Original source range differs");
   if(descriptor)need(descriptor.sha256===part.file.sha256&&descriptor.bytes===part.file.bytes,"SOURCE_CHANGED","Original source changed while reading");
   descriptor??=part.file;chunks.push(body);offset+=body.length;
   if(part.eof)break;need(body.length>0,"SOURCE_STALLED","Original source did not advance");
  }
  const body=Buffer.concat(chunks);
  need(body.length===descriptor.bytes&&hash(body)===descriptor.sha256,"SOURCE_CHANGED","Retained source differs from its full descriptor");
  return {source:meta,body,value:json?strictJSON(body):null};
 }
 async function observation(result){
  const raw=b64(result.bodyBase64);
  need(hash(raw)===result.bodySHA256,"OBSERVATION_CHANGED","Native provider body differs");
  const original=await save("provider-body",raw,{label:result.descriptor.method+" "+result.descriptor.url,status:result.status,
   contentType:result.headers?.["content-type"]??"application/octet-stream",
   request:{descriptor:result.descriptor,requestSHA256:result.requestSHA256,startedAt:result.startedAt,finishedAt:result.finishedAt,
    complete:result.complete,headers:result.headers,error:result.error??null,parseError:result.parseError??null},
   identity:hash(bytes(result))});
  const outcome=await save("provider-observation",bytes(result),{request:{originalSourceId:original.sourceId}});
  return {bodySourceId:original.sourceId,observationSourceId:outcome.sourceId};
 }
 const client=typeof getToken==="function"?new SDPClient({scope:selectedScope,getToken,onObservation:observation,allowLoopback,
  admitMutation:typeof transactions?.admitMutation==="function"?transactions.admitMutation.bind(transactions):undefined,recordMutation:typeof transactions?.recordMutation==="function"?transactions.recordMutation.bind(transactions):undefined}):null;
 const online=()=>{need(client,"PROVIDER_CONNECTION_REQUIRED","Select the existing SDP connection and original credential getter");return client;};
 async function prepare(input){
  const prepared=prepareBatch(input,{validateAddress});
  need(same(prepared.scope,selectedScope),"SCOPE_MISMATCH","Prepared batch must use the selected original scope");
  const saved=await save("prepared-batch",bytes(prepared),{label:prepared.request.name});
  const instructions=await save("instructions",Buffer.from(prepared.instructions),{label:prepared.request.name+" instructions",contentType:"text/csv",request:{preparedSourceId:saved.sourceId}});
  return {preparedSourceId:saved.sourceId,instructionsSourceId:instructions.sourceId,prepared};
 }
 async function preparedSource(sourceId){
  const input=await read(sourceId);need(input.source.kind==="sdp.prepared-batch","INVALID_PREPARED_SOURCE","Select the retained original prepared batch");
  return verifyPrepared(input.value,{validateAddress});
 }
 async function receiveSnapshot({preparedSourceId,snapshot}){
  const prepared=await preparedSource(preparedSourceId);
  need(snapshot?.schema==="commons.sdp.snapshot.v1","INVALID_SNAPSHOT","Select a complete original SDP capture");
  // Recompute receiving from the whole original rows; supplied summary fields are unused.
  const review=reconcileBatch(prepared,snapshot);
  const saved=await save("snapshot",bytes(snapshot),{label:prepared.request.name+" provider snapshot",request:{preparedSourceId}});
  const reconciled=await save("reconciliation",bytes(review),{label:prepared.request.name+" receiving",request:{preparedSourceId,snapshotSourceId:saved.sourceId}});
  const report=renderBatchReport(prepared,snapshot,review);
  const rendered=await save("report",report.body,{label:prepared.request.name+" receiving report",contentType:report.contentType,
   request:{preparedSourceId,snapshotSourceId:saved.sourceId,reconciliationSourceId:reconciled.sourceId}});
  return {preparedSourceId,snapshotSourceId:saved.sourceId,reconciliationSourceId:reconciled.sourceId,reportSourceId:rendered.sourceId,review};
 }
 async function capture({preparedSourceId,disbursementId,maxPages=1000,signal}){
  await preparedSource(preparedSourceId);
  const snapshot=await online().captureDisbursement(disbursementId,{maxPages,signal});
  return receiveSnapshot({preparedSourceId,snapshot});
 }
 async function inspect({disbursementId,signal}){return online().getDisbursement(disbursementId,{signal});}
 async function createDraft({preparedSourceId,signal}){
  const prepared=await preparedSource(preparedSourceId);
  return online().createDraft(prepared,{validateAddress,signal});
 }
 async function uploadInstructions({preparedSourceId,disbursementId,observationSourceId,signal}){
  const prepared=await preparedSource(preparedSourceId),before=await read(observationSourceId);
  need(before.source.kind==="sdp.provider-observation","INVALID_OBSERVATION","Select the complete retained provider observation");
  return online().uploadInstructions(prepared,disbursementId,{validateAddress,expectedBefore:before.value,signal});
 }
 async function status({preparedSourceId,snapshotSourceId,status,signal}){
  const prepared=await preparedSource(preparedSourceId),selected=await read(snapshotSourceId);
  need(selected.source.kind==="sdp.snapshot","INVALID_SNAPSHOT_SOURCE","Select the complete retained provider snapshot");
  return online().changeStatus(prepared,selected.value.disbursement.id,status,{validateAddress,snapshot:selected.value,signal});
 }
 async function receiveSignedEvent(options){
  const verified=verifyWebhook({...options,scope:selectedScope});
  // Each authenticated delivery retains its timestamp and exact bytes in the original workspace.
  // Monetary effects belong to the customer's transactional acceptEvent callback.
  const received=await save("verified-event",bytes(verified),{label:verified.event.event_type+" "+verified.event.event_id});
  return {sourceId:received.sourceId,eventId:verified.event.event_id,eventKey:verified.eventKey};
 }
 async function projectPaymentObservation({observationSourceId}){
  need(typeof workspace.sourceProject==="function"&&connectionAlias,"ORIGINAL_CONNECTION_REQUIRED","Select the existing named SDP invoice connection for native record projection");
  const original=await read(observationSourceId),result=original.value;
  need(original.source.kind==="sdp.provider-observation"&&result.complete===true&&result.status>=200&&result.status<300,"COMPLETE_PROVIDER_RESPONSE_REQUIRED","Project a retained complete successful payment observation");
  const url=new URL(result.descriptor.url);
  need(url.pathname.endsWith("/payments")&&same(result.descriptor.scope,selectedScope),"PAYMENT_SCOPE_MISMATCH","Select this exact original SDP payments collection");
  const state=await workspace.describe(),connection=state.connections.find(x=>x.alias===connectionAlias);
  need(connection?.provider==="sdp"&&connection.sourceScope===result.nativeTransport?.descriptor?.id,"ORIGINAL_CONNECTION_MISMATCH","Named invoice connection must match this exact original native transport scope");
  const saved=await save("provider-body",b64(result.bodyBase64),{request:{observationSourceId},status:result.status});
  return workspace.sourceProject({sourceId:saved.sourceId,provider:"sdp",kind:"payments",recordsPath:"/data",connectionAlias,
   network:selectedScope.networkPassphrase,sourceScope:connection.sourceScope,
   requestId:requestID("project",hash(bytes({observationSourceId,connectionAlias}))),expectedRevision:(await workspace.describe()).revision});
 }
 async function applySignedEvent(options){
  need(typeof transactions?.acceptEvent==="function","ORIGINAL_TRANSACTION_REQUIRED","Use the customer's existing atomic event-and-effect transaction");
  const verified=verifyWebhook({...options,scope:selectedScope});
  await save("verified-event",bytes(verified),{label:verified.event.event_type+" "+verified.event.event_id});
  const outcome=await transactions.acceptEvent(verified);
  need(["accepted","duplicate","conflict"].includes(outcome?.status),"INVALID_TRANSACTION_RESULT","Original event transaction must return accepted, duplicate or conflict");
  await save("event-outcome",bytes({eventKey:verified.eventKey,rawBodySHA256:verified.rawBodySHA256,outcome}));
  return outcome;
 }
 return {prepare,read,save,observation,receiveSnapshot,capture,inspect,createDraft,uploadInstructions,status,receiveSignedEvent,applySignedEvent,projectPaymentObservation,client,
  describe:()=>({programmeId,programmeVersion,scope:selectedScope,sourceScope,originalWorkspace:true})};
}
