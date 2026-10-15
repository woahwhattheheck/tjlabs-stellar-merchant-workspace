/* Host-owned integration bridge. No built-in credentials, endpoints or SDK prop assumptions. */
function createImportHostBridge({core,codec}){
 const need=(v,m)=>{if(!v)throw Error(m);},clone=v=>JSON.parse(JSON.stringify(v)),hash=t=>codec.sha256Bytes(codec.utf8Encode(t));
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function callback({rows,scope,externalImportId,sourceId,importId,label,name="filio-callback.json",note=""}){
  need(Array.isArray(rows),"Actual callback rows must be an array");const text=JSON.stringify(rows);need(typeof text==="string","Callback cannot serialize");return capture(text,{scope,externalImportId,sourceId,importId,label,name,note,kind:"callback"});
 }
 function capture(text,i){const w=core.create({id:"bridge-validation",label:"Bridge validation",createdAt:"2000-01-01T00:00:00Z"}),source={sourceId:i.sourceId,name:i.name,text,role:"import"},imp={importId:i.importId,label:i.label,sourceId:i.sourceId,kind:i.kind,scope:i.scope,externalImportId:i.externalImportId,note:i.note};
  let a=core.apply(w,{id:"source",type:"source.add",actor:"Host-owned bridge",at:"2000-01-01T00:00:00Z",input:source}).workspace;a=core.apply(a,{id:"import",type:"import.capture",actor:"Host-owned bridge",at:"2000-01-01T00:00:00Z",input:imp}).workspace;core.inspectImport(a,i.importId);return {source,import:imp,sourceSha256:hash(text)};
 }
 async function webhook({rawBody,headers,verifyWebhook,...i}){
  need(typeof rawBody==="string"&&typeof verifyWebhook==="function","Exact UTF-8 raw body and installed provider verifier required");
  const verified=await verifyWebhook({rawBody,headers:clone(headers||{})});need(verified&&verified.verified===true&&typeof verified.reference==="string"&&verified.reference,"Webhook verifier did not establish authenticity");
  const c=capture(rawBody,{...i,name:i.name||"filio-webhook.json",kind:"webhook"});return {...c,verification:{reference:verified.reference,rawSha256:c.sourceSha256}};
 }
 async function execute({workspace,batchId,batchSha256,attemptId,providerReference,host,journal,clock}){
  core.validateWorkspace(workspace);const batch=workspace.batches.find(x=>x.id===batchId);need(batch&&batch.sha256===batchSha256,"Select exact reviewed batch");const {rows:preparedRows,scope:preparedScope,importId:preparedImport,importSha256:preparedImportHash,mappingSha256:preparedMappingHash,findings:preparedFindings,...plan}=batch.body;const current=core.previewBatch(workspace,plan);need(current.ready&&current.sha256===batchSha256,"Prepared batch no longer agrees with retained import history; review a new plan");need(typeof attemptId==="string"&&attemptId&&typeof providerReference==="string"&&providerReference,"Attempt and host reference required");
  need(host&&typeof host.writeRow==="function"&&typeof host.readRecords==="function","Installed host write/read functions required");need(journal&&typeof journal.claim==="function"&&typeof journal.settle==="function","Atomic durable journal claim/settle required");need(typeof clock==="function","Host clock required");
  const rows=[],originalOutcomes=[];let observedAt=clock();
  for(const row of batch.body.rows){
   if(row.action==="skip"){rows.push({row:row.row,status:"not_attempted",targetId:null,error:null});continue;}
   const binding={workspaceId:workspace.id,batchId,batchSha256,scope:clone(batch.body.scope),row:row.row},key=hash(JSON.stringify(binding)),claim=await journal.claim({key,binding:clone(binding)});
   need(claim&&["claimed","settled","inflight"].includes(claim.state),"Journal claim returned invalid state");if(claim.binding)need(same(claim.binding,binding),"Journal binding differs");
   let outcome;
   if(claim.state==="settled"){need(claim.outcome,"Settled journal record lacks outcome");outcome=clone(claim.outcome);}
   else if(claim.state==="inflight")outcome={status:"uncertain",targetId:null,error:"Prior claim has no retained terminal outcome; no automatic write retry."};
   else{
    try{outcome=await host.writeRow({idempotencyKey:key,binding:clone(binding),action:row.action,targetId:row.targetId,key:clone(row.key),fields:clone(row.fields),sourceRef:clone(row.sourceRef)});}
    catch(e){outcome={status:"uncertain",targetId:null,error:String(e?.message||e)};}
    need(outcome&&["accepted","rejected","uncertain","not_attempted"].includes(outcome.status),"Host returned an invalid outcome; claimed row must be reconciled before retry");
    if(outcome.status==="accepted")need(typeof outcome.targetId==="string"&&outcome.targetId,"Accepted host outcome needs actual record ID");else need(outcome.targetId===null||typeof outcome.targetId==="string","Host target ID must be text or null");
    originalOutcomes.push({row:row.row,idempotencyKey:key,outcome:clone(outcome)});
    try{await journal.settle({key,binding:clone(binding),outcome:clone(outcome)});}
    catch(e){outcome={status:"uncertain",targetId:outcome.targetId||null,error:"Host outcome could not be retained by journal: "+String(e?.message||e),observedOutcome:clone(outcome)};}
   }
   need(outcome&&["accepted","rejected","uncertain","not_attempted"].includes(outcome.status),"Invalid retained journal outcome");
   rows.push({row:row.row,status:outcome.status,targetId:outcome.targetId||null,error:outcome.error||null});observedAt=clock();
  }
  const receipt={schema:"tjlabs.import-host-result.v1",batchId,batchSha256,scope:clone(batch.body.scope),attemptId,observedAt,providerReference,rows};
  const requestedIds=[...new Set(rows.filter(r=>r.status==="accepted").map(r=>r.targetId))];let readback=null,readbackError=null;
  try{
   const result=await host.readRecords({scope:clone(batch.body.scope),ids:[...requestedIds]});need(result&&Array.isArray(result.records),"Host readback requires complete selected records");
   const records=result.records.map(r=>{need(typeof r.id==="string"&&r.id&&typeof r.valuesText==="string","Host readback must retain actual ID and original JSON object text");return '{"id":'+JSON.stringify(r.id)+',"values":'+r.valuesText+'}';});
   const prefix={schema:"tjlabs.import-host-readback.v1",scope:clone(batch.body.scope),observedAt:clock(),coverage:{kind:"selected_records",requestedIds}};
   readback=JSON.stringify(prefix).slice(0,-1)+',"records":['+records.join(",")+']}';
  }catch(e){readbackError=String(e?.message||e);}
  return {receipt,receiptText:JSON.stringify(receipt,null,2)+"\n",readbackText:readback,readbackError,originalOutcomes,limitations:["Host hooks and durable atomic journal are supplied by the installed application.","No automatic retry of an inflight or uncertain row.","Receipt acceptance is separate from selected-record readback; readback failure remains explicit."]};
 }
 return {captureCallback:callback,captureWebhook:webhook,executeBatch:execute};
}
if(typeof module!=="undefined"&&module.exports)module.exports={createImportHostBridge};
