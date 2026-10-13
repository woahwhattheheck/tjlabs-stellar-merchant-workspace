// MIT. Source-bound customer project returns in the original Zotero record history.
import {SCHEMA,LIMIT,need,plain,clone,json,parse,sha256,id,requestId,revision,text,now,key} from './contracts.mjs';
import {parseTransfer} from './transfer.mjs';
import {snapshotObjectReferences,validateSnapshot} from './store.mjs';
export const PROJECT_RETURN_SCHEMA='stellar-forge.zotero-project-return.v1';
const digest=value=>sha256(json(value));
const same=(a,b)=>digest(a)===digest(b);
const cell=(present,value=null)=>({present,value:present?clone(value):null});
const absent=()=>cell(false);
const decision=()=>({selected:false,classification:'unreviewed',note:''});
const selected=(value,path)=>{let current=value;for(const part of path){if(!plain(current)||!Object.hasOwn(current,part))return absent();current=current[part];}return cell(true,current);};
const kinds=['project','edition','profile'];
const ref=(kind,value)=>({record:{kind,id:value.id,revision:value.revision},value:clone(value)});
const issue=(code,message)=>({code,message});
function projectShape(value){
 need(plain(value)&&value.schema===SCHEMA.project,'ZOTERO_RETURN_PROJECT_INVALID');id(value.id);revision(value.revision);
 need(typeof value.editionId==='string'&&typeof value.libraryIdentity==='string'&&plain(value.scope)&&plain(value.decisions)&&Array.isArray(value.findings),'ZOTERO_RETURN_PROJECT_INVALID');
 need(Object.keys(value.decisions).length<=LIMIT.items&&value.findings.length<=1000,'ZOTERO_RETURN_PROJECT_LIMIT');
 text(value.title,'ZOTERO_PROJECT_TITLE_REQUIRED',240);text(value.description,'ZOTERO_PROJECT_DESCRIPTION_INVALID',20000,true);
 need(Array.isArray(value.scope.collectionKeys)&&value.scope.collectionKeys.length<=1000&&typeof value.scope.includeDescendants==='boolean','ZOTERO_SCOPE_INVALID');value.scope.collectionKeys.forEach(key);
 for(const [item,d]of Object.entries(value.decisions)){key(item);need(plain(d)&&typeof d.selected==='boolean'&&['unreviewed','supports','contradicts','background'].includes(d.classification),'ZOTERO_DECISION_INVALID');text(d.note,'ZOTERO_DECISION_NOTE_INVALID',100000,true);}
 for(const f of value.findings){need(plain(f),'ZOTERO_FINDING_INVALID');id(f.id);text(f.title,'ZOTERO_FINDING_TITLE_REQUIRED',240);text(f.text,'ZOTERO_FINDING_TEXT_REQUIRED',100000);need(Array.isArray(f.itemKeys)&&f.itemKeys.length>0,'ZOTERO_FINDING_SOURCE_REQUIRED');f.itemKeys.forEach(key);}
 return value;
}
function returnedSelection(prepared,projectId){
 const {packet}=prepared;need(!packet.selectedProjectId||packet.selectedProjectId===projectId,'ZOTERO_RETURN_PROJECT_SELECTION_CHANGED');
 const rows=packet.state.records.filter(row=>row.kind==='project'&&row.id===projectId);
 need(rows.length,'ZOTERO_RETURN_PROJECT_NOT_FOUND');
 const history=rows.map(row=>({value:projectShape(parse(Buffer.from(row.payload))),sha256:row.sha256}));
 const returned=history.at(-1),editionRows=packet.state.records.filter(row=>row.kind==='edition'&&row.id===returned.value.editionId);
 need(editionRows.length,'ZOTERO_RETURN_EDITION_MISSING');
 const editionRecord=parse(Buffer.from(editionRows.at(-1).payload));
 const body=prepared.objects.get(editionRecord.body?.sha256);need(body,'ZOTERO_RETURN_EDITION_MISSING');
 const edition=parse(body);need(edition.schema===SCHEMA.edition&&edition.id===returned.value.editionId&&edition.libraryIdentity===returned.value.libraryIdentity,'ZOTERO_RETURN_EDITION_CHANGED');
 return {history,returned,editionRecord,edition};
}
export function compareProjectFields(base,local,returned,choices={}){
 projectShape(base);projectShape(local);projectShape(returned);need(plain(choices),'ZOTERO_RETURN_CHOICES_INVALID');
 const merged={schema:SCHEMA.project,title:local.title,description:local.description,editionId:local.editionId,
  libraryIdentity:local.libraryIdentity,scope:clone(local.scope),decisions:clone(local.decisions),findings:[]};
 const rows=[],used=new Set();
 function choose(path,label,b,l,r){
  const rowId='field:'+sha256(json(path));
  const automatic=same(l,r)?'local':same(l,b)?'returned':same(r,b)?'local':null;
  const changed=!same(b,l)||!same(b,r),choice=Object.hasOwn(choices,rowId)?choices[rowId]:null;
  if(choice!==null){need(['base','local','returned'].includes(choice),'ZOTERO_RETURN_CHOICE_INVALID');need(changed,'ZOTERO_RETURN_CHOICE_NOT_IN_PREVIEW');used.add(rowId);}
  const chosen=choice??automatic;
  const value=clone(({base:b,local:l,returned:r})[chosen??'local']);
  if(changed)rows.push({id:rowId,path,label,base:b,local:l,returned:r,conflict:automatic===null,automatic,choice,selected:value});
  return value;
 }
 for(const name of ['title','description'])merged[name]=choose([name],name,selected(base,[name]),selected(local,[name]),selected(returned,[name])).value;
 for(const name of ['collectionKeys','includeDescendants'])merged.scope[name]=choose(['scope',name],'Collection scope / '+name,selected(base,['scope',name]),selected(local,['scope',name]),selected(returned,['scope',name])).value;
 const itemKeys=[...new Set([...Object.keys(base.decisions),...Object.keys(local.decisions),...Object.keys(returned.decisions)])].sort();
 for(const key of itemKeys){
  const b=base.decisions[key]??decision(),l=local.decisions[key]??decision(),r=returned.decisions[key]??decision(),value={};
  for(const field of ['selected','classification','note'])value[field]=choose(['decisions',key,field],key+' / '+field,cell(true,b[field]),cell(true,l[field]),cell(true,r[field])).value;
  if(Object.hasOwn(local.decisions,key)||Object.hasOwn(returned.decisions,key)||!same(value,decision()))merged.decisions[key]=value;
 }
 const byId=value=>new Map(value.findings.map(f=>[id(f.id),f]));
 const b=byId(base),l=byId(local),r=byId(returned);
 need(b.size===base.findings.length&&l.size===local.findings.length&&r.size===returned.findings.length,'ZOTERO_FINDING_DUPLICATE');
 const findingIds=[...new Set([...local.findings.map(f=>f.id),...returned.findings.map(f=>f.id),...base.findings.map(f=>f.id)])];
 for(const key of findingIds){
  if(b.has(key)&&l.has(key)&&r.has(key)){
   const value={id:key};
   for(const field of ['title','text','itemKeys'])value[field]=choose(['findings',key,field],'Finding '+key+' / '+field,selected(b.get(key),[field]),selected(l.get(key),[field]),selected(r.get(key),[field])).value;
   merged.findings.push(value);
  }else{
   const value=choose(['findings',key],'Finding '+key,b.has(key)?cell(true,b.get(key)):absent(),l.has(key)?cell(true,l.get(key)):absent(),r.has(key)?cell(true,r.get(key)):absent());
   if(value.present)merged.findings.push(value.value);
  }
 }
 const ordered=choose(['findingOrder'],'Finding order',cell(true,base.findings.map(f=>f.id)),cell(true,local.findings.map(f=>f.id)),cell(true,returned.findings.map(f=>f.id))).value;
 const values=new Map(merged.findings.map(f=>[f.id,f])),order=[...new Set([...ordered,...merged.findings.map(f=>f.id)])];
 merged.findings=order.filter(key=>values.has(key)).map(key=>values.get(key));
 need(Object.keys(choices).every(key=>used.has(key)),'ZOTERO_RETURN_CHOICE_NOT_IN_PREVIEW');
 return {merged,rows,summary:{changes:rows.length,conflicts:rows.filter(r=>r.conflict).length,
  unresolved:rows.filter(r=>r.conflict&&!r.choice).length,automatic:rows.filter(r=>!r.conflict&&!r.choice).length,choices:used.size}};
}
export function createProjectReturns({store,validateProject}){
 const record=idValue=>store.get('project-return',id(idValue));
 function listReturns(){
  const result=[];let offset=0;
  for(;;){const page=store.list('project-return',{offset,limit:1000});result.push(...page.rows);if(page.next===null)break;offset=page.next;}
  return result;
 }
 function resolve(result){
  return {...result,...(result.record?{value:store.get(result.record.kind,result.record.id,result.record.revision)}:{})};
 }
 async function prepare(input,op){
  const projectId=id(input.projectId),projectRevision=revision(input.projectRevision),operation=requestId(op);
  const replay=store.actionResult(operation,'project.return.prepare',{projectId,projectRevision});if(replay)return resolve(replay);
  const project=store.get('project',projectId,projectRevision),state=store.snapshot();
  const projects=state.records.filter(r=>r.kind==='project'&&r.id===projectId&&r.revision<=projectRevision);
  const editions=new Set(projects.map(r=>parse(Buffer.from(r.payload)).editionId));
  const editionRows=state.records.filter(r=>r.kind==='edition'&&editions.has(r.id));
  const profiles=new Set(editionRows.map(r=>parse(Buffer.from(r.payload)).profileId).filter(Boolean));
  const records=[...projects,...editionRows,...state.records.filter(r=>r.kind==='profile'&&profiles.has(r.id))]
   .sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)||a.revision-b.revision);
  const headMap=new Map();for(const row of records)headMap.set(row.kind+'\0'+row.id,{kind:row.kind,id:row.id,revision:row.revision});
  const selectedState={schema:state.schema,identity:state.identity,records,heads:[...headMap.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id)),requests:[]};
  validateSnapshot(selectedState);const objects=[];
  for(const reference of snapshotObjectReferences(selectedState)){const bytes=await store.objectBytes(reference);objects.push({...reference,contentBase64:bytes.toString('base64')});}
  const packet={schema:SCHEMA.portable,purpose:'project-return',selectedProjectId:projectId,requestId:operation,
   exportedAt:project.updatedAt,stateSha256:digest(selectedState),state:selectedState,objects,research:[],
   credentialPolicy:'Source reference names and authored project history are retained. Credential values are absent.'};
  const bytes=json(packet);need(bytes.length<=LIMIT.transfer,'ZOTERO_TRANSFER_LIMIT');
  const object=await store.putObject(bytes);
  return resolve(store.action(operation,'project.return.prepare',{projectId,projectRevision},()=>{
   const value=store.put('project-delivery','project-delivery:'+operation,0,{schema:'stellar-forge.zotero-project-delivery.v1',projectId,projectRevision,
    projectSha256:digest(project),editionId:project.editionId,libraryIdentity:project.libraryIdentity,object,filename:'zotero-project-'+operation+'.json',preparedAt:now()});
   return {record:{kind:'project-delivery',id:value.id,revision:value.revision}};
  }));
 }
 async function importReturned(input,op){
  const projectId=id(input.projectId),bytes=Buffer.from(input.bytes),operation=requestId(op);
  const inputSource={sha256:sha256(bytes),bytes:bytes.length},replay=store.actionResult(operation,'project.return.import',{projectId,source:inputSource});if(replay)return resolve(replay);
  const prepared=parseTransfer(bytes),local=projectShape(store.get('project',projectId)),selected=returnedSelection(prepared,projectId);
  need(prepared.packet.state.identity.workspaceId===store.identity.workspaceId,'ZOTERO_RETURN_WORKSPACE_CHANGED');
  need(selected.returned.value.libraryIdentity===local.libraryIdentity,'ZOTERO_RETURN_LIBRARY_CHANGED');
  const source=await store.putObject(bytes);
  return resolve(store.action(operation,'project.return.import',{projectId,source},()=>{
   const value=store.put('project-return','project-return:'+operation,0,{schema:PROJECT_RETURN_SCHEMA,projectId,
    source,packetSha256:prepared.sha256,returned:{revision:selected.returned.value.revision,sha256:selected.returned.sha256},
    editionId:selected.returned.value.editionId,libraryIdentity:selected.returned.value.libraryIdentity,
    importedAt:now(),status:'REVIEW_REQUIRED',review:null,result:null});
   return {record:{kind:'project-return',id:value.id,revision:value.revision}};
  }));
 }
 async function calculate(current,suppliedChoices=null){
  const prepared=parseTransfer(await store.objectBytes(current.source)),selected=returnedSelection(prepared,current.projectId);
  need(prepared.sha256===current.packetSha256&&same(current.returned,{revision:selected.returned.value.revision,sha256:selected.returned.sha256}),'ZOTERO_RETURN_SOURCE_CHANGED');
  const local=projectShape(store.get('project',current.projectId)),localSha=digest(local),candidates=new Map();
  const stale=!!current.review&&current.review.projectSha256!==localSha;
  const choices=suppliedChoices??(stale?{}:current.review?.choices??{});
  for(const p of store.history('project',current.projectId))candidates.set(digest(p),{value:p,via:{kind:'project',id:p.id,revision:p.revision}});
  for(const prior of listReturns()){
   if(prior.projectId!==current.projectId||prior.status!=='APPLIED'||!prior.acceptedAncestor)continue;
   const ancestor=prior.acceptedAncestor;
   need(digest(ancestor.project)===ancestor.sha256,'ZOTERO_RETURN_ANCESTRY_CHANGED');
   if(!candidates.has(ancestor.sha256))candidates.set(ancestor.sha256,{value:ancestor.project,via:{kind:'project-return',id:prior.id,revision:prior.revision}});
  }
  let shared=null;for(const p of selected.history){if(candidates.has(p.sha256))shared={...candidates.get(p.sha256),sha256:p.sha256};}
  const issues=[],returned=selected.returned.value;
  if(!shared)issues.push(issue('ZOTERO_RETURN_NO_COMMON_ANCESTOR','The returned project has no exact saved project ancestor in this workspace.'));
  let result={merged:null,rows:[],summary:{changes:0,conflicts:0,unresolved:0,automatic:0,choices:0}};
  if(shared){
   if(shared.value.editionId!==local.editionId||returned.editionId!==local.editionId||
      shared.value.libraryIdentity!==local.libraryIdentity||returned.libraryIdentity!==local.libraryIdentity){
    issues.push(issue('ZOTERO_RETURN_SOURCE_EDITION_CHANGED','Review the changed source edition in the original project before reconciling this same-source return.'));
   }else{
    const edition=store.get('edition',local.editionId);
    if(!same(edition.body,selected.editionRecord.body)||!same(edition.documents??[],selected.editionRecord.documents??[]))
     issues.push(issue('ZOTERO_RETURN_SOURCE_EDITION_CHANGED','The retained original edition bytes differ between the author and returned project.'));
   }
   result=compareProjectFields(shared.value,local,returned,choices);
   if(!issues.length&&result.summary.unresolved===0){
    try{result.merged=await validateProject(result.merged,local);}
    catch(error){issues.push(issue(/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'ZOTERO_RETURN_PROJECT_INVALID','The merged project must satisfy the original project and source-selection rules. Review the indicated fields before applying.'));}
   }
  }
  const identity={returnId:current.id,returnRevision:current.revision,source:current.source,
   base:shared?{revision:shared.value.revision,sha256:shared.sha256,via:shared.via}:null,
   local:{revision:local.revision,sha256:localSha},returned:current.returned,choices,rows:result.rows,
   editionId:local.editionId,issues};
  const ready=!!shared&&!issues.length&&result.summary.unresolved===0;
  return {public:{id:current.id,revision:current.revision,status:current.status==='REVIEWED'&&stale?'REVIEW_REQUIRED':current.status,projectId:current.projectId,
   base:identity.base,local:identity.local,returned:identity.returned,editionId:local.editionId,libraryIdentity:local.libraryIdentity,
   previewSha256:digest(identity),summary:result.summary,rows:result.rows,ready,issues,
   review:current.review?{note:current.review.note,reviewedAt:current.review.reviewedAt,projectRevision:current.review.projectRevision,stale}:null,result:current.result},
   local,returned,shared,definition:result.merged};
 }
 async function preview(input){
  const current=record(input.id),offset=input.offset??0,limit=input.limit??100;
  need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'ZOTERO_RETURN_PAGE_INVALID');
  const computed=await calculate(current),rows=[];let bytes=0;
  for(const row of computed.public.rows.slice(offset,offset+limit)){const length=json(row).length;if(rows.length&&bytes+length>LIMIT.metadata/2)break;rows.push(row);bytes+=length;}
  return {...computed.public,rows,offset,limit,nextOffset:offset+rows.length<computed.public.rows.length?offset+rows.length:null};
 }
 async function review(input,op){
  const exact=clone(input),replay=store.actionResult(op,'project.return.review',exact);if(replay)return resolve(replay);
  const current=record(exact.id);revision(exact.expectedRevision);revision(exact.expectedProjectRevision);
  need(current.revision===exact.expectedRevision,'ZOTERO_RETURN_REVISION_CONFLICT');
  need(current.status!=='APPLIED','ZOTERO_RETURN_ALREADY_APPLIED');
  const before=await calculate(current);
  need(before.local.revision===exact.expectedProjectRevision,'ZOTERO_RETURN_PROJECT_CHANGED');
  need(before.public.previewSha256===exact.previewSha256,'ZOTERO_RETURN_PREVIEW_CHANGED');
  need(plain(exact.choices),'ZOTERO_RETURN_CHOICES_INVALID');text(exact.note??'','ZOTERO_RETURN_NOTE_INVALID',20000,true);
  const selected=await calculate(current,exact.choices);
  need(digest(before.local)===digest(selected.local),'ZOTERO_RETURN_PROJECT_CHANGED');
  return resolve(store.action(op,'project.return.review',exact,()=>{
   const latest=record(current.id);need(latest.revision===exact.expectedRevision,'ZOTERO_RETURN_REVISION_CONFLICT');
   const project=store.get('project',current.projectId);need(digest(project)===digest(before.local),'ZOTERO_RETURN_PROJECT_CHANGED');
   const value=store.put('project-return',latest.id,latest.revision,{...latest,status:selected.public.ready?'REVIEWED':'REVIEW_REQUIRED',
    review:{choices:clone(exact.choices),note:exact.note??'',reviewedAt:now(),projectRevision:project.revision,
     projectSha256:digest(project),base:selected.public.base,returned:selected.public.returned,
     candidate:selected.public.ready?selected.definition:null,candidateSha256:selected.public.ready?digest(selected.definition):null,
     summary:selected.public.summary,issues:selected.public.issues}});
   return {record:{kind:'project-return',id:value.id,revision:value.revision}};
  }));
 }
 async function apply(input,op){
  const exact=clone(input),replay=store.actionResult(op,'project.return.apply',exact);if(replay)return resolve(replay);
  const current=record(exact.id);revision(exact.expectedRevision);revision(exact.expectedProjectRevision);
  // Replayed apply resolves the original immutable result before re-reading a changed live project.
  if(current.status==='APPLIED')return resolve(store.action(op,'project.return.apply',exact,()=>{need(false,'ZOTERO_RETURN_ALREADY_APPLIED');}));
  const before=await calculate(current);
  need(current.revision===exact.expectedRevision,'ZOTERO_RETURN_REVISION_CONFLICT');
  need(before.local.revision===exact.expectedProjectRevision,'ZOTERO_RETURN_PROJECT_CHANGED');
  need(before.public.previewSha256===exact.previewSha256,'ZOTERO_RETURN_PREVIEW_CHANGED');
  need(current.status==='REVIEWED'&&before.public.ready&&current.review?.candidate,'ZOTERO_RETURN_REVIEW_REQUIRED');
  need(current.review.projectSha256===digest(before.local)&&current.review.candidateSha256===digest(before.definition),'ZOTERO_RETURN_PROJECT_CHANGED');
  return resolve(store.action(op,'project.return.apply',exact,()=>{
   const latest=record(current.id);need(latest.revision===exact.expectedRevision,'ZOTERO_RETURN_REVISION_CONFLICT');
   const project=store.get('project',current.projectId);need(digest(project)===current.review.projectSha256,'ZOTERO_RETURN_PROJECT_CHANGED');
   const value=store.put('project',project.id,project.revision,current.review.candidate);
   const received=store.put('project-return',latest.id,latest.revision,{...latest,status:'APPLIED',appliedAt:now(),
    acceptedAncestor:{project:clone(before.returned),sha256:digest(before.returned)},
    result:{projectId:value.id,projectRevision:value.revision,projectSha256:digest(value),requestId:requestId(op),sourceSha256:latest.source.sha256}});
   return {record:{kind:'project',id:value.id,revision:value.revision},returnRecord:{kind:'project-return',id:received.id,revision:received.revision}};
  }));
 }
 async function download(current,role){
  if(current.schema==='stellar-forge.zotero-project-delivery.v1')return{bytes:await store.objectBytes(current.object),filename:current.filename,mediaType:'application/json'};
  if(role==='source')return{bytes:await store.objectBytes(current.source),filename:'zotero-return-'+current.source.sha256.slice(0,16)+'.json',mediaType:'application/json'};
  return{bytes:json(current),filename:'zotero-return-review.json',mediaType:'application/json'};
 }
 return{prepare,importReturned,preview,review,apply,download};
}
