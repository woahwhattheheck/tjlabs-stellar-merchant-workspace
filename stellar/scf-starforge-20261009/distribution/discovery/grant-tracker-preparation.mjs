// MIT. Complete source-selected customer preparation using the maintained OperatingPlan.
import { createGrantTracker, importGrantSource, inspectGrantTracker, previewGrantSource,
  exportGrantTracker, receiveGrantTracker, saveGrantRow, saveGrantPlanDetails,
  createGrantReturn, compareGrantReturn, decideGrantReturn, applyGrantReturn } from './grant-tracker.mjs';
import { operatingFileBytes } from './operating-plan.mjs';

const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
const json=value=>JSON.stringify(value,null,2)+'\n';
const copy=value=>JSON.parse(JSON.stringify(value));
const need=(ok,message)=>{if(!ok)throw Object.assign(new TypeError(message),{code:'GRANT_PREPARATION_SOURCE'});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stamp='2026-10-13T07:00:00.000Z';
async function hash(bytes){return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function decode64(text){
  need(typeof text==='string'&&text.length%4===0&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text),'Keep the complete canonical base64 source.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=[];
  for(let i=0;i<text.length;i+=4){
    const a=alphabet.indexOf(text[i]),b=alphabet.indexOf(text[i+1]),c=text[i+2]==='='?0:alphabet.indexOf(text[i+2]),d=text[i+3]==='='?0:alphabet.indexOf(text[i+3]);
    need(text[i+2]!=='='||b%16===0,'Noncanonical source base64.');need(text[i+3]!=='='||text[i+2]==='='||c%4===0,'Noncanonical source base64.');
    out.push((a<<2)|(b>>4));if(text[i+2]!=='=')out.push(((b&15)<<4)|(c>>2));if(text[i+3]!=='=')out.push(((c&3)<<6)|d);
  }
  return Uint8Array.from(out);
}
function unique(rows,key,title){const ids=new Set();for(const row of rows){need(row&&typeof row[key]==='string'&&row[key]&&!ids.has(row[key]),title+' must retain unique nonempty '+key+' values.');ids.add(row[key]);}return ids;}

/** Exact original SCFD source schema; no provider acquisition, prospect mutation or send. */
export async function prepareGrantCustomers(sourceText,{expectedSha256,savedAt=stamp}={}){
  need(typeof sourceText==='string'&&encoder.encode(sourceText).length<=32*1024*1024,'Keep the complete original preparation source within 32 MiB.');
  const sourceSha256=await hash(encoder.encode(sourceText));need(sourceSha256===expectedSha256,'The complete preparation source differs from its selected hash.');
  const pack=JSON.parse(sourceText);
  need(pack.schema==='commons.summitflow-prospect-preparation.v1'&&Array.isArray(pack.leads)&&Array.isArray(pack.files),'Choose the complete original SummitFlow preparation.');
  const leadIds=unique(pack.leads,'id','Original customers'),paths=unique(pack.files,'path','Original files');
  need(pack.leads.length&&pack.files.length,'Keep all original customer source records.');
  const bytes=new Map();
  for(const file of pack.files){
    need(/^(?:onboarding|source)\/[^/]+$/.test(file.path)&&!file.path.includes('..'),'Keep the original bounded source path.');
    need(Array.isArray(file.lead_ids)&&new Set(file.lead_ids).size===file.lead_ids.length&&file.lead_ids.every(id=>leadIds.has(id)),'Source customer associations are invalid.');
    const raw=decode64(file.content_base64);need(raw.length===file.bytes&&await hash(raw)===file.sha256,'Original file identity differs: '+file.path);bytes.set(file.path,raw);
  }
  const shared=pack.files.filter(f=>f.role==='customer_support'&&f.lead_ids.length===0);
  need(shared.length===1&&shared[0].path==='onboarding/START_HERE.md','The original shared customer guide must remain explicit.');
  const editions=Object.entries(pack.edition_selections??{}).map(([key,value])=>{
    need(value&&typeof value.id==='string'&&Array.isArray(value.lead_ids)&&value.lead_ids.length&&new Set(value.lead_ids).size===value.lead_ids.length&&value.lead_ids.every(id=>leadIds.has(id))&&Number.isSafeInteger(value.price_minor)&&value.price_minor>=0,'Keep the complete original commercial selection.');
    return {key,...copy(value)};
  });
  unique(editions,'id','Commercial editions');
  const selectedIds=editions.flatMap(e=>e.lead_ids);need(selectedIds.length===leadIds.size&&new Set(selectedIds).size===leadIds.size,'Every original customer must belong to exactly one original commercial selection.');
  const customers=[];
  for(const lead of pack.leads){
    const own=pack.files.filter(f=>f.role==='customer_support'&&f.lead_ids.includes(lead.id));
    need(own.length===4&&own.every(f=>f.lead_ids.length===1),'Customer preparation requires its four complete original files with exclusive ownership.');
    const tracker=own.filter(f=>/-summitflow-review\.csv$/.test(f.path)),history=own.filter(f=>/-funding-history\.json$/.test(f.path));
    need(tracker.length===1&&history.length===1&&own.some(f=>/-funding-history\.csv$/.test(f.path))&&own.some(f=>/-WALKTHROUGH\.md$/.test(f.path)),'Keep original tracker, both historical forms and walkthrough.');
    const historical=JSON.parse(decoder.decode(bytes.get(history[0].path)));
    need(Array.isArray(historical.records),'The complete original funding history must retain every record.');
    unique(historical.records,'record_id','Historical funding records');
    const preview=await previewGrantSource({bytes:bytes.get(tracker[0].path),format:'csv',encoding:'utf-8',headerRow:1});
    const missing=preview.unresolved.filter(x=>!['awarded','currency'].includes(x.field));
    need(!missing.length&&preview.headers.length===12,'The published twelve-column starter must retain every unique original heading.');
    need(preview.records.length-1===historical.records.length,'The starter and full historical companion must retain every original funding record.');
    let plan=await createGrantTracker({id:'tracker-'+lead.id,title:lead.organization+' — grant source review',
      customer:lead.organization,owner:'',purpose:'Review each original funding relationship against the organisation’s current award records before confirming obligations.',
      period:'Current-cycle review; historical periods remain in original supporting files',
      receiving:'Receive the complete plan and every source; record actual award terms, exact obligation dates and owners before accepting confirmed work.',
      notes:'Original preparation '+pack.operation_id+'. Current award status and completion are unconfirmed. No reminder or message is sent by this workspace.',savedAt});
    const selected=[...own,...shared],sourceMembers=[];
    for(let index=0;index<selected.length;index++){
      const file=selected[index],isTracker=file===tracker[0],isHistory=/-funding-history\.(csv|json)$/.test(file.path);
      const source={id:'original-'+(index+1),kind:isTracker?'tracker':isHistory?'award-history':'supporting',
        name:file.path.slice(file.path.lastIndexOf('/')+1),mediaType:file.mime_type,bytes:bytes.get(file.path),url:'',
        note:'Exact original customer preparation file '+file.path+'; source URLs and historical periods are retained inside the full file.',
        format:isTracker?'csv':'binary',...(isTracker?{encoding:'utf-8',headerRow:1,mapping:preview.mapping}:{})};
      plan=await importGrantSource(plan,source,{expectedRevision:plan.revisions.length,savedAt});
      sourceMembers.push({sourceId:source.id,path:file.path,bytes:file.bytes,sha256:file.sha256});
    }
    const view=await inspectGrantTracker(plan);
    need(view.rows.length===historical.records.length&&view.sources.length===5,'Complete source coverage differs.');
    for(const row of view.rows){
      need(row.record.disposition==='unresolved'&&!row.record.obligations.length&&!Object.keys(row.record.edits).length,'Customer starter must retain unresolved current work.');
      need(row.values.requested===''&&row.values.stage==='Researching'&&['loiDue','proposalDue','decisionExpected','awardStart','reportDue','owner','contact'].every(k=>row.values[k]===''),'Historical amounts or dates leaked into current starter fields.');
      need(row.values.awarded===null&&row.values.currency===null,'The published starter has no supplied current awarded amount or currency.');
    }
    const notes=view.rows.map(row=>row.values.notes);
    for(const record of historical.records)need(notes.filter(note=>typeof note==='string'&&note.includes(record.record_id)).length===1,'Each historical funding record must be identified in one original review note.');
    for(const source of view.sources){const member=sourceMembers.find(f=>f.sourceId===source.id);need(await hash(operatingFileBytes(source.original))===member.sha256,'Customer source changed during intake.');}
    const output=await exportGrantTracker(plan),reopened=await receiveGrantTracker(JSON.parse(output.files.find(f=>f.name==='grant-tracker.json').content));
    need(same(reopened.plan,plan),'Complete customer plan changed on independent receiving.');
    const cold=await exportGrantTracker(reopened.plan);need(same(cold.files,output.files),'Cold complete customer exports differ.');
    const replay=await receiveGrantTracker(reopened.plan,plan);need(same(replay.plan,plan),'Same-source receiving changed the original customer plan.');
    customers.push({leadId:lead.id,organization:lead.organization,selectionId:editions.find(e=>e.lead_ids.includes(lead.id)).id,
      sourceMembers,plan,files:output.files,counts:view.counts,historicalRecordIds:historical.records.map(r=>r.record_id)});
  }
  return {schema:'summitflow.grant-tracker-prepared-customers.v1',operationId:pack.operation_id,sourceSha256,savedAt,editions,
    internalFilesExcluded:pack.files.filter(f=>f.role!=='customer_support').map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256})),
    customers};
}

