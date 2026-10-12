// SPDX-License-Identifier: MIT
// OpenAQ study rules; the original publisher, quota, dataset and customer engines stay authoritative.
import { randomUUID } from 'node:crypto';
import { identity, object, fault, absolute } from '../postgres/publisher/files.mjs';
export const SCHEMA='stellar-forge.openaq-study.v1';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const HASH=/^[0-9a-f]{64}$/;
export const need=(ok,code,message=code,status=400)=>{if(!ok)throw fault(code,message,status);};
export const uuid=v=>{need(typeof v==='string'&&UUID.test(v),'OPENAQ_ID_REQUIRED');return v;};
export const text=(v,label,max=2000)=>{need(typeof v==='string'&&v.trim()&&v.length<=max&&!v.includes('\0'),'OPENAQ_TEXT_REQUIRED','Enter '+label+'.');return v.trim();};
export function whole(v,label,min=1,max=Number.MAX_SAFE_INTEGER){
 const n=typeof v==='string'&&/^(0|[1-9]\d*)$/.test(v)?Number(v):v;
 need(Number.isSafeInteger(n)&&n>=min&&n<=max,'OPENAQ_INTEGER_REQUIRED','Enter a valid '+label+'.');return n;
}
export const only=(v,keys)=>need(object(v)&&Object.keys(v).every(k=>keys.includes(k)),'OPENAQ_UNKNOWN_FIELD');
export function day(v){const parsed=typeof v==='string'?Date.parse(v+'T00:00:00Z'):NaN;need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===v,'OPENAQ_DATE_REQUIRED');return v;}
export function instant(v){need(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v)),'OPENAQ_OFFSET_REQUIRED','Use an ISO datetime with its explicit UTC offset.');return v;}
export function https(v){let u;try{u=new URL(v);}catch{}need(u?.protocol==='https:'&&!u.username&&!u.password&&!u.hash,'OPENAQ_SOURCE_URL_REQUIRED');return u.href;}
export function plan(raw){
 need(object(raw),'OPENAQ_PLAN_REQUIRED');
 need(raw.sensorIds===undefined||Array.isArray(raw.sensorIds),'OPENAQ_SENSOR_SELECTION_INVALID');
 const common=['mode','locationId','label','purpose','sensorIds','maxRows'];
 only(raw,raw.mode==='archive'?[...common,'dates']:[...common,'resolution','datetimeFrom','datetimeTo','pageSize','maxPages']);
 const v={mode:raw.mode,locationId:whole(raw.locationId,'location ID'),label:text(raw.label,'study label',128),purpose:text(raw.purpose,'project purpose',4000),
  sensorIds:raw.sensorIds===undefined?[]:raw.sensorIds.map(x=>whole(x,'sensor ID')),maxRows:whole(raw.maxRows??250000,'maximum rows',1,250000)};
 need(Array.isArray(raw.sensorIds??[])&&v.sensorIds.length<=64&&new Set(v.sensorIds).size===v.sensorIds.length,'OPENAQ_SENSOR_SELECTION_INVALID');
 v.sensorIds.sort((a,b)=>a-b);
 if(v.mode==='archive'){
  need(Array.isArray(raw.dates)&&raw.dates.length>=1&&raw.dates.length<=31,'OPENAQ_ARCHIVE_DATES_REQUIRED','Choose one to 31 original local-location days.');
  v.dates=raw.dates.map(day);need(new Set(v.dates).size===v.dates.length,'OPENAQ_DUPLICATE_DAY');v.dates.sort();
 }else{
  need(v.mode==='api'&&v.sensorIds.length>0&&['measurements','hours','days'].includes(raw.resolution),'OPENAQ_API_SELECTION_REQUIRED');
  v.resolution=raw.resolution;v.datetimeFrom=instant(raw.datetimeFrom);v.datetimeTo=instant(raw.datetimeTo);
  const span=Date.parse(v.datetimeTo)-Date.parse(v.datetimeFrom);need(span>0&&span<=366*86400000,'OPENAQ_PERIOD_INVALID','Select a positive period of at most 366 days.');
  v.pageSize=whole(raw.pageSize??1000,'page size',1,1000);v.maxPages=whole(raw.maxPages??300,'maximum pages',1,1000);
 }
 return Object.freeze(v);
}
export function configuration(raw){
 only(raw,['schema','project','api','customer']);
 need(raw.schema===SCHEMA&&object(raw.project),'OPENAQ_CONFIGURATION_REQUIRED');
 only(raw.project,['name','customer','purpose']);
 const c={schema:SCHEMA,project:{name:text(raw.project.name,'project name',128),customer:text(raw.project.customer,'customer or research team',240),purpose:text(raw.project.purpose,'project purpose',4000)}};
 if(raw.api!==undefined){
  only(raw.api,['account','apiKeyEnv','quotaDirectory','requestsPerSecond','callsPerDay']);
  need(typeof raw.api.account==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(raw.api.account),'OPENAQ_ACCOUNT_REQUIRED');
  need(typeof raw.api.apiKeyEnv==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(raw.api.apiKeyEnv),'OPENAQ_KEY_ENV_REQUIRED');
  c.api={account:raw.api.account,apiKeyEnv:raw.api.apiKeyEnv,quotaDirectory:absolute(raw.api.quotaDirectory),
   requestsPerSecond:whole(raw.api.requestsPerSecond??1,'local requests per second',1,1),
   callsPerDay:whole(raw.api.callsPerDay??2000,'local rolling24-hour call ceiling',1,2000)};
 }
 if(raw.customer!==undefined){
  only(raw.customer,['name','workspaceId','database']);
  need(typeof raw.customer.name==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(raw.customer.name)&&/^[0-9a-f]{32}$/.test(raw.customer.workspaceId??''),'OPENAQ_CUSTOMER_ID_REQUIRED');
  c.customer={name:raw.customer.name,workspaceId:raw.customer.workspaceId,database:absolute(raw.customer.database)};
 }
 return c;
}
export function metadataContext(raw,selected){
 need(object(raw)&&['api-response','documentation-example','operator-supplied'].includes(raw.kind),'OPENAQ_METADATA_KIND_REQUIRED');
 const value=structuredClone(raw);
 need(object(value.location)&&whole(value.location.id,'metadata location ID')===selected.locationId,'OPENAQ_METADATA_LOCATION_CHANGED');
 need(typeof value.location.timezone==='string'&&value.location.timezone.length<100,'OPENAQ_LOCATION_TIMEZONE_REQUIRED');
 try{new Intl.DateTimeFormat('en',{timeZone:value.location.timezone}).format(0);}catch{throw fault('OPENAQ_LOCATION_TIMEZONE_INVALID');}
 need(Array.isArray(value.sources)&&value.sources.length>0&&value.sources.length<=20,'OPENAQ_METADATA_SOURCES_REQUIRED');
 value.sources=value.sources.map(v=>({url:https(v.url),title:text(v.title,'source title',300)}));
 value.observedAt=instant(value.observedAt);
 if(value.kind!=='api-response')value.note=text(value.note,'metadata provenance note',4000);
 const licenses=value.location.licenses??[];
 need(Array.isArray(licenses)&&licenses.length<=100,'OPENAQ_LICENSE_LIST_INVALID');
 for(const row of licenses){need(object(row),'OPENAQ_LICENSE_INVALID');if(row.id!==undefined)whole(row.id,'license ID');}
 return value;
}
export function review(raw,capture){
 only(raw,['captureId','captureSha256','reviewer','decision','note','attribution','rightsBasis','rightsSources','allowDerivedDelivery']);
 need(raw.captureId===capture.id&&raw.captureSha256===capture.captureSha256,'OPENAQ_CAPTURE_REVIEW_CHANGED','Review the current completed original capture.',409);
 need(['accepted','revise','context_only'].includes(raw.decision),'OPENAQ_REVIEW_DECISION_REQUIRED');
 need(Array.isArray(raw.rightsSources)&&raw.rightsSources.length<=20,'OPENAQ_RIGHTS_SOURCE_REQUIRED');
 const v={...raw,reviewer:text(raw.reviewer,'reviewer',240),note:text(raw.note,'review note',6000),attribution:text(raw.attribution,'OpenAQ and original-provider attribution',4000),
  rightsBasis:text(raw.rightsBasis,'applicable license and period basis',6000),rightsSources:raw.rightsSources.map(https)};
 need(typeof raw.allowDerivedDelivery==='boolean','OPENAQ_DELIVERY_DECISION_REQUIRED');
 if(v.allowDerivedDelivery){need(v.decision==='accepted'&&v.rightsSources.length>0,'OPENAQ_ACCEPTED_RIGHTS_REVIEW_REQUIRED');
  for(const license of capture.context?.location?.licenses??[]){
   if(license.redistributionAllowed===false||license.modificationAllowed===false)throw fault('OPENAQ_LICENSE_RESTRICTS_DELIVERY','This retained license restricts the proposed derived delivery. Keep it for internal review or use separately documented permission.',409);
  }
 }
 return v;
}
export function reportPlan(raw,captures){
 only(raw,['title','purpose','captureIds','reviewIds','reviewer','note','includeMean','excludeFlagged']);
 need(Array.isArray(raw.captureIds)&&raw.captureIds.length>0&&raw.captureIds.length<=40&&new Set(raw.captureIds).size===raw.captureIds.length,'OPENAQ_REPORT_CAPTURES_REQUIRED');
 need(Array.isArray(raw.reviewIds)&&raw.reviewIds.length===raw.captureIds.length,'OPENAQ_REPORT_REVIEWS_REQUIRED');
 need(typeof raw.includeMean==='boolean'&&typeof raw.excludeFlagged==='boolean','OPENAQ_REPORT_METHOD_REQUIRED');
 for(let i=0;i<captures.length;i++){uuid(raw.captureIds[i]);uuid(raw.reviewIds[i]);need(captures[i].id===raw.captureIds[i],'OPENAQ_REPORT_CAPTURE_CHANGED');}
 return {...structuredClone(raw),title:text(raw.title,'report title',160),purpose:text(raw.purpose,'report purpose',6000),reviewer:text(raw.reviewer,'report reviewer',240),note:text(raw.note,'method and limitations',8000)};
}
export function archiveURL(locationId,date){
 whole(locationId,'location ID');day(date);
 return 'https://openaq-data-archive.s3.amazonaws.com/records/csv.gz/locationid='+locationId+'/year='+date.slice(0,4)+'/month='+date.slice(5,7)+'/location-'+locationId+'-'+date.replaceAll('-','')+'.csv.gz';
}
export const actionId=()=>randomUUID();
export const requestIdentity=(action,input)=>identity({action,input});
export const SEMANTICS=Object.freeze({
 apiMeasurements:'Original upstream-reported measurements; a timestamp is the exclusive period end, not necessarily an instant.',
 apiHours:'OpenAQ hourly averages; retain each reported period, flags and coverage.',
 apiDays:'OpenAQ daily averages of hourly averages, using the location local day and the reported period.',
 archive:'Original all-sensor local-location/day CSV edition. The CSV alone does not establish each sensor averaging interval or license.',
 numeric:'Original numeric tokens are strings in the published table. No unit conversion, rounding, zero substitution or AQI calculation.',
 coverage:'Source coverage belongs to its individual observation or aggregate. It is not a completeness certificate for the selected project window.',
 duplicates:'Every original row is retained. Repeated values and overlapping periods are not silently deduplicated.',
 pagination:'API pages are independently acquired responses; no point-in-time snapshot is asserted.',
});
