// MIT. Complete following catalogue comparison; no catalogue or Installation writer.
import {openText,canonical,compareEditions} from '../recipient/core.mjs';
import {sha256Utf8,sha256Bytes} from '../recipient/sha256.mjs';
export const FOLLOWING='stellar-forge.material-installation-following.v1';
const clone=v=>JSON.parse(JSON.stringify(v));
const need=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b)=>canonical(a)===canonical(b);
const sha=v=>sha256Utf8(canonical(v)).sha256;
const FIELDS={source:['reference','population','meaning','authority','changePolicy'],receiving:['application','host','operator','acceptanceRule','changeAndWithdraw','recovery','maintenance']};
const key=r=>canonical(Object.fromEntries(Object.entries(r).filter(([k])=>!['record','record_json'].includes(k))));
const digestRecord=r=>sha(r.record);
function open(raw,meta){
 need(raw instanceof Uint8Array&&raw.length<=128*1024*1024,'Retain a complete original catalogue up to 128 MiB.');
 need(same(sha256Bytes(raw),{bytes:meta.bytes,sha256:meta.sha256}),'The selected complete original catalogue changed.');
 return openText(new TextDecoder('utf-8',{fatal:true}).decode(raw),{name:meta.filename||'customer-catalog.jsonl'});
}
function context(input){
 const f=input.following;
 need(f?.schema===FOLLOWING+'.input'&&f.installation&&f.previousSource&&f.source,'Retain the complete saved Installation and both source identities.');
 const installation=f.installation,document=installation.preview?.document,source=input.seed.source;
 need(installation.id===input.seed.installationId&&installation.revision===input.seed.expectedRevision&&same(document,input.seed.document),'The saved Installation input changed.');
 need(installation.preview.source.caseId===source.caseId,'Keep the same original Installation case.');
 need((document.source.sourceIds.includes(f.previousSource.id)||document.receiving.sourceIds.includes(f.previousSource.id)),'Select an original catalogue actually bound to this saved Installation.');
 need(f.previousSource.id!==f.source.id&&f.previousSource.sha256!==f.source.sha256,'Select the distinct complete following catalogue.');
 for(const selected of [f.previousSource,f.source]){
  const original=input.caseSnapshot.sources.find(s=>s.id===selected.id);
  need(original&&original.sha256===selected.sha256&&original.bytes===selected.bytes,'The selected attached source identity changed.');
 }
 const head=input.caseSnapshot.installations?.find(r=>r.id===installation.id);
 need(head&&head.revision===installation.revision&&head.sha256===installation.sha256,'The saved target differs from the complete current case Installation head.');
 const before=open(input.previousBundleBytes,f.previousSource),after=open(input.bundleBytes,f.source);
 need(before.catalog.id===after.catalog.id&&before.catalog.tenantId===after.catalog.tenantId,'Follow the same original catalogue and tenant.');
 need(after.catalog.revision>before.catalog.revision&&after.catalog.activeEditionId!==before.catalog.activeEditionId,'Select a later catalogue revision with a different active edition.');
 const heads={catalog_catalogs:'catalog_history',catalog_decisions:'catalog_decision_history',catalog_supplier_plans:'catalog_supplier_plan_history',catalog_supplier_corrections:'catalog_supplier_correction_history'};
 const retained={};
 for(const [name,rows]of Object.entries(before.tables)){
  const target=after.tables[heads[name]||name]||[];
  const actual=new Set(target.map(digestRecord));
  for(const row of rows)need(actual.has(digestRecord(row)),'The following catalogue must retain every original '+name+' record and history.');
  retained[name]=rows.length;
 }
 for(const [id,original]of before.sources){
  const next=after.sources.get(id);
  need(next&&same(original.manifest,next.manifest)&&same(sha256Bytes(original.bytes),sha256Bytes(next.bytes)),'Retain every exact original supplier source: '+id);
 }
 const comparison=compareEditions(after,before.catalog.activeEditionId,after.catalog.activeEditionId);
 const basis={caseSource:clone(source),installation:{id:installation.id,revision:installation.revision,sha256:installation.sha256},
  previousSource:clone(f.previousSource),source:clone(f.source),documentSha256:sha(document),
  before:{catalogId:before.catalog.id,revision:before.catalog.revision,activeEditionId:before.catalog.activeEditionId},
  after:{catalogId:after.catalog.id,revision:after.catalog.revision,activeEditionId:after.catalog.activeEditionId}};
 return {f,document,before,after,comparison,basis,retained};
}
export function compareMaterialFollowing(input){
 const b=context(input);
 const reference='Original catalogue '+b.after.catalog.id+' revision '+b.after.catalog.revision+'; active edition '+b.after.catalog.activeEditionId+'; complete bundle SHA-256 '+b.after.identity.sha256+'.';
 const fields=[];
 for(const [section,names]of Object.entries(FIELDS))for(const name of names){
  const current=b.document[section][name]??'';
  fields.push({path:section+'.'+name,current,proposed:section==='source'&&name==='reference'?reference:current});
 }
 const bindings=['source','receiving'].map(section=>({section,current:clone(b.document[section].sourceIds),
  proposed:[...new Set([...b.document[section].sourceIds,b.f.source.id])]}));
 const value={schema:FOLLOWING+'.comparison',basis:b.basis,retained:b.retained,
  catalogue:{before:clone(b.before.catalog),after:clone(b.after.catalog)},counts:b.comparison.counts,
  rows:clone(b.comparison.rows),fields,bindings,currentDocument:clone(b.document),
  meaning:'Catalogue differences and commissioning scope review only. These choices do not approve supplier/business evaluations or alter native material decisions.'};
 return {...value,sha256:sha(value)};
}
export function materialFollowingTemplate(input){
 const comparison=compareMaterialFollowing(input);
 return {schema:FOLLOWING+'.template',comparison,review:{schema:FOLLOWING+'.review',comparisonSha256:comparison.sha256,
  basis:clone(comparison.basis),actor:'',observedAt:'',scopeNote:'',scopeFitsCurrentWorkshare:false,
  decisions:comparison.rows.map(r=>({key:r.key,beforeSha256:r.before?.sha256??null,afterSha256:r.after?.sha256??null,
   disposition:null,note:'',reviewed:false})),
  fields:comparison.fields.map(r=>({path:r.path,choice:'current',value:r.current,note:'',reviewed:false})),
  bindings:comparison.bindings.map(r=>({section:r.section,sourceIds:clone(r.proposed),note:'',reviewed:false})),
  completeSourceReview:{reviewed:false,note:''}}};
}
export function prepareMaterialFollowing(input){
 const comparison=compareMaterialFollowing(input),review=input.following.review;
 need(review?.schema===FOLLOWING+'.review'&&review.comparisonSha256===comparison.sha256&&same(review.basis,comparison.basis),'The case, Installation, old/new source or complete comparison changed. Preserve this review and compare fresh originals.');
 need(sha256Utf8(canonical(review)).bytes<=16*1024*1024,'Keep the complete following review within 16 MiB.');
 const text=(v,m,max=4000)=>need(typeof v==='string'&&v.trim()&&v.length<=max,m);
 text(review.actor,'Name the actual reviewing operator.',300);
 need(typeof review.observedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(review.observedAt)&&/(Z|[+-]\d\d:\d\d)$/.test(review.observedAt)&&Number.isFinite(Date.parse(review.observedAt)),'Record a valid attributed review time with timezone.');
 need(review.scopeFitsCurrentWorkshare===true,'Confirm this source scope fits the unchanged original Workshare; amend commercial terms in its original workflow.');
 text(review.scopeNote,'Explain the continued original scope.');
 need(review.completeSourceReview?.reviewed===true,'Review all original sources, retained history and material differences.');
 text(review.completeSourceReview.note,'Record the complete source review.');
 function rows(values,key,expected,label){
  need(Array.isArray(values)&&values.length===expected.length&&new Set(values.map(v=>v?.[key])).size===values.length,'Review each '+label+' exactly once.');
  return new Map(values.map(v=>[v[key],v]));
 }
 const decisions=rows(review.decisions,'key',comparison.rows,'material scope');
 for(const row of comparison.rows){
  const d=decisions.get(row.key);
  need(d?.reviewed===true&&d.beforeSha256===(row.before?.sha256??null)&&d.afterSha256===(row.after?.sha256??null)&&
   (row.after?['retained','out-of-scope']:['removed']).includes(d.disposition),'Explicitly review the exact original material scope: '+row.materialId);
  if(row.change!=='unchanged'||d.disposition!=='retained')text(d.note,'Explain changed, removed or out-of-scope material '+row.materialId);
 }
 const document=clone(comparison.currentDocument),fields=rows(review.fields,'path',comparison.fields,'source/receiving field');
 for(const row of comparison.fields){
  const d=fields.get(row.path);
  need(d?.reviewed===true&&['current','proposed','edited'].includes(d.choice)&&typeof d.value==='string'&&d.value.length<=4000,'Review each source and receiving value.');
  if(d.choice!=='edited')need(d.value===row[d.choice],'Preserve the exact selected field value.');
  if(d.value!==row.current||d.choice==='edited')text(d.note,'Explain the changed receiving/source declaration: '+row.path);
  const [section,name]=row.path.split('.');document[section][name]=d.value;
 }
 const bindings=rows(review.bindings,'section',comparison.bindings,'source binding');
 for(const row of comparison.bindings){
  const d=bindings.get(row.section);
  need(d?.reviewed===true&&Array.isArray(d.sourceIds)&&d.sourceIds.length<=100&&new Set(d.sourceIds).size===d.sourceIds.length&&
   d.sourceIds.includes(input.following.source.id),'Explicitly bind the following source to source and receiving.');
  for(const id of d.sourceIds)need(input.caseSnapshot.sources.some(s=>s.id===id),'A selected original source binding is absent.');
  text(d.note,'Explain retained/replaced original '+row.section+' bindings.');
  document[row.section].sourceIds=clone(d.sourceIds);
 }
 for(const [name,value]of Object.entries(comparison.currentDocument))if(!Object.hasOwn(FIELDS,name))
  need(same(document[name],value),'Keep the complete current '+name+' unchanged.');
 const result={schema:FOLLOWING+'.prepared',comparison,review:clone(review),document,
  installation:clone(input.following.installation),
  preview:{expectedVersion:input.seed.source.version,installationId:input.seed.installationId,
   expectedRevision:input.seed.expectedRevision,document:clone(document)}};
 return {...result,sha256:sha(result)};
}