/** Labelled software receiving on a branch of an original customer plan; customer starters remain unchanged. */
export async function receiveGrantPreparation(prepared){
  need(prepared?.schema==='summitflow.grant-tracker-prepared-customers.v1'&&prepared.customers.length,'Choose a complete prepared customer set.');
  const original=prepared.customers.find(c=>c.leadId==='summitflow-aart')??prepared.customers[0],base=original.plan;
  const initial=await inspectGrantTracker(base),row=initial.rows[0],record=copy(row.record);
  record.disposition='candidate';record.reason='Labelled software receiving exercise: review the source as a candidate; no customer has confirmed a current award.';
  record.relationship={kind:'distinct',target:null,reason:'Exercise retains this exact physical source row independently.'};
  record.edits.owner={value:'Software receiving operator',reason:'Labelled receiving choice only; this is not the customer’s assigned owner.'};
  const returned=await saveGrantRow(base,row.id,record,{expectedRevision:base.revisions.length,savedAt:'2026-10-13T07:00:01.000Z'});
  const current=await saveGrantPlanDetails(base,{notes:base.revisions.at(-1).notes+'\nLabelled local receiving branch.'},{expectedRevision:base.revisions.length,savedAt:'2026-10-13T07:00:02.000Z'});
  let review=await createGrantReturn(current,returned,{id:'summitflow-source-receiving-return',reviewer:'Software receiving operator',
    notes:'Original-source software receiving only; no current customer award or obligation is asserted.',createdAt:'2026-10-13T07:00:03.000Z'});
  const first=await compareGrantReturn(review);
  for(const item of first.rows)review=await decideGrantReturn(review,item.key,{take:item.stepId===row.id?'incoming':'current',note:'Explicit software receiving choice; preserve complete current source history and the selected returned physical row.'});
  const result=await applyGrantReturn(review,{current,savedAt:'2026-10-13T07:00:04.000Z'});
  const received=await receiveGrantTracker(JSON.parse(json(result.plan))),view=await inspectGrantTracker(received.plan);
  need(view.rows.length===initial.rows.length&&same(view.rows.find(r=>r.id===row.id).record,record),'Returned physical review was not received exactly.');
  need(initial.sources.every((s,i)=>same(s.original,view.sources[i].original)),'Returned work changed an original source.');
  const replay=await applyGrantReturn(JSON.parse(json(result.review)),{current:received.plan,savedAt:'2026-10-13T07:00:05.000Z'});
  need(replay.alreadyPresent&&same(replay.plan,received.plan),'Completed original return did not replay.');
  let staleRejected=false;try{await applyGrantReturn(review,{current:returned,savedAt:'2026-10-13T07:00:04.000Z'});}catch(error){need(error.code==='RETURN_CURRENT_ADVANCED','Unexpected source return failure: '+error.message);staleRejected=true;}
  need(staleRejected,'The actual unrelated current branch must remain protected.');
  const complete=await exportGrantTracker(received.plan),cold=await exportGrantTracker((await receiveGrantTracker(JSON.parse(complete.files.find(f=>f.name==='grant-tracker.json').content))).plan);
  need(same(complete.files,cold.files),'Whole returned exports changed on cold receiving.');
  return {schema:'summitflow.grant-tracker-source-receiving.v1',label:'Software receiving exercise only; customer starters unchanged',
    sourceSha256:prepared.sourceSha256,customers:prepared.customers.map(c=>({leadId:c.leadId,selectionId:c.selectionId,counts:c.counts,
      sourceMembers:c.sourceMembers,files:c.files.map(f=>({name:f.name,mediaType:f.mediaType,bytes:encoder.encode(f.content).length}))})),
    exercise:{leadId:original.leadId,base,current,returned,review:result.review,plan:received.plan,files:complete.files,
      sameReturnReplayed:replay.alreadyPresent,staleDestinationRejected:staleRejected}};
}
