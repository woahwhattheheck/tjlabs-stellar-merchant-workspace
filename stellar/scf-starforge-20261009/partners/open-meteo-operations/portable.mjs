// MIT. Complete weather report receiving and immutable source lineage.
import {validateWeatherRenewal,mapWeatherRenewal} from './renewal.mjs';
import {
 MAX_RESPONSE_BYTES,need,keys,text,normalizeSite,normalizeRequest,
 parsePayload,canonical,sha,clone,encoded
} from './contract.mjs';
import {decisionInput,evaluate,reportDigest} from './analysis.mjs';

export const WEATHER_HANDOVER_SCHEMA='stellar-forge.weather-report-handover.v1';
export const MAX_HANDOVER_BYTES=48*1024*1024;
export const MAX_LEGACY_ARCHIVE_BYTES=32*1024*1024;
const HASH=/^[a-f0-9]{64}$/;
const id=(value,prefix)=>need(typeof value==='string'&&new RegExp('^'+prefix+'-[a-f0-9-]{36}$').test(value),'HANDOVER_IDENTITY_INVALID');
const stamp=value=>need(typeof value==='string'&&value.length<=64&&Number.isFinite(Date.parse(value)),'HANDOVER_TIMESTAMP_INVALID');
const integer=(value,min,max)=>need(Number.isSafeInteger(value)&&value>=min&&value<=max,'HANDOVER_QUANTITY_INVALID');
const same=(a,b)=>canonical(a)===canonical(b);
const digest=value=>sha(Buffer.from(canonical(value)));
const decisionKey=value=>value.id+':'+value.revision;
function list(value,max,code){need(Array.isArray(value)&&value.length<=max,code);return value;}
function unique(values,key,code){const map=new Map();for(const value of values){const selected=key(value);need(!map.has(selected),code);map.set(selected,value);}return map;}
function sourceDescriptor(capture){
 const {raw,view,...descriptor}=capture;
 keys(descriptor,['id','requestId','specSha256','sha256','bytes','provenance','metadata','capturedAt','request']);
 return clone(descriptor);
}
function validateArchive(archive,report){
 keys(archive,['format','bytes','sha256','reportId','reportSha256','encoding','content']);
 need(archive.format==='stellar-forge.weather-report-zip.v1'&&archive.encoding==='base64','HANDOVER_ARCHIVE_FORMAT_INVALID');
 integer(archive.bytes,1,MAX_LEGACY_ARCHIVE_BYTES);
 need(HASH.test(archive.sha256??'')&&typeof archive.content==='string'&&
  archive.content.length<=Math.ceil(MAX_LEGACY_ARCHIVE_BYTES/3)*4,'HANDOVER_ARCHIVE_INVALID');
 const raw=Buffer.from(archive.content,'base64');
 need(raw.length===archive.bytes&&raw.toString('base64')===archive.content&&sha(raw)===archive.sha256,'HANDOVER_ARCHIVE_CHANGED');
 need(archive.reportId===report.id&&archive.reportSha256===report.sha256,'HANDOVER_ARCHIVE_REPORT_CHANGED');
}
function reportValue(report){const {sha256,...value}=report;need(HASH.test(sha256??'')&&reportDigest(value)===sha256,'HANDOVER_REPORT_CHANGED');return value;}
function validateReport(report){
 keys(report,['schema','id','createdAt','title','owner','notes','decisions','captures','attribution','sha256','receivedFrom','renewal']);
 need(report.schema==='stellar-forge.weather-report.v1','HANDOVER_REPORT_SCHEMA_INVALID');
 id(report.id,'report');stamp(report.createdAt);text(report.title,'REPORT_TITLE');text(report.owner,'REPORT_OWNER',120);
 need(typeof report.notes==='string'&&report.notes.length<=10000&&!report.notes.includes('\0'),'REPORT_NOTES_INVALID');
 list(report.decisions,32,'HANDOVER_DECISION_LIMIT');need(report.decisions.length>0,'HANDOVER_REPORT_EMPTY');
 list(report.captures,16,'HANDOVER_REPORT_SOURCE_LIMIT');need(report.captures.length>0,'HANDOVER_REPORT_EMPTY');
 reportValue(report);
}
function decodeSource(entry,views=new Map()){
 keys(entry,['capture','encoding','content']);need(entry.encoding==='base64','HANDOVER_ENCODING_INVALID');
 const capture=entry.capture;sourceDescriptor(capture);
 id(capture.id,'capture');id(capture.requestId,'request');
 need(HASH.test(capture.specSha256??'')&&HASH.test(capture.sha256??''),'HANDOVER_SOURCE_HASH_INVALID');
 integer(capture.bytes,1,MAX_RESPONSE_BYTES);stamp(capture.capturedAt);
 need(typeof entry.content==='string'&&entry.content.length<=Math.ceil(MAX_RESPONSE_BYTES/3)*4&&
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.content),'HANDOVER_BASE64_INVALID');
 const raw=Buffer.from(entry.content,'base64');
 need(raw.length===capture.bytes&&raw.toString('base64')===entry.content&&sha(raw)===capture.sha256,'HANDOVER_SOURCE_BYTES_CHANGED');
 const spec=capture.request;keys(spec,['title','site','request']);text(spec.title,'REQUEST_TITLE');
 const {id:siteId,revision,createdAt,...siteInput}=spec.site;
 id(siteId,'site');integer(revision,1,Number.MAX_SAFE_INTEGER);stamp(createdAt);
 need(same(normalizeSite(siteInput),siteInput),'HANDOVER_SITE_CHANGED');
 need(same(normalizeRequest(spec.request),spec.request),'HANDOVER_REQUEST_CHANGED');
 need(spec.site.latitude===spec.request.latitude&&spec.site.longitude===spec.request.longitude&&
  spec.site.timezone===spec.request.timezone&&spec.site.cellSelection===spec.request.cellSelection&&
  spec.site.elevation===spec.request.elevation,'HANDOVER_SITE_REQUEST_MISMATCH');
 need(digest(spec)===capture.specSha256,'HANDOVER_REQUEST_HASH_CHANGED');
 need(capture.provenance&&typeof capture.provenance==='object'&&!Array.isArray(capture.provenance),'HANDOVER_PROVENANCE_REQUIRED');
 const viewKey=capture.sha256+':'+canonical(spec.request);
 let view=views.get(viewKey);if(!view){view=parsePayload(raw,spec.request);views.set(viewKey,view);}
 need(same(view.metadata,capture.metadata),'HANDOVER_SOURCE_MEANING_CHANGED');
 return {...clone(capture),raw,view};
}
function validateDecision(decision,captures){
 keys(decision,['id','revision','captureId','title','owner','disposition','notes','rule','result','createdAt']);
 id(decision.id,'decision');integer(decision.revision,1,Number.MAX_SAFE_INTEGER);stamp(decision.createdAt);
 const capture=captures.get(decision.captureId);need(capture,'HANDOVER_DECISION_SOURCE_MISSING');
 const {id:originalId,revision,captureId,result,createdAt,...input}=decision;
 const normalized=decisionInput(input);
 need(same(normalized,input),'HANDOVER_DECISION_INPUT_CHANGED');
 const expected={...evaluate(capture.view,normalized.rule),captureSha256:capture.sha256,specSha256:capture.specSha256};
 need(same(result,expected),'HANDOVER_DECISION_RESULT_CHANGED');
 return clone(decision);
}
export function createWeatherHandover({originId,report,captures,decisionHistory=report.decisions,receivingHistory=[],legacyArchive}){
 text(originId,'HANDOVER_ORIGIN',200);
 const value={schema:WEATHER_HANDOVER_SCHEMA,originId,report:clone(report),
  sources:captures.map(capture=>({capture:sourceDescriptor(capture),encoding:'base64',content:Buffer.from(capture.raw).toString('base64')})),
  decisionHistory:clone(decisionHistory),receivingHistory:clone(receivingHistory),...(legacyArchive?{legacyArchive:clone(legacyArchive)}:{})};
 const result={...value,contentSha256:digest(value)};
 need(encoded(result).length<=MAX_HANDOVER_BYTES,'HANDOVER_TOO_LARGE');
 return result;
}
export function inspectWeatherHandover(content){
 need(typeof content==='string'&&Buffer.byteLength(content)<=MAX_HANDOVER_BYTES,'HANDOVER_TOO_LARGE');
 let value;try{value=JSON.parse(content);}catch{need(false,'HANDOVER_JSON_INVALID');}
 keys(value,['schema','originId','report','sources','decisionHistory','receivingHistory','contentSha256','legacyArchive']);
 need(value.schema===WEATHER_HANDOVER_SCHEMA,'HANDOVER_SCHEMA_INVALID');text(value.originId,'HANDOVER_ORIGIN',200);
 const {contentSha256,...unsigned}=value;
 need(HASH.test(contentSha256??'')&&digest(unsigned)===contentSha256,'HANDOVER_CONTENT_CHANGED');
 validateReport(value.report);
 if(value.legacyArchive)validateArchive(value.legacyArchive,value.report);
 const views=new Map();
 const sources=list(value.sources,128,'HANDOVER_SOURCE_LIMIT').map(entry=>decodeSource(entry,views));
 const captures=unique(sources,c=>c.id,'HANDOVER_DUPLICATE_SOURCE');
 need(captures.size>0,'HANDOVER_SOURCE_REQUIRED');
 const siteIdentities=new Map();
 for(const capture of sources){
  const site=capture.request.site,key=site.id+':'+site.revision;
  need(!siteIdentities.has(key)||same(siteIdentities.get(key),site),'HANDOVER_SITE_REVISION_COLLISION');
  siteIdentities.set(key,site);
 }
 const history=list(value.decisionHistory,4096,'HANDOVER_HISTORY_LIMIT').map(d=>validateDecision(d,captures));
 const decisions=unique(history,decisionKey,'HANDOVER_DUPLICATE_DECISION');
 validateWeatherRenewal(value.report.renewal,value.report.decisions,history);
 const selected=unique(value.report.decisions,d=>d.id,'HANDOVER_DUPLICATE_REPORT_DECISION');
 const reportCaptures=unique(value.report.captures,c=>c.id,'HANDOVER_DUPLICATE_REPORT_SOURCE');
 const sourceIds=new Set();
 const allowedRevisions=new Map(value.report.decisions.map(d=>[d.id,d.revision]));
 for(const receipt of list(value.receivingHistory,1024,'HANDOVER_RECEIVING_HISTORY_LIMIT')){
  if(receipt?.receivingOriginId===value.originId&&receipt.mapping&&
   (receipt.mapping.captures?.some(m=>reportCaptures.has(m.local))||receipt.mapping.decisions?.some(m=>selected.has(m.local)))){
   for(const mapping of receipt.mapping.decisions??[])allowedRevisions.set(mapping.local,Math.max(allowedRevisions.get(mapping.local)??0,mapping.revision??1));
  }
 }
 for(const decision of selected.values()){
  const retained=decisions.get(decisionKey(decision));
  need(retained&&same(retained,decision),'HANDOVER_FROZEN_DECISION_CHANGED');
  sourceIds.add(decision.captureId);
 }
 need(reportCaptures.size===sourceIds.size,'HANDOVER_REPORT_SOURCE_SELECTION_CHANGED');
 for(const capture of reportCaptures.values()){
  const retained=captures.get(capture.id);
  need(retained&&sourceIds.has(capture.id)&&same(sourceDescriptor(retained),capture),'HANDOVER_FROZEN_SOURCE_CHANGED');
 }
 for(const decision of history){
  need(allowedRevisions.has(decision.id)&&decision.revision<=allowedRevisions.get(decision.id),'HANDOVER_UNSELECTED_DECISION_HISTORY');
  sourceIds.add(decision.captureId);
 }
 need(captures.size===sourceIds.size&&sources.every(c=>sourceIds.has(c.id)),'HANDOVER_UNSELECTED_SOURCE');
 const receipts=list(value.receivingHistory,1024,'HANDOVER_RECEIVING_HISTORY_LIMIT');
 const retainedRaw=new Map(sources.map(source=>[source.sha256,source.raw]));
 for(const receipt of receipts){
  keys(receipt,['schema','id','receivingOriginId','packageSha256','contentSha256','sourceOriginId','receivedAt',
   'originalReport','originalDecisions','originalSources','originalArchive','mapping','historyIds']);
  need(receipt.schema==='stellar-forge.weather-receiving-record.v1'&&HASH.test(receipt.packageSha256??'')&&
   HASH.test(receipt.contentSha256??''),'HANDOVER_RECEIVING_HISTORY_INVALID');
  text(receipt.receivingOriginId,'HANDOVER_RECEIVING_ORIGIN',200);text(receipt.sourceOriginId,'HANDOVER_ORIGIN',200);stamp(receipt.receivedAt);
  need(receipt.id===weatherReceivingIdentity(receipt.receivingOriginId,receipt.packageSha256),'HANDOVER_RECEIVING_IDENTITY_CHANGED');
  validateReport(receipt.originalReport);
  if(receipt.originalArchive)validateArchive(receipt.originalArchive,receipt.originalReport);
  const originalCaptures=list(receipt.originalSources,128,'HANDOVER_SOURCE_LIMIT').map(capture=>{
   const raw=retainedRaw.get(capture.sha256);need(raw,'HANDOVER_ANCESTRAL_SOURCE_MISSING');
   return decodeSource({capture,encoding:'base64',content:raw.toString('base64')},views);
  });
  const originalById=unique(originalCaptures,capture=>capture.id,'HANDOVER_DUPLICATE_SOURCE');
  const originalDecisions=list(receipt.originalDecisions,4096,'HANDOVER_HISTORY_LIMIT').map(decision=>validateDecision(decision,originalById));
  const originalByRevision=unique(originalDecisions,decisionKey,'HANDOVER_DUPLICATE_DECISION');
  validateWeatherRenewal(receipt.originalReport.renewal,receipt.originalReport.decisions,originalDecisions);
  const reportDecisions=unique(receipt.originalReport.decisions,decision=>decision.id,'HANDOVER_DUPLICATE_REPORT_DECISION');
  const reportSources=unique(receipt.originalReport.captures,capture=>capture.id,'HANDOVER_DUPLICATE_REPORT_SOURCE');
  const selectedSources=new Set();
  for(const decision of reportDecisions.values()){
   need(originalByRevision.has(decisionKey(decision))&&same(originalByRevision.get(decisionKey(decision)),decision),'HANDOVER_ANCESTRAL_DECISION_CHANGED');
   selectedSources.add(decision.captureId);
  }
  need(selectedSources.size===reportSources.size,'HANDOVER_REPORT_SOURCE_SELECTION_CHANGED');
  for(const capture of reportSources.values()){
   need(originalById.has(capture.id)&&selectedSources.has(capture.id)&&same(sourceDescriptor(originalById.get(capture.id)),capture),
    'HANDOVER_ANCESTRAL_SOURCE_CHANGED');
  }
  const originalPlan=prepareWeatherReceiving({value:{originId:receipt.sourceOriginId,report:receipt.originalReport},
   captures:originalCaptures,decisions:originalDecisions});
  need(same(originalPlan.mapping,receipt.mapping),'HANDOVER_RECEIVING_MAPPING_CHANGED');
 }
 const receiptIds=unique(receipts,r=>r.id,'HANDOVER_DUPLICATE_RECEIVING_RECORD');
 for(const receipt of receipts){
  id(receipt.id,'receipt');text(receipt.receivingOriginId,'HANDOVER_RECEIVING_ORIGIN',200);
  const parents=list(receipt.historyIds??[],1024,'HANDOVER_RECEIVING_HISTORY_LIMIT');
  need(parents.every(parent=>receiptIds.has(parent)&&parent!==receipt.id),'HANDOVER_RECEIVING_HISTORY_MISSING');
 }
 const visiting=new Set(),visited=new Set();
 function visit(receiptId){
  need(!visiting.has(receiptId),'HANDOVER_RECEIVING_HISTORY_CYCLE');if(visited.has(receiptId))return;
  visiting.add(receiptId);for(const parent of receiptIds.get(receiptId).historyIds??[])visit(parent);
  visiting.delete(receiptId);visited.add(receiptId);
 }
 for(const receiptId of receiptIds.keys())visit(receiptId);
 const packageSha256=sha(Buffer.from(content));
 return {value:clone(value),packageSha256,contentSha256,captures:sources,decisions:history,
  review:{schema:'stellar-forge.weather-handover-review.v1',packageSha256,contentSha256,originId:value.originId,
   reportId:value.report.id,reportSha256:value.report.sha256,title:value.report.title,owner:value.report.owner,
   createdAt:value.report.createdAt,sourceCount:sources.length,sourceBytes:sources.reduce((sum,c)=>sum+c.bytes,0),
   selectedDecisions:value.report.decisions.length,decisionRevisions:history.length,
   receivingHistory:receipts.length,...(value.report.renewal?{renewal:{sourceReport:clone(value.report.renewal.sourceReport),decisions:value.report.renewal.entries.length}}:{}),...(value.legacyArchive?{originalArchive:{sha256:value.legacyArchive.sha256,bytes:value.legacyArchive.bytes},historyScope:'selected revisions retained in the original ZIP'}:{}),
   sources:sources.map(c=>({id:c.id,sha256:c.sha256,bytes:c.bytes,title:c.request.title,site:c.request.site.name,
    family:c.metadata.family,model:c.metadata.model,timezone:c.metadata.timezone,
    timestamps:c.view.times.length,columns:c.view.columns.length,provenance:clone(c.provenance)}))}};
}
function localId(prefix,origin,original,revision=''){
 const h=sha(Buffer.from(canonical(['weather-receiving-v1',prefix,origin,original,String(revision)])));
 return prefix+'-'+h.slice(0,8)+'-'+h.slice(8,12)+'-5'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
}
export function prepareWeatherReceiving(inspection){
 const {value,captures,decisions}=inspection,origin=value.originId;
 const siteMap=new Map(),requestMap=new Map(),captureMap=new Map(),decisionMap=new Map();
 const sites=[],requests=[],receivedCaptures=[],receivedDecisions=[];
 for(const capture of captures){
  const originalSite=capture.request.site,siteKey=originalSite.id+':'+originalSite.revision;
  let site=siteMap.get(siteKey);
  if(!site){
   site={...clone(originalSite),id:localId('site',origin,originalSite.id,originalSite.revision),revision:1};
   siteMap.set(siteKey,site);sites.push(site);
  }
  const requestKey=capture.requestId+':'+capture.specSha256;
  let request=requestMap.get(requestKey);
  if(!request){
   const spec={...clone(capture.request),site:clone(site)};
   request={id:localId('request',origin,capture.requestId,capture.specSha256),spec,specSha256:digest(spec)};
   requestMap.set(requestKey,request);requests.push(request);
  }
  const mapped={...sourceDescriptor(capture),id:localId('capture',origin,capture.id),requestId:request.id,
   request:clone(request.spec),specSha256:request.specSha256,
   provenance:{kind:'RECEIVED_REPORT',originId:origin,originalCaptureId:capture.id,
    originalRequestId:capture.requestId,originalSpecSha256:capture.specSha256,
    originalProvenance:clone(capture.provenance),retrievedAt:capture.provenance.retrievedAt??capture.capturedAt,
    accounting:'Original retained weather source received into this review workspace.'},
   raw:capture.raw,view:capture.view};
  captureMap.set(capture.id,mapped);receivedCaptures.push(mapped);
 }
 for(const decision of decisions){
  const capture=captureMap.get(decision.captureId);
  const mapped={...clone(decision),id:localId('decision',origin,decision.id,decision.revision),revision:1,captureId:capture.id,
   result:{...evaluate(capture.view,decision.rule),captureSha256:capture.sha256,specSha256:capture.specSha256}};
  decisionMap.set(decisionKey(decision),mapped);receivedDecisions.push(mapped);
 }
 const {sha256:originalReportSha,...originalReport}=value.report;
 const report={...clone(originalReport),id:localId('report',origin,value.report.id,originalReportSha),
  decisions:value.report.decisions.map(d=>clone(decisionMap.get(decisionKey(d)))),
  captures:value.report.captures.map(c=>sourceDescriptor(captureMap.get(c.id))),
  ...(value.report.renewal?{renewal:mapWeatherRenewal(value.report.renewal,decision=>decisionMap.get(decisionKey(decision)))}:{}),
  receivedFrom:{originId:origin,reportId:value.report.id,reportSha256:originalReportSha}};
 report.sha256=reportDigest(report);
 return {sites,requests,captures:receivedCaptures,decisions:receivedDecisions,report,
  mapping:{sites:[...siteMap].map(([original,id])=>({original,local:id.id,revision:1})),
   requests:[...requestMap].map(([original,id])=>({original,local:id.id})),
   captures:[...captureMap].map(([original,id])=>({original,local:id.id})),
   decisions:[...decisionMap].map(([original,id])=>({original,local:id.id,revision:1})),
   report:{original:value.report.id,originalSha256:originalReportSha,local:report.id,localSha256:report.sha256}}};
}

export function weatherReceivingIdentity(originId,packageSha256){
 text(originId,'HANDOVER_RECEIVING_ORIGIN',200);need(HASH.test(packageSha256),'HANDOVER_HASH_INVALID');
 return localId('receipt',originId,packageSha256);
}
