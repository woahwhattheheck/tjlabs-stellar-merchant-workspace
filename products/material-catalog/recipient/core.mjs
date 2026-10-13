// MIT. Read-only complete recipient for the original material-catalog v1/v2 bundle.
import {sha256Utf8, sha256Bytes, createSha256, utf8ByteLength} from './sha256.mjs';
export const SCHEMAS = ['stellar-forge.material-catalog-bundle.v1','stellar-forge.material-catalog-bundle.v2'];
export const TABLES = {
 catalog_catalogs:['id','revision','record_json'],catalog_history:['catalog_id','revision','record_json'],
 catalog_sources:['id','record_json'],catalog_editions:['id','catalog_id','created_at','record_json'],
 catalog_materials:['edition_id','material_key','material_id','sha256','record_json'],
 catalog_decisions:['id','catalog_id','context_key','revision','record_json'],
 catalog_decision_history:['decision_id','revision','record_json'],
 catalog_supplier_plans:['id','catalog_id','revision','record_json'],
 catalog_supplier_plan_history:['plan_id','revision','record_json'],
 catalog_supplier_corrections:['id','plan_id','material_key','revision','record_json'],
 catalog_supplier_correction_history:['correction_id','revision','record_json'],
 catalog_supplier_reviews:['id','plan_id','created_at','record_json'],
 catalog_supplier_products:['review_id','material_key','supplier_id','errors','warnings','record_json'],
 catalog_supplier_recipient:['review_id','kind','record_key','supplier_key','identifier','action','record_json']
};
const KEYS = {
 catalog_catalogs:['id'],catalog_history:['catalog_id','revision'],catalog_sources:['id'],
 catalog_editions:['id'],catalog_materials:['edition_id','material_key'],catalog_decisions:['id'],
 catalog_decision_history:['decision_id','revision'],catalog_supplier_plans:['id'],
 catalog_supplier_plan_history:['plan_id','revision'],catalog_supplier_corrections:['id'],
 catalog_supplier_correction_history:['correction_id','revision'],catalog_supplier_reviews:['id'],
 catalog_supplier_products:['review_id','material_key'],catalog_supplier_recipient:['review_id','kind','record_key']
};
const BASE_TABLES = Object.keys(TABLES).slice(0,7);
const SUPPLIER_SCHEMAS={
 catalog_supplier_plans:'stellar-forge.supplier-submission.v1',
 catalog_supplier_plan_history:'stellar-forge.supplier-submission.v1',
 catalog_supplier_corrections:'stellar-forge.supplier-correction.v1',
 catalog_supplier_correction_history:'stellar-forge.supplier-correction.v1',
 catalog_supplier_reviews:'stellar-forge.supplier-review.v1',
 catalog_supplier_products:'stellar-forge.supplier-review-row.v1',
 catalog_supplier_recipient:'stellar-forge.xchange-recipient-record.v1'
};
export class BundleError extends Error {
 constructor(code,message){super(message);this.name='BundleError';this.code=code;}
}
function check(ok,code,message){if(!ok)throw new BundleError(code,message);}
function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
export function canonical(value,depth=0){
 check(depth<=64,'DEPTH','A record exceeds the original 64-level limit.');
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(v=>canonical(v,depth+1)).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],depth+1)).join(',')+'}';
}
const digest=value=>sha256Utf8(typeof value==='string'?value:canonical(value)).sha256;
const equal=(a,b)=>canonical(a)===canonical(b);
const revision=n=>Number.isSafeInteger(n)&&n>0&&n<=1000000;
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function decodeBase64(text){
 check(typeof text==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text),
  'BASE64','An original source has invalid base64.');
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',out=new Uint8Array(text.length/4*3-(text.endsWith('==')?2:text.endsWith('=')?1:0));
 let offset=0;
 for(let i=0;i<text.length;i+=4){
  const a=alphabet.indexOf(text[i]),b=alphabet.indexOf(text[i+1]),c=text[i+2]==='='?0:alphabet.indexOf(text[i+2]),d=text[i+3]==='='?0:alphabet.indexOf(text[i+3]);
  check((text[i+2]!=='='||(b&15)===0)&&(text[i+3]!=='='||text[i+2]==='='||(c&3)===0),'BASE64','A source uses noncanonical base64.');
  if(offset<out.length)out[offset++]=(a<<2)|(b>>4);
  if(offset<out.length)out[offset++]=((b&15)<<4)|(c>>2);
  if(offset<out.length)out[offset++]=((c&3)<<6)|d;
 }
 return out;
}
const sourceIdentity=s=>digest({name:s.name,format:s.format,bytes:s.bytes,sha256:s.sha256,provenance:s.provenance});
const editionReview=e=>({catalogId:e.catalogId,catalogRevision:e.catalogRevision,tenantId:e.tenantId,mappingSha256:e.mappingSha256,sourceId:e.source.id,sourceSha256:e.source.sha256,dependencies:e.dependencies,baseEditionId:e.baseEditionId,mode:e.mode,counts:e.counts,materialRootSha256:e.materialRootSha256});
function verifyRow(table,values,header){
 const columns=Object.hasOwn(TABLES,table)?TABLES[table]:null;
 check(columns&&Array.isArray(values)&&columns.length===values.length,'ROW','The bundle contains an unsupported table or row shape.');
 check(header.schema===SCHEMAS[1]||BASE_TABLES.includes(table),'VERSION','Supplier records require the original v2 bundle.');
 const row=Object.fromEntries(columns.map((key,i)=>[key,values[i]]));
 for(const [key,value] of Object.entries(row)){
  if(['revision','errors','warnings'].includes(key))check(Number.isSafeInteger(value)&&value>=(key==='revision'?1:0),'FIELD','Invalid count or revision.');
  else check(typeof value==='string'&&!value.includes('\0')&&(key==='supplier_id'||value.length>0),'FIELD','Invalid retained database field.');
 }
 let r;try{r=JSON.parse(row.record_json);canonical(r);}catch(error){throw new BundleError('RECORD_JSON','Invalid original record JSON: '+error.message);}
 check(object(r),'RECORD','A retained record must be an object.');
 row.record=r;
 if(table.startsWith('catalog_supplier_')){
  check(r.schema===SUPPLIER_SCHEMAS[table]&&r.catalogId===header.catalogId&&r.tenantId===header.tenantId,'SUPPLIER_SCOPE','Supplier schema or catalog scope differs.');
  const {sha256,...body}=r;check(hash(sha256)&&digest(body)===sha256,'SUPPLIER_SEAL','A supplier record differs from its saved bytes.');
  for(const key of KEYS[table]){
   const field={plan_id:'id',correction_id:'id',review_id:'reviewId',material_key:'materialKey',record_key:'key'}[key]??key;
   check(row[key]===r[field],'SUPPLIER_ID','A supplier row differs from its original identity.');
  }
  if(row.revision!==undefined)check(row.revision===r.revision,'SUPPLIER_REVISION','A supplier history revision changed.');
  if(table==='catalog_supplier_plans')check(row.catalog_id===r.catalogId,'SUPPLIER_PLAN','The plan catalog changed.');
  if(table==='catalog_supplier_corrections')check(row.plan_id===r.planId&&row.material_key===r.materialKey,'SUPPLIER_CORRECTION','The correction scope changed.');
  if(table==='catalog_supplier_reviews')check(row.plan_id===r.planId&&row.created_at===r.createdAt,'SUPPLIER_REVIEW','The saved review scope changed.');
  if(table==='catalog_supplier_products'){
   check(Array.isArray(r.findings),'SUPPLIER_FINDINGS','A supplier row is missing its retained findings.');
   check(row.errors===r.findings.filter(x=>x.severity==='error').length&&row.warnings===r.findings.filter(x=>x.severity==='warning').length,'SUPPLIER_FINDINGS','Saved finding counts changed.');
  }
  if(table==='catalog_supplier_recipient')check(row.supplier_key===r.supplierKey&&row.identifier===r.identifier&&row.action===r.action&&['product','tradeItem'].includes(r.kind)&&['added','changed','unchanged','expired','deleted','skipped'].includes(r.action)&&r.beforeSha256===(r.before===null?null:digest(r.before))&&r.afterSha256===(r.after===null?null:digest(r.after)),'RECIPIENT_STATE','A recipient before/after record changed.');
 }else if(table==='catalog_materials'){
  const {sha256,...body}=r;
  check(r.schema==='stellar-forge.material-catalog-record.v1'&&r.tenantId===header.tenantId&&r.key===digest([r.tenantId,r.materialId])&&digest(body)===sha256&&row.material_key===r.key&&row.material_id===r.materialId&&row.sha256===sha256,'MATERIAL','A material identity or saved content changed.');
 }else{
  const schema=table==='catalog_sources'?'source':table==='catalog_editions'?'edition':table.startsWith('catalog_decision')?'decision':null;
  check(r.schema==='stellar-forge.material-catalog'+(schema?'-'+schema:'')+'.v1'&&id(r.id),'SCHEMA','A retained record has an unsupported schema or ID.');
  if(table==='catalog_sources')check(row.id===r.id&&sourceIdentity(r)===r.id&&Number.isSafeInteger(r.bytes)&&r.bytes>0&&hash(r.sha256),'SOURCE_ID','The original source identity changed.');
  else{
   check((r.catalogId??r.id)===header.catalogId&&r.tenantId===header.tenantId,'CATALOG_SCOPE','The retained record belongs to a different catalog.');
   if(table==='catalog_catalogs'||table==='catalog_history')check((row.id??row.catalog_id)===r.id&&row.revision===r.revision&&hash(r.mappingSha256)&&digest(r.mapping)===r.mappingSha256,'CATALOG','The original catalog revision or mapping changed.');
   else if(table==='catalog_editions')check(row.id===r.id&&row.catalog_id===r.catalogId&&row.created_at===r.createdAt&&revision(r.catalogRevision)&&digest(r.mapping)===r.mappingSha256&&digest(editionReview(r))===r.reviewSha256,'EDITION','The original reviewed edition changed.');
   else{
    check((row.id??row.decision_id)===r.id&&row.revision===r.revision&&['APPROVED','REJECTED'].includes(r.status),'DECISION','The decision identity or status changed.');
    if(table==='catalog_decisions')check(row.catalog_id===r.catalogId&&typeof r.description==='string'&&row.context_key===digest([r.customerId,r.description.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s+/gu,' ').trim()]),'DECISION_CONTEXT','The original customer context changed.');
   }
  }
 }
 return row;
}
function completeHistory(current,rows,label){
 const selected=rows.filter(x=>x.record.id===current.id).sort((a,b)=>a.revision-b.revision);
 check(selected.length===current.revision&&selected.every((x,i)=>x.revision===i+1)&&equal(selected.at(-1)?.record,current),'HISTORY',label+' has incomplete or changed revision history.');
}
function lookupSources(value,ids=new Set()){
 if(!value||typeof value!=='object')return ids;
 if(value.lookup?.sourceId)ids.add(value.lookup.sourceId);
 for(const v of Object.values(value))if(v&&typeof v==='object')lookupSources(v,ids);
 return ids;
}
function validateClosure(bundle){
 const t=bundle.tables,one=t.catalog_catalogs;
 check(one.length===1,'CATALOG_COUNT','The bundle must contain one original catalog.');
 const catalog=one[0].record;
 check(catalog.revision===bundle.header.catalogRevision,'CATALOG_REVISION','The header revision differs.');
 completeHistory(catalog,t.catalog_history,'Catalog');
 const sources=new Map(t.catalog_sources.map(x=>[x.id,x.record]));
 const source=(sourceId,sha)=>{
  const s=sources.get(sourceId);
  check(s&&bundle.sources.has(sourceId)&&(!sha||sha===s.sha256),'SOURCE_MISSING','An original source is missing from the complete bundle.');
  return s;
 };
 check(sources.size===bundle.sources.size,'SOURCE_COUNT','Every original source requires one complete byte stream.');
 const editions=new Map(t.catalog_editions.map(x=>[x.id,x.record]));
 const materials=new Map();
 for(const row of t.catalog_materials){
  check(editions.has(row.edition_id),'MATERIAL_EDITION','A material has no original edition.');
  if(!materials.has(row.edition_id))materials.set(row.edition_id,new Map());
  materials.get(row.edition_id).set(row.material_key,row.record);
 }
 if(catalog.activeEditionId)check(editions.has(catalog.activeEditionId),'ACTIVE_EDITION','The active catalog edition is missing.');
 for(const row of t.catalog_history)for(const sid of lookupSources(row.record.mapping))source(sid);
 for(const e of editions.values()){
  check(Array.isArray(e.dependencies),'DEPENDENCIES','The edition source dependencies are missing.');
  const h=t.catalog_history.find(x=>x.revision===e.catalogRevision)?.record;
  check(h&&h.mappingSha256===e.mappingSha256,'MAPPING_HISTORY','An edition is missing its original mapping revision.');
  source(e.source.id,e.source.sha256);for(const s of e.dependencies)source(s.id,s.sha256);for(const sid of lookupSources(e.mapping))source(sid);
  const ancestors=new Set([e.id]);let next=e.baseEditionId;
  while(next){check(!ancestors.has(next)&&editions.has(next),'EDITION_BASE','The edition base is missing or cyclic.');ancestors.add(next);next=editions.get(next).baseEditionId;}
  const current=materials.get(e.id)??new Map(),base=materials.get(e.baseEditionId)??new Map();
  const counts={total:current.size,added:0,removed:0,changed:0,unchanged:0,missingUnit:0};
  for(const [key,m] of current){const old=base.get(key);counts[!old?'added':m.sha256!==old.sha256?'changed':'unchanged']++;if(m.unit===null||m.unit===undefined)counts.missingUnit++;}
  for(const key of base.keys())if(!current.has(key))counts.removed++;
  const root=createSha256();for(const [key,m] of [...current.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0))root.update(key+':'+m.sha256+'\n');
  check(equal(counts,e.counts)&&root.hex()===e.materialRootSha256,'MATERIAL_SET','The complete material set differs from the reviewed edition.');
 }
 const decisions=new Map(t.catalog_decisions.map(x=>[x.id,x.record])),contexts=new Set();
 for(const row of t.catalog_decisions){check(!contexts.has(row.context_key),'DECISION_CONTEXT','A customer context appears twice.');contexts.add(row.context_key);completeHistory(row.record,t.catalog_decision_history,'Customer decision');}
 for(const row of t.catalog_decision_history){
  const d=row.record,m=materials.get(d.editionId)?.get(d.materialKey),h=t.catalog_history.find(x=>x.revision===d.catalogRevision)?.record;
  check(decisions.has(d.id)&&m&&m.sha256===d.materialSha256&&m.materialId===d.materialId&&h?.activeEditionId===d.editionId,'DECISION_MATERIAL','A decision has lost its selected original material or edition.');
 }
 validateSupplierHistory(bundle,editions,materials);
 return {catalog,editions,materials,decisions};
}
// MIT. Read-only supplier v2 integrity closure.
// Native basis: merchant 9ae97486f55905326bed06372d0094e0b9a18921,
// catalog/supplier/{model,transfer,workspace}.mjs and xchange/recipient.mjs.
// Insert in reader-core.mjs in place of validateSupplierHistory.
// Uses its existing check/object/hash/digest/equal/completeHistory/createSha256.
// This checks retained references and aggregates, not current profile rules,
// source projection, numeric patch reconciliation or recipient derivation.
function supplierFindingCounts(findings) {
  check(Array.isArray(findings),'SUPPLIER_FINDINGS','Retained findings must be an array.');
  const counts={errors:0,warnings:0};
  for(const f of findings){
    check(object(f)&&['error','warning','info'].includes(f.severity)&&
      typeof f.code==='string'&&typeof f.path==='string'&&typeof f.message==='string',
      'SUPPLIER_FINDINGS','A retained finding has an invalid severity, code, path or message.');
    if(f.severity==='error')counts.errors++;
    if(f.severity==='warning')counts.warnings++;
  }
  return counts;
}
function supplierProductId(product) {
  return typeof product?.supplierProductId==='string'&&!product.supplierProductId.includes('\0')
    ?product.supplierProductId:'';
}
function supplierGroup(rows,key) {
  const groups=new Map();
  for(const row of rows){const k=row[key];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}
  return groups;
}
function supplierTextOrder(a,b){return a<b?-1:a>b?1:0;}
function validateSupplierHistory(bundle,editions,materials) {
  const t=bundle.tables;
  const plans=new Map(t.catalog_supplier_plans.map(x=>[x.id,x.record]));
  const corrections=new Map(t.catalog_supplier_corrections.map(x=>[x.id,x.record]));
  const reviews=new Map(t.catalog_supplier_reviews.map(x=>[x.id,x.record]));
  const planVersions=new Map(t.catalog_supplier_plan_history.map(x=>[JSON.stringify([x.plan_id,x.revision]),x.record]));
  const correctionVersions=new Map(t.catalog_supplier_correction_history.map(x=>[JSON.stringify([x.correction_id,x.revision]),x.record]));
  const productsByReview=supplierGroup(t.catalog_supplier_products,'review_id');
  const recipientsByReview=supplierGroup(t.catalog_supplier_recipient,'review_id');
  const originalPlan=(id,rev)=>planVersions.get(JSON.stringify([id,rev]));
  const originalCorrection=(id,rev)=>correctionVersions.get(JSON.stringify([id,rev]));
  const nativeProfile=p=>p?.schema==='stellar-forge.supplier-xchange-profile.v1';
  const safeCount=n=>Number.isSafeInteger(n)&&n>=0;
  for(const p of plans.values())completeHistory(p,t.catalog_supplier_plan_history,'Supplier plan');
  for(const row of t.catalog_supplier_plan_history){
    const p=row.record,e=editions.get(p.editionId);
    check(plans.has(p.id)&&e&&e.reviewSha256===p.editionReviewSha256&&
      object(p.bindings)&&hash(p.bindingSha256)&&digest(p.bindings)===p.bindingSha256&&object(p.profile),
      'SUPPLIER_PLAN_HISTORY','A supplier plan is missing its original edition, bindings or profile.');
    if(p.previousReviewId){
      const prior=reviews.get(p.previousReviewId);
      check(prior&&(nativeProfile(p.profile)
        ?prior.catalogId===p.catalogId&&prior.tenantId===p.tenantId&&prior.recipient?.target===p.profile.target&&
          (prior.planId!==p.id||prior.planRevision<p.revision)
        :prior.planId===p.id&&prior.planRevision<p.revision),
        'SUPPLIER_PREVIOUS_REVIEW','The previous review is missing, outside its original scope or not from an earlier plan revision.');
    }
  }
  for(const c of corrections.values()){
    check(plans.has(c.planId),'CORRECTION_PLAN','A correction has no retained plan.');
    completeHistory(c,t.catalog_supplier_correction_history,'Supplier correction');
  }
  for(const row of t.catalog_supplier_correction_history){
    const c=row.record,p=originalPlan(c.planId,c.planRevision),m=materials.get(c.editionId)?.get(c.materialKey);
    check(corrections.has(c.id)&&p&&p.editionId===c.editionId&&m&&
      c.id===digest([p.id,m.key])&&m.sha256===c.materialSha256&&m.materialId===c.materialId&&hash(c.baseProductSha256)&&
      Array.isArray(c.patches),
      'CORRECTION_HISTORY','A correction is missing its original plan, material or mapped-product identity.');
    // Preserve the exact patch payload for the native projection/correction evaluator.
    // Merely reading it never reapplies it or assigns new applicability.
  }
  for(const row of t.catalog_supplier_products){
    check(reviews.has(row.review_id),'SUPPLIER_PRODUCT_REVIEW','A supplier product has no retained review.');
    const r=row.record,counts=supplierFindingCounts(r.findings);
    check(row.supplier_id===supplierProductId(r.product)&&row.errors===counts.errors&&row.warnings===counts.warnings,
      'SUPPLIER_PRODUCT_COLUMNS','A product identifier or finding count differs from its retained product.');
  }
  for(const row of t.catalog_supplier_recipient){
    check(reviews.get(row.review_id)?.recipient,
      'SUPPLIER_RECIPIENT_REVIEW','A recipient row has no retained native recipient review.');
  }
  // Follow one prior-review edge per review iteratively: a long valid chain must
  // not overflow the browser call stack.
  const finished=new Set();
  for(const start of reviews.keys()){
    if(finished.has(start))continue;
    const path=[],visiting=new Set();let id=start;
    while(id&&!finished.has(id)){
      check(!visiting.has(id),'SUPPLIER_REVIEW_CYCLE','The retained previous-review chain is cyclic.');
      const r=reviews.get(id),p=r&&originalPlan(r.planId,r.planRevision);
      check(r&&p,'SUPPLIER_REVIEW_PLAN','A review is missing its original plan revision.');
      check(equal(r.plan,p)&&r.editionId===p.editionId&&
        editions.get(r.editionId)?.reviewSha256===r.editionReviewSha256&&
        equal(r.source,editions.get(r.editionId)?.source),
        'SUPPLIER_REVIEW_PLAN','The saved review differs from its exact original plan, edition or source.');
      visiting.add(id);path.push(id);id=p.previousReviewId;
    }
    for(const id of path)finished.add(id);
  }
  for(const r of reviews.values()){
    const p=originalPlan(r.planId,r.planRevision),edition=editions.get(r.editionId);
    const original=materials.get(r.editionId)??new Map();
    const rows=productsByReview.get(r.id)??[],root=createSha256(),codes=new Map();
    const globals=r.globalFindings??[],globalCounts=supplierFindingCounts(globals);
    let errors=globalCounts.errors,warnings=globalCounts.warnings,errorProducts=0;
    const addFindings=fs=>{for(const f of fs){const key=f.severity+':'+f.code;
      const old=codes.get(key)??{severity:f.severity,code:f.code,count:0};old.count++;codes.set(key,old);}};
    addFindings(globals);
    check(rows.length===original.size&&rows.length===edition.counts.total,
      'SUPPLIER_PRODUCT_SET','The saved review does not contain every original edition material.');
    for(const saved of [...rows].sort((a,b)=>supplierTextOrder(a.material_key,b.material_key))){
      const row=saved.record,m=original.get(saved.material_key);
      check(m&&row.planId===p.id&&row.planRevision===p.revision&&row.editionId===p.editionId&&
        row.materialKey===m.key&&row.materialId===m.materialId&&row.materialSha256===m.sha256&&
        hash(row.baseProductSha256)&&typeof row.correctionApplied==='boolean',
        'SUPPLIER_PRODUCT_SOURCE','A reviewed product differs from its original plan or material.');
      if(row.correctionId!==null){
        const c=originalCorrection(row.correctionId,row.correctionRevision);
        check(c&&c.planId===p.id&&c.materialKey===m.key,
          'SUPPLIER_PRODUCT_CORRECTION','The reviewed product selects a missing or unrelated correction revision.');
        const applicable=c.materialSha256===m.sha256&&c.baseProductSha256===row.baseProductSha256;
        check(row.correctionApplied===applicable,'SUPPLIER_CORRECTION_APPLICABILITY',
          'The saved correction applicability differs from its original material and mapped-product hashes.');
      }else check(row.correctionRevision===null&&!row.correctionApplied,
        'SUPPLIER_PRODUCT_CORRECTION','A product names correction state without its original identity.');
      root.update(saved.material_key+':'+row.sha256+'\n');
      errors+=saved.errors;warnings+=saved.warnings;if(saved.errors)errorProducts++;
      addFindings(row.findings);
    }
    const findings=[...codes.values()].sort((a,b)=>(a.severity+':'+a.code).localeCompare(b.severity+':'+b.code,'en'));
    check(root.hex()===r.rowsRootSha256&&equal(r.counts,{
      total:rows.length,readyProducts:rows.length-errorProducts,errorProducts,errors,warnings
    })&&equal(r.findings,findings),
      'SUPPLIER_REVIEW_SET','The product root or complete retained finding totals differ from the saved review.');
    // readyProducts excludes global errors. It does not alone authorize export.
    const recipientRows=recipientsByReview.get(r.id)??[];
    if(!nativeProfile(p.profile)){
      check(!r.recipient&&recipientRows.length===0,'SUPPLIER_RECIPIENT_PROFILE',
        'Recipient state appears on a review without its original xChange profile.');
      continue;
    }
    const summary=r.recipient,prior=p.previousReviewId?reviews.get(p.previousReviewId):null;
    check(object(summary)&&summary.schema==='stellar-forge.xchange-recipient-review.v1'&&
      ['xchange-2.0','2ba-xchange-2.0'].includes(p.profile.target)&&summary.target===p.profile.target&&
      summary.previousReviewId===(prior?.id??null)&&summary.previousReviewSha256===(prior?.sha256??null)&&
      object(summary.header)&&object(summary.headerNumberTokens)&&
      summary.headerSha256===digest({header:summary.header,numberTokens:summary.headerNumberTokens})&&
      summary.sourceProductCount===rows.length&&safeCount(summary.supplierCount),
      'SUPPLIER_RECIPIENT_SUMMARY','The saved native recipient header, prior review or source count changed.');
    const withProcessing=Object.hasOwn(p.profile,'processing');
    const counts={productsAdded:0,productsChanged:0,productsUnchanged:0,productsExpired:0,
      tradeItemsAdded:0,tradeItemsChanged:0,tradeItemsUnchanged:0,tradeItemsDeleted:0,
      productsTotal:0,tradeItemsTotal:0};
    if(withProcessing){counts.productsSkipped=0;counts.tradeItemsSkipped=0;}
    const previousRows=prior?(recipientsByReview.get(prior.id)??[]):[];
    const previous=new Map(previousRows.map(x=>[JSON.stringify([x.kind,x.record_key]),x.record]));
    const current=new Map(),recipientRoot=createSha256();
    for(const saved of [...recipientRows].sort((a,b)=>supplierTextOrder(a.kind,b.kind)||supplierTextOrder(a.record_key,b.record_key))){
      const row=saved.record,k=JSON.stringify([saved.kind,saved.record_key]),old=previous.get(k);
      const actions=saved.kind==='product'?['added','changed','unchanged','expired']:['added','changed','unchanged','deleted'];
      if(withProcessing)actions.push('skipped');
      check(row.schema==='stellar-forge.xchange-recipient-record.v1'&&row.planId===p.id&&
        actions.includes(row.action)&&equal(row.before,old?.after??null),
        'SUPPLIER_RECIPIENT_HISTORY','A recipient row differs from its retained plan, kind or previous after-state.');
      // Existing per-row checks bind kind/key/supplier/identifier/action columns,
      // before/after hashes and the full row seal. Do not rederive business effects.
      const prefix=saved.kind==='product'?'products':'tradeItems';
      counts[prefix+row.action[0].toUpperCase()+row.action.slice(1)]++;
      if(row.after!==null)counts[prefix+'Total']++;
      recipientRoot.update(saved.kind+':'+saved.record_key+':'+row.sha256+'\n');
      current.set(k,row);
    }
    for(const [key,row] of previous)if(row.after!==null)check(current.has(key),
      'SUPPLIER_RECIPIENT_SET','The complete recipient history lost an active previous record.');
    check(recipientRoot.hex()===summary.rowsRootSha256&&equal(counts,summary.counts),
      'SUPPLIER_RECIPIENT_SET','The recipient row root or retained action totals differ from the saved summary.');
    // supplierCount, catalogueType and processing effects remain saved native
    // findings, not a new evaluation of source headers or recipient policy.
  }
}

