// SPDX-License-Identifier: MIT
/** Following catalogue editions; original Source Desk and Installation remain the writers. */
import {dcatInstallationSame as same,dcatInstallationIdentity as identity,
 dcatInstallationSha as sha,dcatInstallationCanonical as canonical,validateDcatInstallationSource,DCAT_INSTALLATION_FAMILIES as FAMILIES,
 dcatInstallationNeed as need} from './dcat-installation-core.mjs';
import {renderWorkorder} from './prepare-core.mjs';
export const FOLLOWING='stellar-forge.dcat-installation-following.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const HASH=/^[a-f0-9]{64}$/;
const maximum=8*1024*1024;
const exact=(v,keys,label)=>need(object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'Retain every '+label+' field.');
const bounded=(v,label)=>{need(Buffer.byteLength(JSON.stringify(v,null,2)+'\n')<=maximum,'The complete '+label+' exceeds 8 MiB. Preserve it without truncation.');return v;};
const seal=value=>bounded({...value,sha256:identity(value)},'following review');
const selectedSource=(record,id,expected,label)=>{
 const rows=record.sources.filter(r=>r.id===id);
 need(rows.length===1&&rows[0].bytes===expected.bytes&&rows[0].sha256===expected.sha256,
  'Retain the complete '+label+' in the same original case.');
 return rows[0];
};
const text=(v,label,limit=4000)=>{need(typeof v==='string'&&v.length<=limit&&!v.includes('\0')&&v.trim().length>0,'Record the complete '+label+'.');return v;};
function binding(input){
 const {before,after,priorPreparation,installation,caseValue}=input;
 validateDcatInstallationSource(before);validateDcatInstallationSource(after);
 need(object(caseValue?.program)&&Array.isArray(caseValue.sources)&&Array.isArray(caseValue.installations),'Use the complete current original Operations case.');
 need(installation?.id&&Number.isSafeInteger(installation.revision)&&installation.revision>=1&&HASH.test(installation.sha256??'')&&object(installation.preview?.document),
  'Select the complete saved original Installation revision.');
 const head=caseValue.installations.find(r=>r.id===installation.id);
 need(head&&head.revision===installation.revision&&head.sha256===installation.sha256,
  'The Installation has another current edition. Reopen it before following this catalogue.');
 need(installation.preview.source?.caseId===caseValue.program.id,'The original Installation belongs to another case.');
 const scope=priorPreparation?.scope,document=installation.preview.document;
 need(priorPreparation?.type==='prepare'&&object(scope)&&object(priorPreparation.installation)&&scope.schema==='stellar-forge.dcat-installation-scope.v1',
  'Retain the complete original preparation result and its saved scope.');
 need(scope.originalCase?.caseId===caseValue.program.id&&scope.workshare?.caseId===document.workshare?.caseId&&same(scope.workshare,priorPreparation.installation.workshare),
  'Keep the same original case and Workshare identity.');
 need(scope.sourceSha256===before.sourceSha256&&scope.manifestSha256===before.manifestSha256&&same(scope.project,before.project),
  'The prior preparation belongs to another complete catalogue source.');
 need(scope.archive.bytes===before.archive.bytes&&scope.archive.sha256===before.archive.sha256,
  'The complete prior archive differs from its selected scope.');
 for(const key of ['createdAt','catalogOrigin','sourceKind'])
  need(before.project[key]===after.project[key],'The later archive has a different original project '+key+'. No catalogue identity is inferred from a name.');
 const archive=selectedSource(caseValue,scope.archive.sourceId,scope.archive,'prior archive');
 need(archive.dcatWorkspace&&archive.dcatWorkspace.manifestSha256===before.manifestSha256,'Retain the original prior DCAT transport receipt.');
 selectedSource(caseValue,scope.selection.sourceId,scope.selection,'prior scope selection');
 const sourceIds=new Set([...(document.source?.sourceIds??[]),...(document.receiving?.sourceIds??[])]);
 need([scope.archive.sourceId,scope.selection.sourceId].every(id=>sourceIds.has(id)),
  'The saved Installation does not retain this exact prior archive and scope.');
 const later=selectedSource(caseValue,input.afterArchiveSourceId,after.archive,'later archive');
 need(later.dcatWorkspace&&later.dcatWorkspace.manifestSha256===after.manifestSha256,'Retain the original later DCAT transport receipt.');
 const records=scope.records;
 need(Array.isArray(records)&&records.length===before.records.length&&new Set(records.map(r=>r.key)).size===records.length,
  'Retain the entire original prior scope, including contextual records.');
 const old=new Map(before.records.map(r=>[r.key,r])),choices=new Map();
 for(const row of records){
  exact(row,['key','recordSha256','included','purpose'],'prior scope decision');
  need(old.get(row.key)?.recordSha256===row.recordSha256&&typeof row.included==='boolean','The prior scope record changed.');
  text(row.purpose,'prior scope purpose');choices.set(row.key,clone(row));
 }
 need(same(scope.records,priorPreparation.scope.records),'Preserve the complete original scope.');
 return{scope,document,choices,basis:{caseId:caseValue.program.id,
  installation:{id:installation.id,revision:installation.revision,sha256:installation.sha256},
  before:{sourceSha256:before.sourceSha256,archive:clone(scope.archive),manifestSha256:before.manifestSha256},
  after:{sourceSha256:after.sourceSha256,archive:{sourceId:later.id,...clone(after.archive)},manifestSha256:after.manifestSha256},
  priorPreparation:{requestId:priorPreparation.requestId,sha256:identity(priorPreparation)},
  priorScopeSha256:identity(scope)}};
}
function fileChanges(a,b){
 const old=new Map((a?.files??[]).map(r=>[r.path,r])),next=new Map((b?.files??[]).map(r=>[r.path,r]));
 return [...new Set([...old.keys(),...next.keys()])].sort().map(path=>{
  const before=old.get(path)??null,after=next.get(path)??null;
  return{path,status:!before?'NEW':!after?'MISSING':same(before,after)?'UNCHANGED':'CHANGED',before:clone(before),after:clone(after)};
 });
}
export function compareDcatFollowing(input){
 const {basis,choices}=binding(input),old=new Map(input.before.records.map(r=>[r.key,r])),next=new Map(input.after.records.map(r=>[r.key,r]));
 const rows=[...new Set([...old.keys(),...next.keys()])].sort().map(key=>{
  const before=old.get(key)??null,after=next.get(key)??null;
  const status=!before?'NEW':!after?'MISSING':before.recordSha256===after.recordSha256?'UNCHANGED':'CHANGED';
  return{key,family:(after??before).family,label:(after??before).label,status,
   before:before?{recordSha256:before.recordSha256,state:before.state}:null,
   after:after?{recordSha256:after.recordSha256,state:after.state}:null,
   previous:choices.get(key)??null,files:fileChanges(before,after)};
 });
 return seal({schema:FOLLOWING+'.comparison',basis,rows,totals:Object.fromEntries(['UNCHANGED','CHANGED','NEW','MISSING'].map(s=>[s,rows.filter(r=>r.status===s).length])),
  families:FAMILIES.map(family=>({family,records:rows.filter(r=>r.family===family).length})),
  qualification:'Source scope review does not establish commissioned acceptance, completed work, eligibility, a new fee or payment.'});
}
export function dcatFollowingTemplate(input){
 const comparison=compareDcatFollowing(input);
 const review={schema:FOLLOWING+'.review',comparisonSha256:comparison.sha256,basis:clone(comparison.basis),
  decisions:comparison.rows.map(row=>({key:row.key,beforeSha256:row.before?.recordSha256??null,afterSha256:row.after?.recordSha256??null,
   disposition:row.status==='UNCHANGED'?(row.previous.included?'included':'context'):row.status==='MISSING'?'missing':null,
   purpose:row.status==='UNCHANGED'?row.previous.purpose:'',note:'',reviewed:row.status==='UNCHANGED'})),
  amendments:{source:{},receiving:{}}};
 return{comparison,review:bounded(review,'editable following review')};
}
function resolvedReview(input,raw){
 need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=maximum,'Retain the entire UTF-8 following review within 8 MiB.');
 let review;try{review=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{need(false,'Use the complete valid UTF-8 review JSON.');}
 exact(review,['schema','comparisonSha256','basis','decisions','amendments'],'following review');
 const comparison=compareDcatFollowing(input);
 need(review.schema===FOLLOWING+'.review'&&review.comparisonSha256===comparison.sha256&&same(review.basis,comparison.basis),
  'The prior Installation or complete catalogue comparison changed. Preserve this review and prepare against the selected original versions.');
 need(Array.isArray(review.decisions)&&review.decisions.length===comparison.rows.length&&new Set(review.decisions.map(r=>r.key)).size===comparison.rows.length,
  'Review every original changed, new, missing and unchanged record once.');
 const byKey=new Map(review.decisions.map(r=>[r.key,r])),records=[];
 for(const row of comparison.rows){
  const d=byKey.get(row.key);
  exact(d,['key','beforeSha256','afterSha256','disposition','purpose','note','reviewed'],'scope decision');
  need(d.beforeSha256===(row.before?.recordSha256??null)&&d.afterSha256===(row.after?.recordSha256??null)&&d.reviewed===true,'Explicitly review the exact original record editions.');
  need((row.status==='MISSING'?['missing']:['included','context']).includes(d.disposition),'A missing original record remains missing; choose included or context only for a present record.');
  text(d.purpose,'scope purpose');
  need(typeof d.note==='string'&&d.note.length<=4000&&!d.note.includes('\0'),'Retain the complete scope change note.');
  if(row.status!=='UNCHANGED'||d.disposition!==(row.previous.included?'included':'context')||d.purpose!==row.previous.purpose)text(d.note,'reason for this scope decision');
  if(row.after)records.push({key:row.key,recordSha256:row.after.recordSha256,included:d.disposition==='included',purpose:d.purpose});
 }
 need(records.some(r=>r.included),'Select at least one present catalogue record for the continuing Installation.');
 exact(review.amendments,['source','receiving'],'source amendment');
 const allowed={source:['reference','population','meaning','authority','changePolicy'],
  receiving:['application','host','operator','acceptanceRule','changeAndWithdraw','recovery','maintenance']};
 for(const [section,keys]of Object.entries(allowed)){
  need(object(review.amendments[section])&&Object.keys(review.amendments[section]).every(k=>keys.includes(k)),'Amend only declared '+section+' text; preserve every original commercial and operated field.');
  for(const [key,value]of Object.entries(review.amendments[section]))text(value,section+'.'+key);
 }
 return{review,comparison,records};
}
export function prepareDcatFollowing(input){
 const {reviewRaw,reviewSourceId}=input,{scope:priorScope,document:original,basis}=binding(input);
 const {review,comparison,records}=resolvedReview(input,reviewRaw);
 const selected={sourceId:reviewSourceId,bytes:reviewRaw.length,sha256:sha(reviewRaw)};
 selectedSource(input.caseValue,reviewSourceId,selected,'following review');
 const document=clone(original);
 need(document.source.mode==='SNAPSHOT','Use the retained snapshot Installation source behavior.');
 for(const section of ['source','receiving']){
  Object.assign(document[section],review.amendments[section]);
  document[section].sourceIds=[...new Set([...original[section].sourceIds,
   priorScope.archive.sourceId,priorScope.selection.sourceId,input.afterArchiveSourceId,reviewSourceId])];
 }
 for(const key of Object.keys(original).filter(k=>!['source','receiving'].includes(k)))need(same(document[key],original[key]),'Preserve the original '+key+'.');
 need(Buffer.byteLength(JSON.stringify(document,null,2)+'\n')<=128*1024,'The complete successor Installation exceeds 128 KiB.');
 const source={...clone(input.installation.preview.source),version:input.caseValue.program.version,
  mode:input.caseValue.program.mode,planId:input.caseValue.program.planId,
  planRevision:input.caseValue.plan.revision,planContentSha256:input.caseValue.plan.contentSha256,
  planSourceSha256:input.caseValue.plan.source.sha256};
 const snapshot={schema:'stellar-forge.dcat-installation-scope.v1',originalCase:source,workshare:clone(document.workshare),
  sourceSha256:input.after.sourceSha256,project:clone(input.after.project),manifestSha256:input.after.manifestSha256,
  archive:clone(basis.after.archive),selection:selected,records,
  completeSource:{records:input.after.records.length,members:input.after.totals.members,bytes:input.after.totals.bytes},
  qualification:comparison.qualification};
 const following=seal({schema:FOLLOWING+'.prepared',basis,review:clone(review),reviewSource:selected,comparison,
  previousScope:clone(priorScope),previousInstallation:clone(input.installation),currentCaseVersion:input.caseValue.program.version,
  scope:snapshot,document,preview:{expectedVersion:input.caseValue.program.version,installationId:input.installation.id,
   expectedRevision:input.installation.revision,document:clone(document)}});
 const prepared={schema:'stellar-forge.installation-workorder-preparation.v1',profile:'dcat-catalogues',source,
  workshareCaseId:document.workshare.caseId,document,selections:[],
  implementation:[{title:'Receive both complete catalogue projects',result:'Use the original archives and retained source receipts. No original file is dropped.'},
   {title:'Review the following edition',result:'Preserve every explicit scope decision and original record identity.'},
   {title:'Save through the original Installation writer',result:'Preview this same Installation ID and revision, then retain the original save request and accepted receipt.'}],
  inputs:['The original and later complete .ckanw archives','The exact saved Installation revision and original preparation','The full attributed following-scope review'],
  sourceFiles:[],preview:clone(following.preview)};
 return{following,prepared,scope:snapshot,workorder:renderWorkorder(prepared)};
}
export function renderDcatFollowing(comparison,review=null){
 const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const decisions=new Map((review?.decisions??[]).map(r=>[r.key,r]));
 const body=comparison.rows.map(row=>{const d=decisions.get(row.key);return '<tr><td>'+esc(row.family)+'<br>'+esc(row.label)+'<details><summary>Original identity</summary><code>'+esc(row.key)+'</code></details></td><td>'+esc(row.status)+'</td><td>'+esc(row.previous?.purpose??'New record')+'</td><td>'+esc(d?.disposition??'Awaiting review')+'<br>'+esc(d?.purpose)+'<p>'+esc(d?.note)+'</p></td><td>'+row.files.filter(f=>f.status!=='UNCHANGED').map(f=>esc(f.status)+' · '+esc(f.path)).join('<br>')+'</td></tr>';}).join('');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalogue following edition</title><style>body{font:16px/1.5 system-ui;color:#222;background:#fff;max-width:1200px;margin:auto;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;text-align:left;padding:10px;vertical-align:top}code,pre{overflow-wrap:anywhere;white-space:pre-wrap}.table{overflow:auto}details{margin:12px 0}@media(max-width:700px){body{padding:12px}table{min-width:700px}}@media print{body{font-size:10pt}.table{overflow:visible}tr{break-inside:avoid}}</style><h1>Catalogue following edition</h1><p>Installation revision '+esc(comparison.basis.installation.revision)+' · '+esc(comparison.rows.length)+' complete source records</p><p>'+esc(comparison.qualification)+'</p><p>'+Object.entries(comparison.totals).map(([k,v])=>esc(k)+': '+v).join(' · ')+'</p><div class="table"><table><thead><tr><th>Record</th><th>Change</th><th>Prior purpose</th><th>Following decision</th><th>Original file changes</th></tr></thead><tbody>'+body+'</tbody></table></div><details><summary>Complete comparison and exact decisions</summary><pre>'+esc(JSON.stringify({comparison,review},null,2))+'</pre></details></html>\n';
}

/** Exact canonical UTF-8 proofs let the native Python reader verify Node hashes
 * without reinterpreting decimal notation, Unicode ordering or typed originals. */
export function nativeDcatFollowingInput(result,input){
 const source=value=>{const {sourceSha256,...body}=value;return{
  sourceSha256,canonical:canonical(body),records:value.records.map(row=>{
   const {recordSha256,...record}=row;return{key:row.key,sha256:recordSha256,canonical:canonical(record)};
  })};};
 return bounded({schema:FOLLOWING+'.native-input',following:clone(result.following),
  before:source(input.before),after:source(input.after),priorPreparation:clone(input.priorPreparation),
  proofs:{following:canonical(Object.fromEntries(Object.entries(result.following).filter(([k])=>k!=='sha256'))),
   comparison:canonical(Object.fromEntries(Object.entries(result.following.comparison).filter(([k])=>k!=='sha256'))),
   priorPreparation:canonical(input.priorPreparation),priorScope:canonical(result.following.previousScope)}},
  'complete native following preparation');
}
