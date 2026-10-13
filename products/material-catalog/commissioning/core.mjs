// MIT. Complete retained material customer source joins the existing SF47 preparer.
import {openText,canonical} from '../recipient/core.mjs';
import {sha256Utf8,sha256Bytes} from '../recipient/sha256.mjs';
import {bindingTemplate,prepareInstallation,renderWorkorder} from '../../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/prepare-core.mjs';
import {commercialWorkshare,commercialMarkdown,commercialHtml} from '../../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/commercial-workshare-core.mjs';
export const SCHEMA='stellar-forge.material-customer-installation.v1';
export const PROFILE='supplier-catalogues';
export const need=(ok,message)=>{if(!ok)throw Error(message);};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
export const same=(a,b)=>canonical(a)===canonical(b);
export const identity=bytes=>sha256Bytes(bytes);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const text=(x,label,max=4000)=>{need(typeof x==='string'&&x.trim()&&x.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x),'Select a complete bounded '+label+'.');return x;};
export function parseJson(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
export function inspectMaterialSource(bytes,expectedSha256){
 need(bytes instanceof Uint8Array&&bytes.length<=256*1024*1024&&hex(expectedSha256),'Select a complete customer bundle up to 256 MiB with its SHA-256.');
 const actual=identity(bytes);need(actual.sha256===expectedSha256,'The selected complete customer bundle differs.');
 const bundle=openText(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{name:'customer-catalog.jsonl'});
 need(bundle.identity.bytes===actual.bytes&&bundle.identity.sha256===actual.sha256,'Original UTF-8 bundle identity differs.');
 return bundle;
}
function documents(input){
 const {seed,caseSnapshot,profile,commissioning,commissioningBytes,packetBytes}=input;
 need(object(seed)&&object(seed.source)&&object(seed.document)&&object(seed.document.workshare),'Use the complete original installation-workshare-seed.');
 need(profile?.id===PROFILE,'Use the unchanged maintained supplier-catalogues profile.');
 need(object(caseSnapshot?.program)&&Array.isArray(caseSnapshot.sources),'Read the complete original Operations case.');
 const p=caseSnapshot.program;
 need(p.id===seed.source.caseId&&p.version===seed.source.version&&p.planId===seed.source.planId,
  'The original operating case/version or selected plan differs from this Workshare seed.');
 const seen=new Set();
 for(const row of caseSnapshot.sources){
  need(object(row)&&typeof row.id==='string'&&row.id&&!seen.has(row.id)&&hex(row.sha256)&&Number.isSafeInteger(row.bytes)&&row.bytes>=0,
   'Keep complete unique current case source descriptors.');seen.add(row.id);
 }
 const binding=seed.document.workshare;
 const bound=(id,sha,raw,label)=>{
  const row=caseSnapshot.sources.find(x=>x.id===id);need(row&&row.sha256===sha&&raw instanceof Uint8Array,
   'Retain the original attached '+label+' and its selected native source ID.');
  const value=identity(raw);need(value.bytes===row.bytes&&value.sha256===sha,'The complete original '+label+' differs from the native attachment.');
 };
 bound(binding.sourceId,binding.sourceSha256,commissioningBytes,'Workshare commissioning source');
 need(same(parseJson(commissioningBytes),commissioning),'Use the exact retained commissioning source.');
 if(binding.packetSourceId!==null&&binding.packetSourceId!==undefined)bound(binding.packetSourceId,binding.packetSha256,packetBytes,'receiving packet');
 else need(packetBytes===null||packetBytes===undefined,'An additional receiving packet needs its original native Workshare binding.');
 const commercial=commercialWorkshare({seed,commissioning,profile});
 need(commercial.caseId===binding.caseId,'Preserve the selected original commercial case.');
 return {commercial,binding};
}
function matching(input,bundle){
 const candidates=raw=>{const value=identity(raw);return input.caseSnapshot.sources.filter(x=>x.bytes===value.bytes&&x.sha256===value.sha256).sort((a,b)=>a.id.localeCompare(b.id));};
 const files=[{path:'source/customer-catalog.jsonl',role:'complete material customer bundle',...identity(input.bundleBytes),candidates:candidates(input.bundleBytes)}];
 for(const f of input.attachments??[]){
  need(typeof f.path==='string'&&f.path.startsWith('attachments/')&&typeof f.purpose==='string'&&f.purpose.trim()&&f.bytes instanceof Uint8Array,
   'Retain each complete additional source file with its purpose.');
  files.push({path:f.path,role:f.purpose,...identity(f.bytes),candidates:candidates(f.bytes)});
 }
 const paths=new Set();for(const f of files){need(!paths.has(f.path),'Select each original attachment once.');paths.add(f.path);}
 return {files:files.map(f=>({...f,sourceId:f.candidates[0]?.id??null,matchingSourceIds:f.candidates.map(x=>x.id),candidates:undefined})),
  missing:files.filter(f=>!f.candidates.length).map(({candidates,...f})=>f)};
}
function selected(bundle,selection){
 need(object(selection)&&selection.schema===SCHEMA+'.selection','Use the original material-customer selection.');
 const keys=['schema','operationId','catalogId','catalogRevision','activeEditionId','bundleSha256','supplierPlanId','supplierPlanRevision','supplierReviewId'];
 need(Object.keys(selection).length===keys.length&&Object.keys(selection).every(k=>keys.includes(k)),'Retain the exact declared material-customer selection fields.');
 text(selection.operationId,'operation ID',200);
 need(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(selection.operationId),'Use a stable plain operation ID.');
 need(selection.catalogId===bundle.catalog.id&&selection.catalogRevision===bundle.catalog.revision&&
  selection.activeEditionId===bundle.catalog.activeEditionId&&selection.bundleSha256===bundle.identity.sha256,
  'The selected original catalogue revision, active edition or complete bundle changed.');
 let plan=null,review=null;
 if(selection.supplierPlanId===null){
  need(selection.supplierPlanRevision===null&&selection.supplierReviewId===null,'Select a plan before choosing its review.');
 }else{
  plan=bundle.tables.catalog_supplier_plans.find(x=>x.id===selection.supplierPlanId)?.record;
  need(plan&&plan.revision===selection.supplierPlanRevision,'Select the retained current supplier plan and its exact revision.');
  if(selection.supplierReviewId!==null){
   review=bundle.tables.catalog_supplier_reviews.find(x=>x.id===selection.supplierReviewId)?.record;
   need(review&&review.planId===plan.id,'Select a complete retained review for that original supplier plan.');
  }
 }
 return {selection:clone(selection),supplierPlan:plan?clone(plan):null,supplierReview:review?clone(review):null};
}
export function materialInstallationTemplate(input){
 const bundle=inspectMaterialSource(input.bundleBytes,input.expectedBundleSha256),d=documents(input),m=matching(input,bundle);
 const bindings=bindingTemplate(input.seed,input.profile),plan=d.commercial.originalPlan;
 bindings.task={name:plan.title,purpose:plan.outcome,request:plan.phases.map(p=>p.title+': '+p.description).join('\n\n'),completeOutput:plan.outcome};
 bindings.source.reference='Original catalogue '+bundle.catalog.id+' revision '+bundle.catalog.revision+'; active edition '+bundle.catalog.activeEditionId+'; complete customer bundle SHA-256 '+bundle.identity.sha256+'. Original commercial Workshare '+d.commercial.caseId+'.';
 bindings.source.authority=input.seed.document.source.authority;
 bindings.source.sourceIds=m.files.filter(x=>x.sourceId).map(x=>x.sourceId);
 bindings.receiving.sourceIds=[...bindings.source.sourceIds];
 const selection={schema:SCHEMA+'.selection',operationId:input.operationId,catalogId:bundle.catalog.id,catalogRevision:bundle.catalog.revision,
  activeEditionId:bundle.catalog.activeEditionId,bundleSha256:bundle.identity.sha256,supplierPlanId:null,supplierPlanRevision:null,supplierReviewId:null};
 selected(bundle,selection);
 return {schema:SCHEMA+'.template',selection,bindings,missingSources:m.missing,sourceBindings:m.files,
  supplierPlans:bundle.tables.catalog_supplier_plans.map(x=>({id:x.id,revision:x.revision,title:x.record.title??x.record.name??x.id})),
  supplierReviews:bundle.tables.catalog_supplier_reviews.map(x=>({id:x.id,planId:x.record.planId,editionId:x.record.editionId,createdAt:x.record.createdAt})),
  summary:clone(bundle.summary),commercialCaseId:d.commercial.caseId};
}
export function prepareMaterialInstallation(input){
 const bundle=inspectMaterialSource(input.bundleBytes,input.expectedBundleSha256),d=documents(input),m=matching(input,bundle),s=selected(bundle,input.selection);
 need(m.missing.length===0,'Attach each selected complete bundle/additional source file to the original case, then receive a fresh case and Workshare seed.');
 const bindings=clone(input.bindings);
 for(const k of ['name','purpose','request','completeOutput'])text(bindings.task?.[k],'explicit scoped task '+k,k==='request'?8000:4000);
 need(bindings.workshareCaseId===d.commercial.caseId,'Keep the selected original Workshare case.');
 for(const section of ['source','receiving']){
  bindings[section]??={};const prior=bindings[section].sourceIds??[];
  need(Array.isArray(prior),'Select the complete source IDs.');bindings[section].sourceIds=[...new Set([...prior,...m.files.map(x=>x.sourceId)])];
 }
 const prepared=prepareInstallation(input.seed,input.profile,bindings);
 for(const section of ['source','receiving','payment']){
  const key=section==='payment'?'termsSourceIds':'sourceIds';
  for(const id of prepared.document[section][key])need(input.caseSnapshot.sources.some(x=>x.id===id),'The selected source ID is absent from this original case.');
 }
 for(const f of prepared.document.payment.facilitators??[])for(const id of f.sourceIds??[])
  need(input.caseSnapshot.sources.some(x=>x.id===id),'A selected facilitator source is absent from this original case.');
 const source={
  schema:SCHEMA+'.source',operationId:s.selection.operationId,selection:s.selection,
  installationSource:clone(prepared.source),workshare:clone(input.seed.document.workshare),
  bundle:clone(bundle.summary),catalogue:clone(bundle.catalog),
  editions:bundle.tables.catalog_editions.map(x=>clone(x.record)),
  sources:[...bundle.sources.values()].map(x=>({record:clone(x.manifest),path:'original-sources/'+x.manifest.id+'.bin',...identity(x.bytes)})),
  sourceBindings:m.files,supplierPlan:s.supplierPlan,supplierReview:s.supplierReview,
  counts:Object.fromEntries(Object.entries(bundle.tables).map(([name,rows])=>[name,rows.length])),
  boundaries:{profileEvaluation:'Retained review outcome; evaluation belongs to the original native supplier engine.',
   commercial:'Original selected Workshare terms, phases, funding and OPEN observations are retained.',
   preparation:'Native preview/save and independent Operations receiving remain the original writer.'}
 };
 return {schema:SCHEMA,prepared,bindings,source,commercial:d.commercial,workorder:renderWorkorder(prepared),
  commercialMarkdown:commercialMarkdown(d.commercial),commercialHtml:commercialHtml(d.commercial)};
}
