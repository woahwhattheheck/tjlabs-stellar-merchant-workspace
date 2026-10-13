// SPDX-License-Identifier: MIT
// Complete original-service binding into the maintained Installation preparer.
import {bindingTemplate,prepareInstallation,renderWorkorder} from '../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/prepare-core.mjs';
export const INSTALLATION_SCHEMA='stellar-forge.facilitator-installation-preparation.v1';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const ordered=x=>Array.isArray(x)?x.map(ordered):record(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const same=(a,b)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const need=(ok,message,code='INSTALLATION_SOURCE_BINDING')=>{if(!ok)throw Object.assign(new Error(message),{code});};
const identity=x=>record(x)&&sha(x.sha256)&&Number.isSafeInteger(x.bytes)&&x.bytes>=0;
const unique=x=>[...new Set(x)];
function selected({seed,profile,caseSnapshot,job,transfer,transferIdentity}){
  need(record(seed)&&record(seed.source)&&record(seed.document),'Use the complete original Installation seed.');
  need(record(profile)&&profile.id==='facilitator-commissioning','Select the maintained same-service profile.');
  need(record(caseSnapshot)&&record(caseSnapshot.program)&&Array.isArray(caseSnapshot.sources),'Read the complete original Operations case.');
  need(caseSnapshot.program.id===seed.source.caseId&&caseSnapshot.program.version===seed.source.version&&
    caseSnapshot.program.planId===seed.source.planId,'The original case, version or pinned plan changed; receive its current seed and source catalog.');
  need(record(job)&&job.schema==='stellar-forge.facilitator-commissioning.v1'&&sha(job.selectionSha256)&&
    record(job.service)&&record(job.service.receiver)&&record(job.release)&&Array.isArray(job.requests)&&
    job.requests.length>=1&&job.requests.length<=1000&&Array.isArray(job.providers)&&job.providers.length===2,
    'Use the complete original commissioning job.');
  need(record(transfer)&&transfer.schema==='stellar-forge.facilitator-commissioning-transfer.v1'&&
    transfer.jobId===job.id&&transfer.selectionSha256===job.selectionSha256&&Array.isArray(transfer.files)&&identity(transferIdentity),
    'The original transfer, job and selection must agree.');
  const fileMap=new Map(),rows=[{path:'TRANSFER.json',...clone(transferIdentity)}];
  for(const file of transfer.files){
    need(record(file)&&typeof file.path==='string'&&identity(file)&&!fileMap.has(file.path),'The original transfer inventory contains an invalid or repeated member.');
    fileMap.set(file.path,file);rows.push(clone(file));
  }
  need(fileMap.has('job.json')&&fileMap.has('selection.json'),'Retain the original job and selection files.');
  const required=[job.service.scope,job.service.schema,job.service.acceptance];
  const aliases=new Set(),operators=new Set(),origins=new Set(),requestIds=new Set();
  for(const p of job.providers){
    need(record(p)&&typeof p.alias==='string'&&p.alias&&!aliases.has(p.alias)&&typeof p.operatorId==='string'&&
      p.operatorId&&!operators.has(p.operatorId)&&record(p.config)&&typeof p.config.url==='string',
      'Retain both distinct original provider identities.');
    let url;try{url=new URL(p.config.url);}catch{}
    need(url&&['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.hash&&!origins.has(url.origin),
      'Retain two distinct original facilitator origins.');
    aliases.add(p.alias);operators.add(p.operatorId);origins.add(url.origin);required.push(p.authority);
    if(p.supportedResponse)required.push(p.supportedResponse);
  }
  for(const r of job.requests){
    need(record(r)&&typeof r.id==='string'&&r.id&&!requestIds.has(r.id)&&typeof r.url==='string'&&
      typeof r.method==='string'&&typeof r.mediaType==='string','Retain the complete original request set.');
    requestIds.add(r.id);required.push(r.output);if(r.body)required.push(r.body);
  }
  for(const ref of required){
    need(identity(ref),'Retain the complete original service and provider source identities.');
    const row=fileMap.get('blobs/'+ref.sha256);
    need(row&&row.sha256===ref.sha256&&row.bytes===ref.bytes,'A required original source is absent from the complete transfer.');
  }
  const sourceIds=new Set();
  for(const item of caseSnapshot.sources){
    need(record(item)&&typeof item.id==='string'&&item.id&&!sourceIds.has(item.id)&&identity(item),
      'Read complete unique original case source descriptors.');
    sourceIds.add(item.id);
  }
  const matched=[],missing=[];
  for(const row of rows){
    const candidates=caseSnapshot.sources.filter(x=>x.sha256===row.sha256&&x.bytes===row.bytes).sort((a,b)=>a.id.localeCompare(b.id));
    if(!candidates.length)missing.push(row);
    else matched.push({...row,sourceId:candidates[0].id,matchingSourceIds:candidates.map(x=>x.id)});
  }
  const sourceByPath=new Map(matched.map(x=>[x.path,x]));
  const providers=job.providers.map(p=>({
    operatorId:p.operatorId,endpoint:p.config.url,
    sourceIds:unique([p.authority,...(p.supportedResponse?[p.supportedResponse]:[])].map(x=>sourceByPath.get('blobs/'+x.sha256)?.sourceId).filter(Boolean)),
    note:p.operatorName+'; original alias '+p.alias+'; derived release '+p.releaseId+'; authority: '+p.authorityReference
  }));
  return{rows,matched,missing,providers,sourceByPath,
    basis:{caseId:seed.source.caseId,caseVersion:seed.source.version,planId:seed.source.planId,
      planRevision:seed.source.planRevision,planContentSha256:seed.source.planContentSha256,
      planSourceSha256:seed.source.planSourceSha256,workshareCaseId:seed.document.workshare?.caseId??null,
      jobId:job.id,selectionSha256:job.selectionSha256,releaseId:job.release.id,releaseDigest:job.release.digest,
      sourceEdition:job.service.sourceEdition,requestCount:job.requests.length,transfer:clone(transferIdentity)}};
}
export function commissioningInstallationTemplate(input){
  const s=selected(input),bindings=bindingTemplate(input.seed,input.profile);
  bindings.source={...bindings.source,sourceIds:unique(s.matched.map(x=>x.sourceId)),
    reference:'Commissioning job '+input.job.id+'; source edition '+input.job.service.sourceEdition+
      '; original source '+input.job.service.sourceReference+'; complete TRANSFER.json SHA256 '+input.transferIdentity.sha256};
  bindings.payment.facilitators=clone(s.providers);
  bindings.receiving={...bindings.receiving,operator:input.job.service.receiver.operator,
    sourceIds:unique(s.matched.map(x=>x.sourceId))};
  return{schema:INSTALLATION_SCHEMA,basis:s.basis,bindings,missingSources:s.missing,sourceBindings:s.matched};
}
export function prepareCommissioningInstallation(input){
  const s=selected(input),b=clone(input.bindings);
  need(s.missing.length===0,'Attach every declared source member to the original case, then receive its current complete source catalog and planned seed.','INSTALLATION_SOURCES_REQUIRED');
  need(record(b)&&record(b.payment)&&Array.isArray(b.payment.facilitators)&&b.payment.facilitators.length===2,
    'Use the complete original two-provider binding template.');
  for(const expected of s.providers){
    const actual=b.payment.facilitators.find(x=>x.operatorId===expected.operatorId);
    need(actual&&actual.endpoint===expected.endpoint&&Array.isArray(actual.sourceIds)&&
      expected.sourceIds.every(x=>actual.sourceIds.includes(x))&&actual.sourceIds.every(x=>input.caseSnapshot.sources.some(s=>s.id===x)),
      'The selected original provider, endpoint or complete authority source changed.');
  }
  const jobSource=s.sourceByPath.get('job.json').sourceId;
  b.task={...b.task,name:input.job.title,purpose:input.job.service.purpose,
    request:'Operate all '+input.job.requests.length+' original requests/pages in commissioning job '+input.job.id+
      ', source '+jobSource+', with its complete method/URL/route/body/output/media-type/request-contract records. '+
      'The attached original scope, schema and acceptance files define the useful task. Keep the same source edition, schema and whole output across both original facilitators.'};
  b.source={...b.source,sourceIds:unique([...(b.source?.sourceIds??[]),...s.matched.map(x=>x.sourceId)])};
  b.receiving={...b.receiving,sourceIds:unique([...(b.receiving?.sourceIds??[]),...s.matched.map(x=>x.sourceId)])};
  const prepared=prepareInstallation(input.seed,input.profile,b);
  for(const section of ['source','receiving'])for(const id of prepared.document[section].sourceIds)
    need(input.caseSnapshot.sources.some(x=>x.id===id),'The prepared source ID is not in this original case.');
  for(const id of prepared.document.payment.termsSourceIds)
    need(input.caseSnapshot.sources.some(x=>x.id===id),'The approved payment source is not in this original case.');
  for(const key of ['workorder','assignments','checks','workshare','workflowPeriods','coordination'])
    need(same(prepared.document[key],input.seed.document[key]),'The original funding, work or acceptance assignment changed.');
  return{schema:INSTALLATION_SCHEMA,basis:s.basis,sourceBindings:s.matched,
    providers:clone(input.job.providers),requests:clone(input.job.requests),bindings:b,
    prepared,workorder:renderWorkorder(prepared)};
}
