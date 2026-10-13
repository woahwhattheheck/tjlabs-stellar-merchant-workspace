// MIT. Complete source occurrences, immutable editorial revisions and portable receiving.
import { sha256, createProject, addDocument, freezeReview, createTableWorkspace } from './source-table-workspace.mjs';
import { zipWorkspace } from './onboarding.mjs';
import { createCollectionSource, verifyCollectionSource, collectionURL } from './collection-review-source.mjs';
import { renderCollectionReview } from './collection-review-report.mjs';

export const COLLECTION_WORKSPACE_SCHEMA='stellar-forge.collection-review.v1';
export const COLLECTION_PACKET_SCHEMA='stellar-forge.collection-review-packet.v1';
export const LIMITS=Object.freeze({workspaceBytes:64*1024*1024,sources:64,revisions:1000,occurrences:20000});
export const REVIEW_STATUSES=Object.freeze(['unreviewed','include','exclude','needs-info']);
export const RIGHTS_STATUSES=Object.freeze(['unknown','metadata-only','permission-recorded','restricted']);
const encoder=new TextEncoder(), copy=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const json=value=>JSON.stringify(value,null,2)+'\n';
function fail(code,message){throw Object.assign(new Error(message),{code});}
function text(value,label,max=20000){if(typeof value!=='string'||value.length>max||/\u0000/.test(value))fail('COLLECTION_TEXT',label+' must be ordinary text of at most '+max+' characters.');return value;}
function array(value,label,max){if(!Array.isArray(value)||value.length>max)fail('COLLECTION_ARRAY',label+' exceeds its complete-workspace limit.');return value;}
function timestamp(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('COLLECTION_TIME','Keep the original recorded time.');return value;}
export function canonical(value) {
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
  fail('COLLECTION_JSON','Keep complete finite JSON values.');
}
const same=(a,b)=>canonical(a)===canonical(b);
export const emptyReview=()=>({status:'unreviewed',suggestedTitle:'',summary:'',note:'',rights:{status:'unknown',basis:'',citation:''}});
export const emptyCollectionState=()=>({collectionIds:[],reviews:[],story:{title:'',introduction:'',order:[],note:''},relationships:[]});
function sourceMap(workspace){return new Map(workspace.sources.map(source=>[source.id,source]));}
function checkState(state,sources) {
  if(!plain(state))fail('COLLECTION_STATE','Keep the complete editorial state.');
  const ids=array(state.collectionIds,'Selected collections',LIMITS.sources), selected=new Set(), entries=new Set();
  for(const id of ids){if(selected.has(id)||!sources.has(id))fail('COLLECTION_REFERENCE','A selected collection is missing or repeated.');selected.add(id);for(const e of sources.get(id).entries)entries.add(e.id);}
  if(entries.size>LIMITS.occurrences)fail('COLLECTION_LIMIT','The review contains too many occurrences.');
  const seen=new Set();
  for(const row of array(state.reviews,'Occurrence reviews',LIMITS.occurrences)){
    if(!plain(row)||!entries.has(row.id)||seen.has(row.id))fail('COLLECTION_REVIEW','Each review must name one selected original occurrence.');
    seen.add(row.id);
    if(!REVIEW_STATUSES.includes(row.status))fail('COLLECTION_REVIEW','Choose an explicit review state.');
    for(const key of ['suggestedTitle','summary','note'])text(row[key],key);
    if(!plain(row.rights)||!RIGHTS_STATUSES.includes(row.rights.status))fail('COLLECTION_RIGHTS','Choose an explicit rights observation.');
    text(row.rights.basis,'Rights basis');text(row.rights.citation,'Rights source',12000);
    if(row.rights.citation)collectionURL(row.rights.citation);
    if(row.rights.status!=='unknown'&&(!row.rights.basis.trim()||!row.rights.citation))fail('COLLECTION_RIGHTS','A recorded rights/access status needs its own basis and source URL.');
  }
  if(!plain(state.story))fail('COLLECTION_STORY','Keep the complete story proposal.');
  for(const key of ['title','introduction','note'])text(state.story[key],'Story '+key);
  const story=new Set();
  for(const id of array(state.story.order,'Story order',LIMITS.occurrences)){
    if(!entries.has(id)||story.has(id))fail('COLLECTION_STORY','Story order must contain unique original occurrence IDs.');
    const review=state.reviews.find(row=>row.id===id);
    if(!review||review.status!=='include')fail('COLLECTION_STORY','Only explicitly included occurrences can appear in proposed story order.');
    story.add(id);
  }
  const relations=new Set();
  for(const relation of array(state.relationships,'Editorial relationships',LIMITS.occurrences)){
    if(!plain(relation)||!uuid(relation.id)||relations.has(relation.id)||!entries.has(relation.from)||!entries.has(relation.to)||relation.from===relation.to)
      fail('COLLECTION_RELATIONSHIP','Keep unique relationships between two original occurrences.');
    relations.add(relation.id);text(relation.kind,'Relationship kind',160);text(relation.note,'Relationship evidence/note');
    if(!relation.kind.trim()||!relation.note.trim())fail('COLLECTION_RELATIONSHIP','Describe the proposed relationship and its evidence or question.');
  }
  return copy(state);
}
function checkRequest(request){
  if(!plain(request)||!uuid(request.id)||!(request.expectedRevision===null||/^revision-[a-f0-9]{64}$/.test(request.expectedRevision||'')))
    fail('COLLECTION_REQUEST','Keep the original request UUID and selected saved revision.');
  text(request.actor,'Recorded by',200);if(!request.actor.trim())fail('COLLECTION_ACTOR','Record the actual editorial operator.');
  text(request.note,'Revision note');timestamp(request.createdAt);
  canonical(request);
}
function revisionFor(workspace,id=workspace.headId){const r=workspace.revisions.find(row=>row.id===id);if(!r)fail('COLLECTION_REVISION','Choose an existing complete review revision.');return r;}
async function buildRevision(request,sources){
  checkRequest(request);const state=checkState(request.state,sources);
  const retained=copy(request), hash=await sha256(canonical(retained));
  return {id:'revision-'+hash,parentId:request.expectedRevision,createdAt:request.createdAt,actor:request.actor,note:request.note,request:retained,state};
}
export async function createCollectionWorkspace({name='Collection review',actor,id=crypto.randomUUID(),createdAt=new Date().toISOString()}={}) {
  text(name,'Workspace name',200);if(!uuid(id))fail('COLLECTION_ID','Use a workspace UUID.');
  const request={id:crypto.randomUUID(),expectedRevision:null,actor,note:'Created collection review workspace',createdAt,state:emptyCollectionState()};
  const revision=await buildRevision(request,new Map());
  return {schema:COLLECTION_WORKSPACE_SCHEMA,id,name,createdAt,sources:[],revisions:[revision],headId:revision.id,workingCopies:[]};
}
export async function validateCollectionWorkspace(input) {
  const raw=typeof input==='string'?input:json(input);
  if(encoder.encode(raw).length>LIMITS.workspaceBytes)fail('COLLECTION_SIZE','The complete workspace exceeds 64 MiB.');
  let w;try{w=JSON.parse(raw);}catch{fail('COLLECTION_JSON','Choose a complete collection review JSON.');}
  if(!plain(w)||w.schema!==COLLECTION_WORKSPACE_SCHEMA||!uuid(w.id))fail('COLLECTION_SCHEMA','Choose the complete collection review workspace.');
  text(w.name,'Workspace name',200);timestamp(w.createdAt);
  const sources=new Map();let totalEntries=0;
  for(const source of array(w.sources,'Sources',LIMITS.sources)){
    const verified=await verifyCollectionSource(source);
    if(sources.has(verified.id))fail('COLLECTION_SOURCE','A complete source is repeated.');
    sources.set(verified.id,verified);totalEntries+=verified.entries.length;
  }
  if(totalEntries>LIMITS.occurrences)fail('COLLECTION_LIMIT','The retained sources contain too many occurrences.');
  const revisions=new Map(), requests=new Map();
  for(const revision of array(w.revisions,'Revision history',LIMITS.revisions)){
    if(!plain(revision))fail('COLLECTION_REVISION','A review revision is incomplete.');
    const expected=await buildRevision(revision.request,sources);
    if(!same(revision,expected)||revisions.has(revision.id)||requests.has(revision.request.id))
      fail('COLLECTION_REVISION','A revision or original request identity changed or was repeated.');
    revisions.set(revision.id,revision);requests.set(revision.request.id,revision.id);
  }
  if(!revisions.has(w.headId))fail('COLLECTION_HEAD','The selected review revision is missing.');
  if([...revisions.values()].filter(r=>r.parentId===null).length!==1)fail('COLLECTION_ROOT','Keep one complete original workspace root.');
  for(const revision of revisions.values()){
    const seen=new Set();let r=revision;
    while(r.parentId!==null){
      if(seen.has(r.id)||!revisions.has(r.parentId))fail('COLLECTION_HISTORY','The complete original parent history is missing or cyclic.');
      seen.add(r.id);r=revisions.get(r.parentId);
    }
  }
  const drafts=new Set();
  for(const draft of array(w.workingCopies||[],'Retained working copies',1000)){
    if(!plain(draft)||!revisions.has(draft.baseRevision))fail('COLLECTION_DRAFT','A retained working copy lacks its original basis.');
    const {id,...body}=draft;text(body.stateText,'Unfinished editorial JSON',2*1024*1024);text(body.actor,'Draft operator',200);text(body.note,'Draft note');timestamp(body.createdAt);
    if(body.structuredState!==null&&body.structuredState!==undefined)canonical(body.structuredState);
    if(body.browserDraft!==null&&body.browserDraft!==undefined)canonical(body.browserDraft);
    if(body.pending!==null){checkRequest(body.pending);if(!revisions.has(body.pending.expectedRevision))fail('COLLECTION_DRAFT','The retained attempt lacks its original saved basis.');}
    if(id!=='draft-'+await sha256(canonical(body))||drafts.has(id))fail('COLLECTION_DRAFT','A retained working copy changed or was repeated.');
    drafts.add(id);
  }
  return w;
}
export async function retainCollectionWorkingCopy(workspace,{baseRevision,stateText,actor,note,pending=null,structuredState=null,browserDraft=null,createdAt=new Date().toISOString()}){
  const w=await validateCollectionWorkspace(workspace),body={baseRevision,stateText,actor,note,pending:copy(pending),structuredState:copy(structuredState),browserDraft:copy(browserDraft),createdAt};
  const draft={id:'draft-'+await sha256(canonical(body)),...body};w.workingCopies||=[];
  if(!w.workingCopies.some(x=>x.id===draft.id))w.workingCopies.push(draft);
  await validateCollectionWorkspace(w);return {workspace:w,draft};
}
export async function addCollectionSource(workspace,input) {
  const w=await validateCollectionWorkspace(workspace), source=await createCollectionSource(input);
  const old=w.sources.find(row=>row.id===source.id);
  if(old&&!same(old,source))fail('COLLECTION_SOURCE','The source identity already names different bytes.');
  if(!old)w.sources.push(source);
  if(w.sources.length>LIMITS.sources||w.sources.reduce((n,s)=>n+s.entries.length,0)>LIMITS.occurrences)fail('COLLECTION_LIMIT','The complete source limit is reached.');
  if(encoder.encode(json(w)).length>LIMITS.workspaceBytes)fail('COLLECTION_SIZE','This complete source would exceed the 64 MiB workspace limit. The previous workspace remains usable.');
  return {workspace:w,source,reused:Boolean(old)};
}
export async function saveCollectionRevision(workspace,request) {
  const w=await validateCollectionWorkspace(workspace);checkRequest(request);
  const old=w.revisions.find(row=>row.request.id===request.id);
  if(old){if(!same(old.request,request))fail('COLLECTION_REQUEST_CONFLICT','This original request UUID already owns another exact editorial input.');return {workspace:w,revision:copy(old),reused:true};}
  if(request.expectedRevision!==w.headId)fail('COLLECTION_CHANGED','The saved review changed. Keep this draft and compare the newer selected revision.');
  if(w.revisions.length>=LIMITS.revisions)fail('COLLECTION_LIMIT','The retained review limit is reached.');
  const revision=await buildRevision(request,sourceMap(w));w.revisions.push(revision);w.headId=revision.id;
  if(encoder.encode(json(w)).length>LIMITS.workspaceBytes)fail('COLLECTION_SIZE','This complete review would exceed the 64 MiB workspace limit. Keep the previous workspace and draft.');
  return {workspace:w,revision,reused:false};
}
export function collectionDraft(workspace,revisionId=workspace.headId) {return copy(revisionFor(workspace,revisionId).state);}
export async function receiveCollectionWorkspace(local,incoming) {
  const [left,right]=await Promise.all([validateCollectionWorkspace(local),validateCollectionWorkspace(incoming)]);
  if(left.id!==right.id||left.name!==right.name||left.createdAt!==right.createdAt)fail('COLLECTION_IDENTITY','Receiving keeps this original workspace identity. Open an unrelated workspace separately.');
  const leftRoot=left.revisions.find(r=>r.parentId===null),rightRoot=right.revisions.find(r=>r.parentId===null);
  if(!same(leftRoot,rightRoot))fail('COLLECTION_IDENTITY','The received workspace has another original root.');
  left.workingCopies||=[];right.workingCopies||=[];
  for(const key of ['sources','revisions','workingCopies']){
    const map=new Map(left[key].map(row=>[row.id,row]));
    for(const row of right[key]){const old=map.get(row.id);if(old&&!same(old,row))fail('COLLECTION_RECEIVING','An existing immutable source or revision differs.');if(!old){left[key].push(copy(row));map.set(row.id,row);}}
  }
  await validateCollectionWorkspace(left);
  return {workspace:left,receivedHeadId:right.headId,preservedHeadId:left.headId};
}
export async function collectionReport(workspace,revisionId=workspace.headId) {
  const w=await validateCollectionWorkspace(workspace),revision=revisionFor(w,revisionId),state=revision.state,sources=sourceMap(w);
  const reviews=new Map(state.reviews.map(row=>[row.id,row]));
  const collections=state.collectionIds.map(id=>{const c=sources.get(id);return {id,institution:copy(c.institution),
    source:Object.fromEntries(Object.entries(c.source).filter(([key])=>key!=='sourceText')),
    entries:c.entries.map(entry=>({...copy(entry),review:copy(reviews.get(entry.id)||emptyReview())}))};});
  const counts={collections:collections.length,occurrences:0,unreviewed:0,include:0,exclude:0,'needs-info':0,rightsUnknown:0};
  for(const c of collections)for(const entry of c.entries){counts.occurrences++;counts[entry.review.status]++;if(entry.review.rights.status==='unknown')counts.rightsUnknown++;}
  return {schema:'stellar-forge.collection-review-report.v1',workspace:{id:w.id,name:w.name},
    revision:{id:revision.id,parentId:revision.parentId,createdAt:revision.createdAt,actor:revision.actor,note:revision.note},
    collections,story:copy(state.story),relationships:copy(state.relationships),counts};
}
const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
function csv(rows,headers){return [headers,...rows.map(row=>headers.map(key=>row[key]))].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';}
export function collectionRows(report) {
  return report.collections.flatMap(collection=>collection.entries.map(entry=>({
    occurrence_id:entry.id,institution:collection.institution.title,source_ordinal:String(entry.ordinal),source_title:entry.title,source_url:entry.url,
    catalogue_url:collection.source.url,source_sha256:collection.source.sha256,observed_at:collection.source.observedAt,
    review_status:entry.review.status,proposed_title:entry.review.suggestedTitle,proposed_summary:entry.review.summary,review_note:entry.review.note,
    rights_status:entry.review.rights.status,rights_basis:entry.review.rights.basis,rights_source:entry.review.rights.citation,
    story_position:report.story.order.includes(entry.id)?String(report.story.order.indexOf(entry.id)+1):'',
    source_locator:JSON.stringify(entry.sourceLocator)
  })));
}
export async function collectionSourceTables(workspace,revisionId=workspace.headId) {
  const report=await collectionReport(workspace,revisionId),rows=collectionRows(report);
  if(!rows.length)fail('COLLECTION_EMPTY','Select and save at least one source before exporting reviewed tables.');
  const headers=Object.keys(rows[0]), data=csv(rows,headers);
  let result=await addDocument(createProject({name:report.workspace.name}),{filename:'collection-occurrences.csv',sourceText:data,resourceId:'collection-occurrences',delimiter:',',header:true});
  const doc=result.project.documents.find(d=>d.id===result.documentId);
  // Explicit text preserves original combined dates, IDs, leading zeroes and unknown fields.
  for(const column of doc.mapping.columns){column.type='text';column.empty='keep';}
  if(doc.mapping.columns.some(c=>c.name==='occurrence_id'))doc.mapping.keyColumns=[doc.mapping.columns.find(c=>c.name==='occurrence_id').index];
  result=await freezeReview(result.project,result.documentId);
  return {project:result.project,report};
}
export async function createCollectionPacket(workspace) {
  const w=await validateCollectionWorkspace(workspace);
  return {schema:COLLECTION_PACKET_SCHEMA,workspaceSha256:await sha256(canonical(w)),workspace:w};
}
export async function openCollectionPacket(input) {
  let value=typeof input==='string'?JSON.parse(input):input;
  if(value?.schema===COLLECTION_WORKSPACE_SCHEMA)return validateCollectionWorkspace(value);
  if(value?.schema!==COLLECTION_PACKET_SCHEMA)fail('COLLECTION_PACKET','Open a complete editable collection packet.');
  const w=await validateCollectionWorkspace(value.workspace);
  if(value.workspaceSha256!==await sha256(canonical(w)))fail('COLLECTION_PACKET','The complete packet checksum changed.');
  return w;
}
export async function createCollectionExport(workspace,revisionId=workspace.headId,{native=false}={}) {
  const w=await validateCollectionWorkspace(workspace),report=await collectionReport(w,revisionId),rows=collectionRows(report);
  const packet=await createCollectionPacket(w),prefix='collection-review/';
  const files=[{path:prefix+'workspace.json',content:json(packet)},{path:prefix+'review.json',content:json(report)},
    {path:prefix+'review.html',content:renderCollectionReview(report)},
    {path:prefix+'occurrences.csv',content:rows.length?csv(rows,Object.keys(rows[0])):''},
    {path:prefix+'relationships.csv',content:csv(report.relationships,['id','from','to','kind','note'])},
    {path:prefix+'story.json',content:json(report.story)}];
  for(const source of w.sources){files.push({path:prefix+'sources/'+source.id+'/original.'+(source.source.format==='archiveblack-html'?'html':'json'),content:source.source.sourceText},
    {path:prefix+'sources/'+source.id+'/source.json',content:json(source)});}
  files.push({path:prefix+'README.md',content:'# '+w.name+'\n\nProposed collection-review capability. This is an editorial preparation, not an institutional publication, rights clearance or issuer-specific DAM implementation.\n\nOpen workspace.json in Collection review to validate and continue every source and revision. Receiving into the same workspace retains the current local selection and all incoming branches. Select an earlier/received revision explicitly as the basis of a new draft.\n\nreview.html is a printable complete institutional review plus separately ordered story proposal. Source titles combine any date exactly as published. Repeated links remain distinct occurrences. Rights observations require an operator-provided basis and citation; they do not independently establish permission. No linked media is included or fetched.\n\noccurrences.csv and relationships.csv are quoted UTF-8 metadata for explicit import to an existing CMS/catalogue. Source titles may contain spreadsheet formula characters; import all fields as text. review.json and story.json carry complete structured fields.\n'}); 
  if(native){const output=await collectionSourceTables(w,revisionId),table=await createTableWorkspace(output.project);files.push(...table.files);}
  const manifest={schema:'stellar-forge.collection-review-files.v1',workspaceId:w.id,selectedRevisionId:revisionId,workspaceSha256:packet.workspaceSha256,files:[]};
  for(const file of files)manifest.files.push({path:file.path,bytes:encoder.encode(file.content).length,sha256:await sha256(file.content)});
  files.push({path:prefix+'files.json',content:json(manifest)});
  return {files,manifest,report};
}
export async function createCollectionArchive(workspace,revisionId=workspace.headId,options={}) {
  const output=await createCollectionExport(workspace,revisionId,options);
  return {...output,bytes:zipWorkspace(output.files)};
}
