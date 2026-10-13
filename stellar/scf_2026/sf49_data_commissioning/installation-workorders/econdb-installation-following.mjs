// SPDX-License-Identifier: MIT
/** Complete project-edition review for the original saved Econdb customer Installation. */
import {createHash} from 'node:crypto';
import {validateEcondbInstallationSource,same,ECONDB_INSTALLATION_SCHEMA as BASE,
 ECONDB_INSTALLATION_PROFILE as PROFILE} from './econdb-installation-core.mjs';
import {renderWorkorder} from './prepare-core.mjs';
export const ECONDB_FOLLOWING='stellar-forge.econdb-installation-following.v1';
export const MAX_ECONDB_FOLLOWING_REVIEW_BYTES=8*1024*1024;
const MAX=64*1024*1024;
const clone=v=>JSON.parse(JSON.stringify(v));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const HASH=/^[a-f0-9]{64}$/;
const INSTALLATION=/^installation-[a-f0-9]{32}$/;
const CASE=/^operation-[a-f0-9]{32}$/;
const FIELDS={
 source:['reference','population','meaning','authority','changePolicy'],
 receiving:['application','host','operator','acceptanceRule','changeAndWithdraw','recovery','maintenance']
};
function need(ok,message){if(!ok)throw Object.assign(new Error(message),{code:'ECONDB_FOLLOWING_INPUT'});}
const ordered=v=>Array.isArray(v)?v.map(ordered):object(v)?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
export const econdbFollowingCanonical=v=>JSON.stringify(ordered(v));
export const econdbFollowingSha=raw=>createHash('sha256').update(raw).digest('hex');
export const econdbFollowingIdentity=v=>econdbFollowingSha(econdbFollowingCanonical(v));
function bounded(value,label,limit=MAX){
 need(Buffer.byteLength(JSON.stringify(value))<=limit,'The complete '+label+' exceeds its retained byte capacity.');
 return value;
}
function exact(value,keys,label){
 need(object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k)),
  'Retain every declared '+label+' field.');
}
function text(value,label,{empty=false,limit=4000}={}){
 need(typeof value==='string'&&value.length<=limit&&!value.includes('\0')&&(empty||value.trim()),
  'Retain the complete '+label+'.');return value;
}
function number(value,label){need(Number.isSafeInteger(value)&&value>0,'Retain the original '+label+'.');return value;}
function seal(value){return bounded({...value,sha256:econdbFollowingIdentity(value)},'following result');}
function unseal(value){const {sha256,...body}=value;need(HASH.test(sha256??'')&&econdbFollowingIdentity(body)===sha256,'The retained following result changed.');return body;}
function sourceRef(source){
 const p=source.project;
 return 'Econdb workspace '+source.workspace.id+' revision '+source.workspace.revision+
  '; project '+p.config.id+'; original record '+p.record.id+' revision '+p.record.revision+
  '; project input SHA-256 '+p.inputSha256+'; project manifest SHA-256 '+p.manifest.sha256+
  '; whole workspace ZIP SHA-256 '+source.archive.sha256+'.';
}
function caseSource(caseValue){
 const {program,plan}=caseValue??{};
 need(object(program)&&CASE.test(program.id??'')&&object(plan),'Select the original current case and pinned plan.');
 number(program.version,'case version');number(plan.revision,'plan revision');
 text(program.mode,'case mode');text(plan.id,'pinned plan identity');
 need(program.planId===plan.id&&HASH.test(plan.contentSha256??'')&&HASH.test(plan.source?.sha256??''),
  'Retain the complete current pinned plan identities.');
 return{caseId:program.id,version:program.version,mode:program.mode,planId:plan.id,
  planRevision:plan.revision,planContentSha256:plan.contentSha256,planSourceSha256:plan.source.sha256};
}
function saved(row,label,caseId){
 need(object(row)&&INSTALLATION.test(row.id??'')&&HASH.test(row.sha256??'')&&
  object(row.preview?.document)&&row.preview.source?.caseId===caseId,'Select the full original '+label+' Installation.');
 number(row.revision,label+' Installation revision');
 number(row.version,label+' Installation case version');
 need(row.preview.document.workshare?.caseId&&object(row.preview.document.source)&&object(row.preview.document.receiving),
  'Retain the original Workshare, source and receiving document.');
 return row;
}
function priorScope(input){
 const {before,priorPreparation}=input;
 if(!priorPreparation.following)return new Map();
 const value=priorPreparation.following;unseal(value);
 need(value.schema===ECONDB_FOLLOWING+'.prepared'&&same(value.document,priorPreparation.document)&&
  same(value.source,before),'Retain the complete prior following preparation.');
 const rows=value.scope?.entries;
 need(Array.isArray(rows)&&rows.length===before.project.entries.length&&new Set(rows.map(r=>r.key)).size===rows.length,
  'Retain the complete prior following scope.');
 const found=new Map();
 for(const entry of before.project.entries){
  const row=rows.find(r=>r.key===entry.id),selected=entryView(before,entry.id);
  exact(row,['key','entrySha256','included','purpose'],'prior entry scope');
  need(row.entrySha256===selected.sha256&&typeof row.included==='boolean','The prior source scope differs.');
  text(row.purpose,'prior source purpose');found.set(row.key,clone(row));
 }
 return found;
}
function binding(input){
 need(object(input),'Select the complete original following inputs.');
 const {before,after,priorPreparation,priorInstallation,installation,caseValue,lineage,commercial}=input;
 validateEcondbInstallationSource(before);validateEcondbInstallationSource(after);
 const current=caseSource(caseValue);
 saved(priorInstallation,'prepared historical',current.caseId);saved(installation,'current',current.caseId);
 need(priorInstallation.id===installation.id&&priorInstallation.revision<=installation.revision&&
  priorInstallation.version<=installation.version&&installation.version<=current.version,
  'Keep the same saved Installation and ordered original case editions.');
 need(Array.isArray(caseValue.installations),'Retain the original current Installation heads.');
 const heads=caseValue.installations.filter(r=>r.id===installation.id);
 need(heads.length===1&&heads[0].revision===installation.revision&&heads[0].sha256===installation.sha256,
  'The original Installation has another current edition. Retain this review and reopen its current head.');
 need(priorPreparation?.schema===BASE&&priorPreparation.state==='PREPARED'&&
  HASH.test(priorPreparation.preparationSha256??'')&&Number.isSafeInteger(priorPreparation.preparationBytes)&&
  priorPreparation.preparationBytes>0&&same(priorPreparation.source,before)&&object(priorPreparation.document)&&
  priorPreparation.installationSource?.caseId===current.caseId&&Array.isArray(priorPreparation.inputs)&&
  Array.isArray(priorPreparation.outputs),'Reopen the full exact prior preparation and retain its complete source and result identity.');
 const fixed=(rows,name,expected,label)=>{
  const selected=rows.filter(row=>row?.name===name);
  need(selected.length===1&&selected[0].bytes===expected.bytes&&selected[0].sha256===expected.sha256,
   'Retain the full original '+label+' in the prior preparation.');};
 const bodyIdentity=value=>{const raw=JSON.stringify(value,null,2)+'\n';return{bytes:Buffer.byteLength(raw),sha256:econdbFollowingSha(raw)};};
 fixed(priorPreparation.inputs,'source/econdb-workspace.zip',before.archive,'workspace sidecar');
 fixed(priorPreparation.outputs,'ECONDB_CUSTOMER_SOURCE.json',bodyIdentity(before),'customer source report');
 fixed(priorPreparation.outputs,'installation-input.json',bodyIdentity(priorPreparation.document),'prepared Installation document');
 for(const file of before.files)fixed(priorPreparation.outputs,'delivery/files/'+file.name,file,'selected project member');
 need(same(priorPreparation.document,priorInstallation.preview.document),
  'Select the actual saved historical Installation document produced by this exact prior preparation.');
 need(priorPreparation.workshareCaseId===priorPreparation.document.workshare?.caseId&&
  installation.preview.document.workshare.caseId===priorPreparation.workshareCaseId,
  'Keep this continuation with the original commercial Workshare.');
 need(before.workspace.id===after.workspace.id&&before.project.config.id===after.project.config.id&&
  after.workspace.revision>=before.workspace.revision,'Follow the same original workspace and project in source order.');
 exact(lineage,['workspaceId','previousRecord'],'original project lineage');
 need(lineage.workspaceId===after.workspace.id&&same(lineage.previousRecord,before.project.record),
  'The later complete archive must retain this exact earlier original project record.');
 if(after.project.record.id===before.project.record.id){
  need(same(after.project.record,before.project.record)&&same(after.project.config,before.project.config)&&
   same(after.project.manifest,before.project.manifest)&&same(after.project.analysisFile,before.project.analysisFile)&&
   same(after.project.entries,before.project.entries)&&same(after.project.summary,before.project.summary)&&
   same(after.files,before.files),'An unchanged original project record must retain its complete original project.');
 }else need(after.project.record.revision>before.project.record.revision,
  'Select a following saved project record from the same original workspace history.');

 need(object(commercial)&&commercial.schema==='stellar-forge.installation-commercial-workshare.v1'&&
  commercial.profile===PROFILE&&commercial.caseId===priorPreparation.workshareCaseId&&object(commercial.commercial)&&object(commercial.originalPlan)&&
  object(commercial.originalCommissioningCase)&&Array.isArray(commercial.phases)&&Array.isArray(commercial.originalProductionEffort),
  'Retain the complete original commercial Workshare report for this preparation.');
 fixed(priorPreparation.outputs,'commercial.json',bodyIdentity(commercial),'commercial Workshare report');
 need(commercial.planSha256===installation.preview.document.workshare.planSha256&&
  same(commercial.workshareSource,installation.preview.document.workshare),
  'The current Workshare commercial binding changed. Receive its updated original commercial source through the existing case before preparing this source continuation.');
 const document=installation.preview.document,baseline=priorPreparation.document;
 need(document.source.mode==='SNAPSHOT'&&baseline.source.mode==='SNAPSHOT','Keep the complete retained snapshot source behavior.');
 for(const section of ['source','receiving']){
  need(Array.isArray(document[section].sourceIds),'Retain the original '+section+' source IDs.');
  for(const field of FIELDS[section])text(document[section][field],section+'.'+field,{empty:true});
 }
 const retained=Object.fromEntries(Object.entries(document).filter(([key])=>!['source','receiving'].includes(key)));
 return{current,document,baseline,scope:priorScope(input),retained,
  basis:{caseSource:current,installation:{id:installation.id,revision:installation.revision,sha256:installation.sha256},
   priorInstallation:{id:priorInstallation.id,revision:priorInstallation.revision,sha256:priorInstallation.sha256},
   priorPreparation:{sha256:priorPreparation.preparationSha256,bytes:priorPreparation.preparationBytes,
    resultSha256:econdbFollowingIdentity(priorPreparation)},
   before:{sourceSha256:econdbFollowingIdentity(before),archive:clone(before.archive),workspace:clone(before.workspace),
    projectRecord:clone(before.project.record),projectInputSha256:before.project.inputSha256,projectManifest:clone(before.project.manifest)},
   after:{sourceSha256:econdbFollowingIdentity(after),archive:clone(after.archive),workspace:clone(after.workspace),
    projectRecord:clone(after.project.record),projectInputSha256:after.project.inputSha256,projectManifest:clone(after.project.manifest)},
   lineageSha256:econdbFollowingIdentity(lineage),commercialSha256:econdbFollowingIdentity(commercial),preservedFieldsSha256:econdbFollowingIdentity(retained)}};
}
function entryView(source,id){
 const entry=source.project.entries.find(r=>r.id===id);if(!entry)return null;
 const paths=['entries/'+id+'/','originals/'+id+'/'];
 const files=source.files.filter(f=>paths.some(prefix=>f.name.startsWith(prefix))).map(clone).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 const value={entry:clone(entry),files};return{sha256:econdbFollowingIdentity(value),...value};
}
function filesDiff(before,after){
 const a=new Map(before.map(f=>[f.name,f])),b=new Map(after.map(f=>[f.name,f]));
 return [...new Set([...a.keys(),...b.keys()])].sort().map(name=>{
  const old=a.get(name)??null,next=b.get(name)??null;
  return{name,status:!old?'NEW':!next?'MISSING':same(old,next)?'UNCHANGED':'CHANGED',before:clone(old),after:clone(next)};
 });
}
function fieldRows(bound,after){
 const fields=[];
 for(const [section,names]of Object.entries(FIELDS))for(const name of names){
  const baseline=bound.baseline[section][name]??'',current=bound.document[section][name];
  const proposed=section==='source'&&name==='reference'?sourceRef(after):current;
  text(baseline,'baseline '+section+'.'+name,{empty:true});text(proposed,'following '+section+'.'+name,{empty:true});
  fields.push({path:section+'.'+name,baseline,current,proposed,
   status:current!==baseline&&proposed!==current?'CONCURRENT_CHANGE':proposed!==current?'FOLLOWING_CHANGE':current!==baseline?'CURRENT_EDIT':'UNCHANGED'});
 }
 return fields;
}
export function compareEcondbFollowing(input){
 const bound=binding(input),a=input.before.project,b=input.after.project;
 const keys=[...new Set([...a.entries.map(e=>e.id),...b.entries.map(e=>e.id)])].sort();
 const rows=keys.map(key=>{
  const before=entryView(input.before,key),after=entryView(input.after,key);
  return{key,title:(after??before).entry.title,
   status:!before?'NEW':!after?'MISSING':before.sha256===after.sha256?'UNCHANGED':'CHANGED',
   before,after,previous:bound.scope.get(key)??null};
 });
 return seal({schema:ECONDB_FOLLOWING+'.comparison',basis:bound.basis,rows,
  files:filesDiff(input.before.files,input.after.files),fields:fieldRows(bound,input.after),
  project:{before:{config:clone(a.config),summary:clone(a.summary)},after:{config:clone(b.config),summary:clone(b.summary)}},
  protectedFields:clone(bound.retained),commercial:clone(input.commercial),
  totals:Object.fromEntries(['UNCHANGED','CHANGED','NEW','MISSING'].map(status=>[status,rows.filter(r=>r.status===status).length])),
  meaning:'Entry decisions describe commissioned scope. Both complete projects and all their originals remain retained. Scientific values and comparisons come from the original Econdb project engine; scope choices do not alter those calculations.'});
}
export function econdbFollowingTemplate(input){
 const comparison=compareEcondbFollowing(input);
 const review={schema:ECONDB_FOLLOWING+'.review',comparisonSha256:comparison.sha256,basis:clone(comparison.basis),
  actor:'',observedAt:'',
  decisions:comparison.rows.map(row=>{
   const carry=row.status==='UNCHANGED'&&row.previous;
   return{key:row.key,beforeSha256:row.before?.sha256??null,afterSha256:row.after?.sha256??null,
    disposition:carry?(row.previous.included?'included':'context'):row.status==='MISSING'?'missing':null,
    purpose:carry?row.previous.purpose:'',note:'',reviewed:Boolean(carry)};
  }),
  fields:comparison.fields.map(row=>({path:row.path,choice:row.path==='source.reference'?'proposed':'current',
   value:row.path==='source.reference'?row.proposed:row.current,note:'',reviewed:row.status==='UNCHANGED'||row.status==='CURRENT_EDIT'})),
  fileReview:{reviewed:false,note:''},
  commercialReview:{reviewed:false,scopeFitsCurrentWorkshare:false,note:''}};
 return{comparison,review:bounded(review,'editable following review',MAX_ECONDB_FOLLOWING_REVIEW_BYTES)};
}
function resolveReview(input,raw){
 need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=MAX_ECONDB_FOLLOWING_REVIEW_BYTES,
  'Retain the entire valid UTF-8 following review within 8 MiB.');
 let review;try{review=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
 catch{need(false,'Use the complete original UTF-8 following review JSON.');}
 exact(review,['schema','comparisonSha256','basis','actor','observedAt','decisions','fields','fileReview','commercialReview'],'following review');
 const comparison=compareEcondbFollowing(input);
 need(review.schema===ECONDB_FOLLOWING+'.review'&&review.comparisonSha256===comparison.sha256&&same(review.basis,comparison.basis),
  'The selected case, Installation or original project comparison changed. Retain this review and compare its current versions.');
 text(review.actor,'reviewing operator');need(typeof review.observedAt==='string'&&Number.isFinite(Date.parse(review.observedAt)),
  'Record when this complete following review was made.');
 need(Array.isArray(review.decisions)&&review.decisions.length===comparison.rows.length&&
  new Set(review.decisions.map(r=>r?.key)).size===review.decisions.length,'Review every complete entry once.');
 const decisions=new Map(review.decisions.map(r=>[r.key,r])),entries=[];
 for(const row of comparison.rows){
  const value=decisions.get(row.key);exact(value,['key','beforeSha256','afterSha256','disposition','purpose','note','reviewed'],'entry decision');
  need(value.reviewed===true&&value.beforeSha256===(row.before?.sha256??null)&&value.afterSha256===(row.after?.sha256??null),
   'Review the exact original before/after entry: '+row.key+'.');
  need((row.after?['included','context']:['missing']).includes(value.disposition),
   'Retain a missing entry as missing; select included or context for a present following entry.');
  text(value.purpose,'entry scope purpose');text(value.note,'entry decision note',{empty:true});
  if(row.status!=='UNCHANGED'||!row.previous||value.disposition!==(row.previous.included?'included':'context')||value.purpose!==row.previous.purpose)
   text(value.note,'reason for the source scope decision');
  if(row.after)entries.push({key:row.key,entrySha256:row.after.sha256,included:value.disposition==='included',purpose:value.purpose});
 }
 need(entries.some(r=>r.included),'Select a present entry for the continuing commissioned task.');
 need(Array.isArray(review.fields)&&review.fields.length===comparison.fields.length&&
  new Set(review.fields.map(r=>r?.path)).size===review.fields.length,'Review the complete source and receiving field selection.');
 const fields=new Map(review.fields.map(r=>[r.path,r]));
 for(const row of comparison.fields){
  const value=fields.get(row.path);exact(value,['path','choice','value','note','reviewed'],'document field decision');
  need(value.reviewed===true&&['current','proposed','edited'].includes(value.choice),'Explicitly review '+row.path+'.');
  text(value.value,row.path,{empty:true});text(value.note,row.path+' note',{empty:true});
  if(value.choice!=='edited')need(value.value===row[value.choice],'Retain the exact selected '+row.path+' value.');
  if(value.value!==row.current||value.choice==='edited')text(value.note,'reason for '+row.path);
 }
 exact(review.fileReview,['reviewed','note'],'complete file review');
 need(review.fileReview.reviewed===true,'Review the complete original project file population and all changes.');
 text(review.fileReview.note,'file population review');
 exact(review.commercialReview,['reviewed','scopeFitsCurrentWorkshare','note'],'original commercial scope review');
 need(review.commercialReview.reviewed===true&&review.commercialReview.scopeFitsCurrentWorkshare===true,
  'Review this scope against the original current Workshare. Commercial changes use its existing case workflow.');
 text(review.commercialReview.note,'current Workshare and preserved operated-field review');
 return{review,comparison,entries,fields};
}
export function prepareEcondbFollowing(input){
 const bound=binding(input),resolved=resolveReview(input,input.reviewRaw);
 const {review,comparison,entries,fields}=resolved,document=clone(bound.document);
 for(const [section,names]of Object.entries(FIELDS))for(const name of names)
  document[section][name]=fields.get(section+'.'+name).value;
 for(const key of Object.keys(bound.document).filter(k=>!['source','receiving'].includes(k)))
  need(same(document[key],bound.document[key]),'Preserve the complete original '+key+'.');
 for(const section of ['source','receiving'])for(const key of Object.keys(bound.document[section]).filter(k=>!FIELDS[section].includes(k)))
  need(same(document[section][key],bound.document[section][key]),'Preserve the original '+section+'.'+key+'.');
 bounded(document,'native Installation',128*1024);
 const scope={schema:ECONDB_FOLLOWING+'.scope',caseId:bound.current.caseId,
  installationId:input.installation.id,workshareCaseId:input.priorPreparation.workshareCaseId,
  sourceSha256:econdbFollowingIdentity(input.after),projectId:input.after.project.config.id,
  projectRecord:clone(input.after.project.record),archive:clone(input.after.archive),entries,
  missing:review.decisions.filter(r=>r.disposition==='missing').map(clone)};
 const source={...clone(input.after),installationSelection:clone(bound.current),
  workshareCaseId:input.priorPreparation.workshareCaseId,
  following:{schema:ECONDB_FOLLOWING+'.source',comparisonSha256:comparison.sha256,
   priorPreparation:clone(bound.basis.priorPreparation),priorInstallation:clone(bound.basis.priorInstallation),
   currentInstallation:clone(bound.basis.installation),scope:clone(scope)}};
 const preview={expectedVersion:bound.current.version,installationId:input.installation.id,
  expectedRevision:input.installation.revision,document:clone(document)};
 const following=seal({schema:ECONDB_FOLLOWING+'.prepared',basis:clone(bound.basis),review:clone(review),comparison,
  previousInstallation:clone(input.priorInstallation),currentInstallation:clone(input.installation),
  reviewSource:{bytes:input.reviewRaw.length,sha256:econdbFollowingSha(input.reviewRaw)},
  currentCaseVersion:bound.current.version,source,scope,document,preview});
 const prepared={schema:'stellar-forge.installation-workorder-preparation.v1',profile:PROFILE,source:clone(bound.current),
  workshareCaseId:input.priorPreparation.workshareCaseId,document,selections:[],
  implementation:[
   {title:'Retain both complete original source preparations',result:'Preserve both operator archives, complete projects, original responses and all selected attachments.'},
   {title:'Review the following project and commissioned scope',result:'Retain every entry decision, complete file review and the selected original Workshare scope.'},
   {title:'Save the same Installation through its original writer',result:'Preview the current ID and revision, save its exact native request and preserve all previous editions.'},
   {title:'Independently receive the complete customer work',result:'Reopen the complete case and both original source companions; continue the accepted received edition.'}],
  inputs:['The complete prior preparation and its actual saved Installation row','The later complete original Econdb archive and project',
   'The current native Installation and original case','The complete attributed following review'],
  sourceFiles:[],preview:clone(preview)};
 return{following,prepared,source,scope,workorder:renderWorkorder(prepared),html:renderEcondbFollowing(comparison,review)};
}
export function renderEcondbFollowing(comparison,review=null){
 need(comparison?.schema===ECONDB_FOLLOWING+'.comparison','Select the complete original following comparison.');unseal(comparison);
 if(review)need(review.schema===ECONDB_FOLLOWING+'.review'&&review.comparisonSha256===comparison.sha256&&same(review.basis,comparison.basis),'Retain this comparison with its exact review.');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const decisions=new Map((review?.decisions??[]).map(r=>[r.key,r]));
 const rows=comparison.rows.map(row=>{
  const d=decisions.get(row.key),old=row.before?.entry,next=row.after?.entry;
  const selected=v=>v?JSON.stringify({port:v.current.request.locode,request:v.current.request,selection:v.selection,
   current:v.current.source,previous:v.previous?.source??null,summary:v.summary},null,2):'Absent in this project';
  return '<tr><td>'+esc(row.title)+'<br><code>'+esc(row.key)+'</code></td><td>'+esc(row.status)+'</td>'+
   '<td>'+esc(d?.disposition??'Awaiting review')+'<p>'+esc(d?.purpose)+'</p><p>'+esc(d?.note)+'</p></td>'+
   '<td><details><summary>Before</summary><pre>'+esc(selected(old))+'</pre></details>'+
   '<details><summary>Following</summary><pre>'+esc(selected(next))+'</pre></details></td></tr>';
 }).join('');
 const fileRows=comparison.files.map(f=>'<tr><td><code>'+esc(f.name)+'</code></td><td>'+esc(f.status)+'</td><td>'+
  esc(f.before?f.before.bytes+' bytes · '+f.before.sha256:'Absent')+'</td><td>'+
  esc(f.after?f.after.bytes+' bytes · '+f.after.sha256:'Absent')+'</td></tr>').join('');
 const fieldRows=comparison.fields.map(f=>{const d=review?.fields.find(r=>r.path===f.path);return'<tr><td>'+esc(f.path)+'<br>'+esc(f.status)+
  '</td><td>'+esc(f.current)+'</td><td>'+esc(d?.value??f.proposed)+'<p>'+esc(d?.note)+'</p></td></tr>';}).join('');
 const data={comparison,review};
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>Econdb customer following edition</title><style>body{font:16px/1.5 system-ui;color:#222;background:#fff;max-width:1200px;margin:auto;padding:24px}h1{font-size:1.7rem}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #bbb;text-align:left;padding:10px;vertical-align:top;overflow-wrap:anywhere}pre,code{overflow-wrap:anywhere;white-space:pre-wrap}pre{font-size:.85rem}details{margin:10px 0}.table{overflow:auto}small{display:block;margin-top:32px}@media(max-width:700px){body{padding:12px}table{min-width:680px}h1{font-size:1.4rem}}@media print{body{font-size:10pt}.table{overflow:visible}table{min-width:0}tr{break-inside:avoid}}</style>'+
  '<h1>Econdb customer following edition</h1><p>'+esc(comparison.meaning)+'</p><p>Installation '+esc(comparison.basis.installation.id)+
  ' · current revision '+comparison.basis.installation.revision+' · '+esc(Object.entries(comparison.totals).map(([k,v])=>k+': '+v).join(' · '))+'</p>'+
  '<h2>Complete project entries</h2><div class="table"><table><thead><tr><th>Entry</th><th>Source change</th><th>Scope decision</th><th>Original source and result</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<h2>Source and receiving choices</h2><div class="table"><table><thead><tr><th>Field</th><th>Current saved value</th><th>Selected following value</th></tr></thead><tbody>'+fieldRows+'</tbody></table></div>'+
  '<h2>Complete original project files</h2><div class="table"><table><thead><tr><th>File</th><th>Change</th><th>Before</th><th>Following</th></tr></thead><tbody>'+fileRows+'</tbody></table></div>'+
  '<h2>Original commercial Workshare</h2><p>'+esc(comparison.commercial.title)+' · '+esc(comparison.commercial.customer)+'</p><p>'+esc(comparison.commercial.commercial.currency)+' '+esc(comparison.commercial.commercial.amount)+' · '+esc(comparison.commercial.totalEffortHours)+' original delivery hours</p><details><summary>Complete commercial terms, phases and schedule</summary><pre>'+esc(JSON.stringify(comparison.commercial,null,2))+'</pre></details>'+
  '<h2>Original Workshare and operated fields</h2><p>'+esc(review?.commercialReview.note??'Review the following scope against the current original Workshare.')+'</p>'+
  '<details><summary>Complete preserved current document fields</summary><pre>'+esc(JSON.stringify(comparison.protectedFields,null,2))+'</pre></details>'+
  '<details><summary>Complete source comparison and attributed review</summary><pre>'+esc(JSON.stringify(data,null,2))+'</pre></details>'+
  '<small>TokenJunkieLabs · Complete original Econdb customer workflow</small></html>\n';
}
export function nativeEcondbFollowingInput(result,input){
 need(result?.following?.schema===ECONDB_FOLLOWING+'.prepared','Retain the complete original following preparation.');
 const actual=prepareEcondbFollowing(input);
 need(same(result.following,actual.following),'The following preparation differs from its full original inputs.');
 const clean=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='sha256'));
 const bodies={before:input.before,after:input.after,priorPreparation:input.priorPreparation,
  priorInstallation:input.priorInstallation,installation:input.installation,lineage:input.lineage,commercial:input.commercial};
 return bounded({schema:ECONDB_FOLLOWING+'.native-input',following:clone(result.following),
  ...clone(bodies),caseSource:caseSource(input.caseValue),
  proofs:{following:econdbFollowingCanonical(clean(result.following)),
   comparison:econdbFollowingCanonical(clean(result.following.comparison)),
   ...Object.fromEntries(Object.entries(bodies).map(([key,value])=>[key,econdbFollowingCanonical(value)]))}},
  'complete native following preparation');
}