export function openText(text,{name='material-catalog.jsonl',maxBytes=256*1024*1024}={}){
 check(typeof text==='string'&&text.endsWith('\n'),'INCOMPLETE','Select the complete original LF-terminated JSONL bundle.');
 const identity=sha256Utf8(text);check(identity.bytes<=maxBytes,'SIZE','This reader accepts complete bundles up to '+maxBytes+' bytes.');
 const bundle={name,text,identity,header:null,footer:null,tables:Object.fromEntries(Object.keys(TABLES).map(k=>[k,[]])),sources:new Map()};
 const indexes=Object.fromEntries(Object.keys(TABLES).map(k=>[k,new Set()]));
 let active=null,frames=0,sourceBytes=0,position=0;const payload=createSha256();let rowCounts;
 while(position<text.length){
  const end=text.indexOf('\n',position)+1,raw=text.slice(position,end);position=end;
  check(utf8ByteLength(raw)<=8*1024*1024,'LINE_SIZE','An original bundle record exceeds 8 MiB.');
  let f;try{f=JSON.parse(raw);}catch{throw new BundleError('JSON','Invalid JSON at frame '+(frames+1)+'.');}
  check(object(f)&&!bundle.footer,'TRAILING','Unexpected content after the complete bundle.');
  if(!bundle.header){
   check(f.type==='header'&&SCHEMAS.includes(f.schema)&&revision(f.catalogRevision)&&id(f.catalogId)&&typeof f.tenantId==='string'&&f.tenantId.length>0,'HEADER','Select a complete original material-catalog v1 or v2 bundle.');
   bundle.header=f;rowCounts=Object.fromEntries((f.schema===SCHEMAS[0]?BASE_TABLES:Object.keys(TABLES)).map(k=>[k,0]));
  }else if(f.type==='complete'){
   check(!active&&f.schema===bundle.header.schema&&f.catalogId===bundle.header.catalogId&&f.frames===frames&&equal(f.rows,rowCounts)&&f.sourceBytes===sourceBytes&&f.payloadSha256===payload.hex(),'COMPLETION','The footer differs from the complete original frames, records or source bytes.');
   bundle.footer=f;continue;
  }else if(f.type==='record'){
   check(!active,'INTERLEAVED','Finish each original source before another record.');
   const row=verifyRow(f.table,f.values,bundle.header),key=canonical(KEYS[f.table].map(k=>row[k]));
   check(!indexes[f.table].has(key),'DUPLICATE','A retained table contains a duplicate original key.');
   indexes[f.table].add(key);bundle.tables[f.table].push(row);rowCounts[f.table]++;
  }else if(f.type==='source-start'){
   const manifest=bundle.tables.catalog_sources.find(x=>x.id===f.id)?.record;
   check(!active&&!bundle.sources.has(f.id)&&manifest,'SOURCE_START','An original source stream is repeated or missing its preceding manifest.');
   active={manifest,chunks:[],bytes:0,hash:createSha256()};
  }else if(f.type==='source-chunk'){
   check(active&&f.id===active.manifest.id&&f.offset===active.bytes&&typeof f.base64==='string'&&f.base64.length<=524288,'SOURCE_CHUNK','Invalid original source identity, offset or chunk size.');
   const bytes=decodeBase64(f.base64);active.bytes+=bytes.length;
   check(active.bytes<=active.manifest.bytes,'SOURCE_LENGTH','The source exceeds its original declared byte count.');
   active.chunks.push(bytes);active.hash.update(bytes);
  }else if(f.type==='source-end'){
   check(active&&f.id===active.manifest.id&&f.bytes===active.bytes&&f.bytes===active.manifest.bytes&&f.sha256===active.manifest.sha256&&f.sha256===active.hash.hex(),'SOURCE_END','The original source bytes or hash differ from their manifest.');
   const bytes=new Uint8Array(active.bytes);let off=0;for(const chunk of active.chunks){bytes.set(chunk,off);off+=chunk.length;}
   bundle.sources.set(f.id,{manifest:active.manifest,bytes});sourceBytes+=active.bytes;active=null;
  }else throw new BundleError('FRAME','The handover contains an unsupported frame type.');
  payload.update(raw);frames++;
 }
 check(bundle.header&&bundle.footer&&!active,'INCOMPLETE','The complete final bundle record is missing.');
 Object.assign(bundle,validateClosure(bundle));
 bundle.summary={catalogId:bundle.catalog.id,title:bundle.catalog.title,tenantId:bundle.header.tenantId,revision:bundle.catalog.revision,
  schema:bundle.header.schema,exportedAt:bundle.header.exportedAt,bundleBytes:identity.bytes,bundleSha256:identity.sha256,
  frames,sourceBytes,records:rowCounts,activeEditionId:bundle.catalog.activeEditionId,
  inspection:'Original bundle, source bytes, material seals, edition roots and retained history verified.',
  supplierInspection:'Supplier content seals and retained references checked. Profile evaluation and database import use the original operator.'};
 return bundle;
}
export function compareEditions(bundle,beforeId,afterId){
 check(bundle.editions.has(beforeId)&&bundle.editions.has(afterId),'SELECTION','Choose two retained editions.');
 const a=bundle.materials.get(beforeId)??new Map(),b=bundle.materials.get(afterId)??new Map(),rows=[];
 for(const key of new Set([...a.keys(),...b.keys()])){
  const before=a.get(key)??null,after=b.get(key)??null;
  const change=!before?'added':!after?'removed':before.sha256===after.sha256?'unchanged':'changed';
  const fields=before&&after?Object.keys({...before,...after}).filter(k=>k!=='sha256'&&!equal(before[k],after[k])):[];
  rows.push({key,materialId:(after??before).materialId,change,fields,before,after});
 }
 return {catalogId:bundle.catalog.id,beforeId,afterId,counts:Object.fromEntries(['added','removed','changed','unchanged'].map(k=>[k,rows.filter(r=>r.change===k).length])),rows};
}
export function tableJsonl(bundle,table){
 check(Object.hasOwn(TABLES,table),'TABLE','Select a retained original table.');
 return bundle.tables[table].map(row=>row.record_json+'\n').join('');
}
export function materialCsv(bundle,editionId){
 check(bundle.editions.has(editionId),'SELECTION','Select a retained edition.');
 const rows=[['material_id','title','description','unit','original_unit','sales_unit','sales_to_base','sha256']];
 const escape=value=>{let s=value===null||value===undefined?'':typeof value==='object'?canonical(value):String(value);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 for(const m of (bundle.materials.get(editionId)??new Map()).values())rows.push([m.materialId,m.title,m.description,m.unit,m.originalUnit,m.salesUnit,m.salesToBase,m.sha256]);
 return rows.map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
