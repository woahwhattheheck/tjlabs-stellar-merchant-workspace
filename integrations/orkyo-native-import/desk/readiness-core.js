/* MIT — source-preserving Orkyo import/reconciliation desk */
function createOrkyoReadinessCore({codec,adapter,workbook}){
const SCHEMA="tjlabs.orkyo-readiness.v1",OP="ORKYO-PRODUCTION-IMPORT-WORKSHARE-20261015";
const clone=x=>JSON.parse(JSON.stringify(x)),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function need(v,m){if(!v)throw Error(m)}
function obj(v,m){need(v&&typeof v==="object"&&!Array.isArray(v),m);return v}
function str(v,m){need(typeof v==="string"&&v.trim(),m);return v}
function canonical(x){if(x===null||typeof x!=="object")return JSON.stringify(x);if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}"}
const sha=x=>codec.sha256(codec.utf8Encode(typeof x==="string"?x:canonical(x)));
function stamp(s){str(s,"Explicit time required");need(Number.isFinite(Date.parse(s)),"Valid time required");return s}
function evidence(x){obj(x,"Complete evidence required");str(x.text,"Retain the actual response, lookup or source explanation");if(x.url!=null)need(typeof x.url==="string","Evidence URL must be text");return clone(x)}
function artifact(x){obj(x,"Complete source required");str(x.filename,"Source filename required");need(typeof x.text==="string","Full original UTF-8 text required");if(x.originalFile){obj(x.originalFile,"Original binary file required");str(x.originalFile.filename,"Original filename required");str(x.originalFile.base64,"Complete original file bytes required");const b=codec.base64Decode(x.originalFile.base64);need(b.length===x.originalFile.bytes&&codec.sha256(b)===x.originalFile.sha256,"Original file bytes differ");}return {...clone(x),bytes:codec.utf8Encode(x.text).length,sha256:sha(x.text)}}
function create({id,title,at}){str(id,"Workspace ID required");str(title,"Workspace title required");return {schema:SCHEMA,operationId:OP,id,title,createdAt:stamp(at),sourceCommit:adapter.SOURCE_COMMIT,events:[],revision:0,head:sha({schema:SCHEMA,operationId:OP,id,title,createdAt:at,sourceCommit:adapter.SOURCE_COMMIT})}}
function baseState(){return {sources:[],batches:[],notes:[],audit:[]}}
function sourceBy(s,id){const v=s.sources.find(x=>x.id===id);need(v,"Source not found");return v}
function rowKey(sourceId,rowId){return sourceId+"::"+rowId}
function inspectSource(src){
 const a=src.editions[src.editions.length-1].artifact,c=src.context;
 try{
 if(src.kind==="workbook"){const sheets=JSON.parse(a.text);const plan=workbook.inspectSheets(sheets,c);if(!plan.jobs.length)throw Error("Workbook contains no admitted job rows; retain and correct the source.");return {ok:true,plan,rows:plan.jobs.map(j=>({id:"Jobs:"+j.row,original:clone(j.original),values:clone(j.original),nativePayload:j.payload,nativeDisposition:"create",jobKey:j.jobKey,issues:plan.issues.filter(z=>z.row===0||z.sheet==="Jobs"&&z.row===j.row||z.sheet==="Workstations"&&z.blocking),index:j.row})),summary:plan.summary}}
 const plan=adapter.inspect({kind:src.kind,format:src.format,sourceId:src.id,text:a.text,typeKey:c.typeKey||"",customFieldTypes:c.customFieldTypes||{}});
 if(!plan.rows.length)throw Error("Source contains no admitted data rows; retain and correct the source.");return {ok:true,plan,rows:plan.rows.map(r=>({...r,id:"row:"+r.index})),summary:plan.summary}
 }catch(e){return {ok:false,error:String(e.message||e),rows:[],summary:{records:0}}}
}
function preview(src,row,review){
 if(!review)return {...clone(row),review:null,ready:false};
 const values=clone(review.values==null?row.values:review.values);let nativePayload,issues,nativeDisposition,jobKey=row.jobKey;
 if(src.kind==="workbook"){
  need(Array.isArray(values),"Workbook row correction must be a full cell array");
  const initial=inspectSource(src);need(initial.ok,"Repair original workbook first");
  const sheets=clone(initial.plan.sheets),js=sheets.find(x=>x.name==="Jobs");js.rows[row.index-1]=values;
  const p=workbook.inspectSheets(sheets,src.context),j=p.jobs.find(x=>x.row===row.index);
  need(j,"Corrected job row is not admitted by the native parser");
  nativePayload=j.payload;jobKey=j.jobKey;nativeDisposition="create";
  issues=p.issues.filter(z=>z.row===0||z.sheet==="Jobs"&&z.row===row.index||z.sheet==="Workstations"&&z.blocking);
 }else{
  obj(values,"Corrected native row must be an object");
  const out=src.kind==="requests"?adapter.requestPreview(values):adapter.resourcePreview(values,src.context.typeKey,src.context.customFieldTypes||{});
  ({nativePayload,issues,nativeDisposition}=out);
 }
 const acknowledged=new Set(review.acknowledged||[]);
 const unacknowledged=issues.filter(x=>!acknowledged.has(x.code));
 const blocking=issues.filter(x=>x.blocking);
 return {...clone(row),values,nativePayload,issues,jobKey,nativeDisposition,review:clone(review),ready:review.action==="new"&&nativeDisposition==="create"&&!!nativePayload&&!blocking.length&&!unacknowledged.length,unacknowledged};
}
function fullRows(s,src){const q=inspectSource(src);return q.rows.map(r=>preview(src,r,src.reviews.find(x=>x.rowId===r.id)?.review))}
function statuses(s,sourceId,rowId){
 const hits=s.batches.filter(b=>b.sourceId===sourceId&&b.rows.some(r=>r.id===rowId)&&b.state!=="abandoned");
 const states=hits.map(b=>({batchId:b.id,state:b.state,outcome:b.outcomes.find(x=>x.rowId===rowId)||null}));
 const pending=states.some(x=>x.state==="prepared"||x.state==="attempted"&&!x.outcome);
 const done=states.find(x=>x.outcome&&["created","existing"].includes(x.outcome.status));
 return {pending,done:done||null,history:states};
}
function signature(src,row){return sha({tenant:src.context.tenant,kind:src.kind==="resources"?"resource":"request",payload:row.nativePayload})}
function safeContext(c,kind){obj(c,"Target context required");str(c.tenant,"Exact target tenant/environment label required");if(kind==="resources")str(c.typeKey,"Actual target resource type key required");if(kind==="workbook"){str(c.siteId,"Actual site ID required");str(c.typeKey,"Actual placeable type key required");need(Array.isArray(c.existingResources),"Complete existing-resource array required");need(c.existingComplete===true,"Complete target resource lookup required");evidence(c.lookupEvidence)}return clone(c)}
function prepareData(s,src,rowIds,at){
 need(Array.isArray(rowIds)&&rowIds.length&&new Set(rowIds).size===rowIds.length,"Distinct selected row IDs required");
 const all=fullRows(s,src),selected=rowIds.map(id=>{const r=all.find(z=>z.id===id);need(r,"Selected source row disappeared");need(r.ready,"Row "+id+" needs explicit new-create review and all blocking corrections");const st=statuses(s,src.id,id);need(!st.pending&&!st.done,"Row "+id+" is already prepared, unresolved or bound");return r});
 const collisions=[];
 for(const row of selected){
  const sig=signature(src,row);
  const prior=s.sources.flatMap(other=>fullRows(s,other).filter(r=>!(other.id===src.id&&r.id===row.id)&&signature(other,r)===sig).map(r=>({sourceId:other.id,rowId:r.id,stage:statuses(s,other.id,r.id)})));
  if(prior.length){need(row.review.distinctReason&&row.review.distinctReason.trim(),"Identical native payload occurs elsewhere; explain why this row is a separate legitimate create");collisions.push({rowId:row.id,distinctReason:row.review.distinctReason,otherRows:prior.map(x=>({sourceId:x.sourceId,rowId:x.rowId}))})}
 }
 let file;
 if(src.kind==="workbook"){
  const q=inspectSource(src);need(q.ok,"Workbook parse failed");
  const sheets=clone(q.plan.sheets),jobs=sheets.find(x=>x.name==="Jobs"),selectedByIndex=new Map(selected.map(r=>[r.index,r]));
  jobs.rows=jobs.rows.flatMap((r,i)=>i<5?[r]:selectedByIndex.has(i+1)?[selectedByIndex.get(i+1).values]:[]);
  const finalPlan=workbook.inspectSheets(sheets,src.context);
  need(!finalPlan.issues.some(x=>x.blocking),"Selected workbook still has blocking native issues");
  need(finalPlan.jobs.length===selected.length,"Selected workbook changed its job population");
  file={filename:"Orkyo_Reviewed_Jobs.xlsx",mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",sheets,preview:finalPlan};
 }else{
  const values=selected.map(r=>r.values);
  const text=src.format==="json"?adapter.exportResourceJSON(values,src.context.typeKey,at):adapter.encodeCSV(values);
  const check=adapter.inspect({kind:src.kind,format:src.format,sourceId:"prepared",text,typeKey:src.context.typeKey||"",customFieldTypes:src.context.customFieldTypes||{}});
  need(check.rows.length===selected.length,"Export changed row count");
  check.rows.forEach((r,i)=>need(canonical(r.nativePayload)===canonical(selected[i].nativePayload),"Native export roundtrip changed payload on row "+selected[i].id));
  file={filename:"Orkyo_Reviewed_"+src.kind+"."+src.format,mime:src.format==="json"?"application/json":"text/csv",text,bytes:codec.utf8Encode(text).length,sha256:sha(text)};
 }
 return {rows:clone(selected),file,collisions,sourceEdition:src.editions.length,sourceSha256:src.editions.at(-1).artifact.sha256,context:clone(src.context)};
}
function reduce(s,event){
 const p=event.payload,t=event.type;obj(p,"Event payload required");
 if(t==="intake"){
  str(p.sourceId,"Source ID required");need(!s.sources.some(x=>x.id===p.sourceId),"Source ID already exists");
  need(["requests","resources","workbook"].includes(p.kind),"Unknown import kind");
  need(p.kind==="workbook"?p.format==="sheets-json":["csv","json"].includes(p.format),"Unsupported source format");
  need(!(p.kind==="requests"&&p.format!=="csv"),"Request page accepts CSV");
  const a=artifact(p.artifact),context=safeContext(p.context,p.kind);
  need(!s.sources.some(x=>x.kind===p.kind&&x.context.tenant===context.tenant&&x.editions.some(e=>e.artifact.sha256===a.sha256)),"Identical original is already retained; continue its existing rows");
  s.sources.push({id:p.sourceId,kind:p.kind,format:p.format,context,editions:[{eventId:event.id,at:event.at,artifact:a,reason:"Original intake"}],reviews:[]});
 }else if(t==="correct-source"){
  const src=sourceBy(s,p.sourceId);need(!s.batches.some(b=>b.sourceId===src.id&&b.state!=="abandoned"),"Source has a frozen batch; reconcile it and preserve its source before a new intake");
  str(p.reason,"Reason for complete-source correction required");const a=artifact(p.artifact);
  src.editions.push({eventId:event.id,at:event.at,artifact:a,reason:p.reason,previousReviews:clone(src.reviews)});src.reviews=[];
  if(p.context)src.context=safeContext(p.context,src.kind);
 }else if(t==="review"){
  const src=sourceBy(s,p.sourceId),row=inspectSource(src).rows.find(x=>x.id===p.rowId);need(row,"Row not found");
  const st=statuses(s,src.id,row.id);need(!st.pending&&!st.done,"Frozen, unresolved or completed row cannot be redefined");
  obj(p.review,"Full review required");const r=clone(p.review);
  need(["new","bind","exclude"].includes(r.action),"Choose new, bind or exclude");
  str(r.reason,"Review reason required");str(r.reviewer,"Named reviewer required");
  need(Array.isArray(r.acknowledged)&&r.acknowledged.every(x=>typeof x==="string"),"Explicit issue acknowledgement array required");
  if(r.action==="bind"){str(r.targetId,"Actual existing target ID required");r.evidence=evidence(r.evidence)}
  if(r.action==="new"){need(!r.targetId,"New-create review cannot contain existing target ID");preview(src,row,r)}
  const old=src.reviews.findIndex(x=>x.rowId===row.id);const item={rowId:row.id,review:r,eventId:event.id,at:event.at};
  if(old<0)src.reviews.push(item);else src.reviews[old]=item;
 }else if(t==="prepare"){
  const src=sourceBy(s,p.sourceId);str(p.batchId,"Batch ID required");need(!s.batches.some(x=>x.id===p.batchId),"Batch ID exists");
  const data=prepareData(s,src,p.rowIds,event.at);
  s.batches.push({id:p.batchId,sourceId:src.id,createdAt:event.at,eventId:event.id,state:"prepared",...data,outcomes:[],attempt:null});
 }else if(t==="attempt"){
  const b=s.batches.find(x=>x.id===p.batchId);need(b&&b.state==="prepared","Only a prepared batch can be marked attempted");
  need(p.confirmTenant===b.context.tenant,"Type the exact target tenant label");str(p.operator,"Actual importing operator required");str(p.route,"Actual Orkyo page/workbook route required");
  b.state="attempted";b.attempt={eventId:event.id,at:event.at,operator:p.operator,route:p.route,confirmTenant:p.confirmTenant,details:p.details||""};
 }else if(t==="resolve"){
  const b=s.batches.find(x=>x.id===p.batchId);need(b&&b.state==="attempted","Only an attempted batch has outcomes");
  const row=b.rows.find(x=>x.id===p.rowId);need(row,"Batch row not found");
  need(!b.outcomes.some(x=>x.rowId===p.rowId),"Outcome already resolved; retain original target binding");
  need(["created","existing","rejected","not-attempted"].includes(p.status),"Choose a resolved outcome");
  str(p.reason,"Outcome explanation required");str(p.reviewer,"Outcome reviewer required");const ev=evidence(p.evidence);
  if(["created","existing"].includes(p.status))str(p.targetId,"Actual returned or lookup target ID required");else need(!p.targetId,"Rejected/unattempted row cannot have a target ID");
  if(p.status==="created")need(!s.batches.some(x=>x.outcomes.some(o=>o.targetId===p.targetId&&o.status==="created"&&x.context.tenant===b.context.tenant)),"This created target ID is already bound; investigate duplicate row attribution");
  b.outcomes.push({eventId:event.id,at:event.at,rowId:p.rowId,status:p.status,targetId:p.targetId||null,reason:p.reason,reviewer:p.reviewer,evidence:ev});
 }else if(t==="abandon"){
  const b=s.batches.find(x=>x.id===p.batchId);need(b&&b.state==="prepared","Only an unattempted prepared batch can be abandoned");
  str(p.reason,"Abandon reason required");b.state="abandoned";b.abandoned={eventId:event.id,at:event.at,reason:p.reason};
 }else if(t==="note"){
  str(p.title,"Note title required");str(p.text,"Complete note required");s.notes.push({...clone(p),eventId:event.id,at:event.at});
 }else throw Error("Unknown event type: "+t);
 s.audit.push({id:event.id,type:event.type,at:event.at});
 return s;
}
function reopen(input){
 const w=clone(input);obj(w,"Workspace required");need(w.schema===SCHEMA&&w.operationId===OP,"Foreign operation/workspace schema");
 const empty=create({id:w.id,title:w.title,at:w.createdAt});need(w.sourceCommit===adapter.SOURCE_COMMIT,"Native source version differs");
 need(Array.isArray(w.events)&&w.revision===w.events.length,"Complete revision/event history required");
 let head=empty.head,s=baseState();const ids=new Set();
 for(let i=0;i<w.events.length;i++){
  const e=w.events[i];need(e.seq===i+1&&e.previous===head,"Event chain differs");str(e.id,"Event ID required");need(!ids.has(e.id),"Repeated event ID");ids.add(e.id);stamp(e.at);
  const body={id:e.id,seq:e.seq,previous:e.previous,type:e.type,at:e.at,payload:e.payload};need(e.sha256===sha(body),"Event bytes differ");s=reduce(s,e);head=e.sha256;
 }
 need(w.head===head,"Workspace head differs");return {workspace:w,state:s};
}
function command(workspace,{id,expectedHead,type,at,payload}){
 const {workspace:w,state:s}=reopen(workspace);need(expectedHead===w.head,"Workspace changed; preserve this proposal and reopen the selected copy");
 str(id,"Unique command ID required");const old=w.events.find(x=>x.id===id);
 if(old){need(old.type===type&&old.at===at&&canonical(old.payload)===canonical(payload),"Command ID already has different content");return w}
 const e={id,seq:w.events.length+1,previous:w.head,type,at:stamp(at),payload:clone(payload)};e.sha256=sha(e);
 reduce(s,e);w.events.push(e);w.revision=w.events.length;w.head=e.sha256;return w;
}
function view(w){
 const {state:s}=reopen(w);
 return {...s,sources:s.sources.map(src=>{const q=inspectSource(src);return {...src,inspection:q,rows:fullRows(s,src).map(row=>({...row,status:statuses(s,src.id,row.id),signature:signature(src,row)}))};})};
}
function csv(rows,headers){const cell=v=>{let t=v==null?"":typeof v==="object"?JSON.stringify(v):String(v);if(/^[=+\-@\t\r]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"'};return [headers.map(cell).join(","),...rows.map(r=>headers.map(h=>cell(r[h])).join(","))].join("\r\n")+"\r\n"}
function exports(w){
 const v=view(w),rows=v.sources.flatMap(s=>s.rows.map(r=>({sourceId:s.id,rowId:r.id,kind:s.kind,tenant:s.context.tenant,name:r.nativePayload?.name||"",review:r.review?.action||"unreviewed",ready:r.ready,pending:r.status.pending,targetId:r.status.done?.outcome.targetId||r.review?.targetId||"",issues:r.issues.map(x=>x.code).join("; "),nativePayload:r.nativePayload,original:r.original,corrected:r.values})));
 const outcomes=v.batches.flatMap(b=>b.rows.map(r=>({batchId:b.id,sourceId:b.sourceId,rowId:r.id,batchState:b.state,outcome:b.outcomes.find(o=>o.rowId===r.id)?.status||(b.state==="attempted"?"unresolved":"unattempted"),targetId:b.outcomes.find(o=>o.rowId===r.id)?.targetId||"",evidence:b.outcomes.find(o=>o.rowId===r.id)?.evidence||null,payload:r.nativePayload})));
 return {workspace:JSON.stringify(w,null,2)+"\n",readinessCSV:csv(rows,["sourceId","rowId","kind","tenant","name","review","ready","pending","targetId","issues","nativePayload","original","corrected"]),outcomesCSV:csv(outcomes,["batchId","sourceId","rowId","batchState","outcome","targetId","evidence","payload"])};
}
function report(w){
 const v=view(w),h=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 return '<!doctype html><meta charset="utf-8"><title>'+h(w.title)+'</title><style>body{font:15px system-ui;max-width:1180px;margin:32px auto;padding:20px;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere}details{margin:12px 0}</style><h1>'+h(w.title)+'</h1><p>Orkyo import readiness and actual-outcome reconciliation. Revision '+w.revision+' · '+h(w.head)+'</p><p>Each prepared file creates records through the selected native Orkyo route. Resolve every uncertain result before preparing a remaining batch.</p>'+
 v.sources.map(s=>'<section><h2>'+h(s.id)+' — '+h(s.kind)+'</h2><p>Tenant '+h(s.context.tenant)+'; '+s.editions.length+' retained source editions.</p>'+(!s.inspection.ok?'<p>Source needs repair: '+h(s.inspection.error)+'</p>':'')+'<table><thead><tr><th>Row</th><th>Name</th><th>Review</th><th>Import state</th><th>Attention</th></tr></thead><tbody>'+s.rows.map(r=>'<tr><td>'+h(r.id)+'</td><td>'+h(r.nativePayload?.name)+'</td><td>'+h(r.review?.action||"Unreviewed")+'</td><td>'+h(r.status.done?.outcome.targetId||r.review?.targetId||(r.status.pending?"Prepared / unresolved":r.ready?"Ready":"Review"))+'</td><td>'+h(r.issues.map(x=>x.message).join(" "))+'</td></tr>').join("")+'</tbody></table><details><summary>Full sources, corrections, payloads and review reasons</summary><pre>'+h(JSON.stringify(s,null,2))+'</pre></details></section>').join("")+'<h2>Frozen batches and outcomes</h2>'+v.batches.map(b=>'<details open><summary>'+h(b.id)+' · '+h(b.state)+' · '+b.outcomes.length+'/'+b.rows.length+' outcomes</summary><pre>'+h(JSON.stringify(b,null,2))+'</pre></details>').join("")+'<h2>Retained notes</h2><pre>'+h(JSON.stringify(v.notes,null,2))+'</pre><h2>Event history</h2><pre>'+h(JSON.stringify(w.events,null,2))+'</pre>';
}
return {SCHEMA,OP,create,reopen,command,view,exports,report,canonical,sha,inspectSource,preview};
}
