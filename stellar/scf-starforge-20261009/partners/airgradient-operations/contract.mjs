// SPDX-License-Identifier: MIT
import {createHash,randomUUID} from 'node:crypto';

export const SCHEMA='stellar-forge.airgradient-project.v1';
export const SOURCE='stellar/scf-starforge-20261009/partners/airgradient-operations';
export const MAP_ORIGIN='https://map-data.airgradient.com';
export const DASHBOARD_ORIGIN='https://api.airgradient.com';
export const MAP_SOURCE='https://map-data.airgradient.com/map/api/v1/docs-json';
export const MAX_BODY=16*1024*1024,MAX_PACKAGE=128*1024*1024;
export const BUCKETS=Object.freeze({'15m':900,'1h':3600,'8h':28800,'1d':86400});
export const MEASURES=Object.freeze({
 pm25:{label:'PM2.5',unit:'µg/m³'},pm10:{label:'PM10',unit:'µg/m³'},
 atmp:{label:'Temperature',unit:'°C'},rhum:{label:'Relative humidity',unit:'%'},
 rco2:{label:'CO₂',unit:'ppm'}
});
export function need(condition,code,detail){if(!condition)throw Object.assign(new Error(detail??code),{code});}
export const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
export function canonical(v){
 if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='number'){need(Number.isFinite(v),'NONFINITE_NUMBER');return JSON.stringify(v);}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 need(plain(v),'JSON_OBJECT_REQUIRED');return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
}
export const encoded=v=>Buffer.from(canonical(v)+'\n');
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const digest=v=>sha(encoded(v));
export const now=()=>new Date().toISOString();
export const newId=prefix=>prefix+'_'+randomUUID();
export function text(v,label,max=300){need(typeof v==='string'&&v.trim()&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),'INVALID_'+label);return v.trim();}
export function identifier(v,label='ID'){return text(v,label,160);}
export function locationKey(sourceType,id){need(['outdoor','indoor','dashboard'].includes(sourceType),'LOCATION_SOURCE_TYPE_REQUIRED');return sourceType+':'+identifier(String(id),'LOCATION_ID');}
export function timestamp(v){
 need(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(v),'EXPLICIT_TIMESTAMP_REQUIRED');
 const n=Date.parse(v);need(Number.isFinite(n),'INVALID_TIMESTAMP');return new Date(n).toISOString();
}
export function finite(v){
 if(v===null||v===undefined)return null;
 need(typeof v==='number'||typeof v==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v),'NON_NUMERIC_SOURCE_VALUE');
 const n=Number(v);need(Number.isFinite(n),'NONFINITE_SOURCE_VALUE');return n;
}
export function period(value,bucket){
 need(plain(value)&&Object.hasOwn(BUCKETS,bucket),'INVALID_PERIOD');
 const start=timestamp(value.start),end=timestamp(value.end),step=BUCKETS[bucket]*1000,a=Date.parse(start),b=Date.parse(end);
 need(b>a&&b-a<=366*86400000&&a%step===0&&b%step===0,'UTC_BUCKET_ALIGNED_PERIOD_REQUIRED');
 return {start,end,bucket,seconds:BUCKETS[bucket],expectedBuckets:(b-a)/step,convention:'[start, end) in UTC'};
}
export function normalizeProject(v){
 need(plain(v),'PROJECT_REQUIRED');
 const locations=v.locations;need(Array.isArray(locations)&&locations.length>=1&&locations.length<=20,'ONE_TO_TWENTY_LOCATIONS_REQUIRED');
 const ids=new Set();const selected=locations.map(x=>{need(plain(x),'INVALID_LOCATION');need((typeof x.id==='string'&&x.id.trim())||(typeof x.id==='number'&&Number.isSafeInteger(x.id)&&x.id>=0),'LOCATION_ID_REQUIRED');const id=identifier(String(x.id),'LOCATION_ID'),sourceType=x.sourceType??'outdoor',key=locationKey(sourceType,id);need(!ids.has(key),'DUPLICATE_LOCATION');ids.add(key);return {id,sourceType,label:text(x.label,'LOCATION_LABEL'),timezone:text(x.timezone??'UTC','TIMEZONE',100)};});
 for(const x of selected){try{new Intl.DateTimeFormat('en',{timeZone:x.timezone});}catch{need(false,'INVALID_TIMEZONE');}}
 need(Array.isArray(v.measures)&&v.measures.length&&v.measures.length<=5,'MEASURE_SELECTION_REQUIRED');
 const measures=[...new Set(v.measures)];need(measures.every(x=>Object.hasOwn(MEASURES,x)),'UNSUPPORTED_MEASURE');
 need(Object.hasOwn(BUCKETS,v.bucket),'INVALID_BUCKET');
 const minimumCoverage=finite(v.minimumCoverage??0.9);need(minimumCoverage>=0&&minimumCoverage<=1,'INVALID_COVERAGE');
 const thresholds={};for(const [measure,rule]of Object.entries(v.thresholds??{})){
  need(measures.includes(measure)&&plain(rule)&&['gte','lte'].includes(rule.operator),'INVALID_THRESHOLD');
  thresholds[measure]={operator:rule.operator,value:finite(rule.value),purpose:text(rule.purpose,'THRESHOLD_PURPOSE',600)};
  need(thresholds[measure].value!==null,'THRESHOLD_VALUE_REQUIRED');
 }
 return {schema:SCHEMA,organisation:text(v.organisation,'ORGANISATION'),title:text(v.title,'PROJECT_TITLE'),owner:text(v.owner,'OWNER'),
  connectionId:identifier(v.connectionId??'map-public','CONNECTION_ID'),locations:selected,measures,bucket:v.bucket,
  minimumCoverage,thresholds,notes:typeof v.notes==='string'?v.notes.slice(0,8000):''};
}
export function envelope(kind,value){const body={schema:'stellar-forge.airgradient-'+kind+'.v1',...value};return {...body,sha256:digest(body)};}
export function verifyEnvelope(v,kind){
 need(plain(v)&&v.schema==='stellar-forge.airgradient-'+kind+'.v1'&&/^[a-f0-9]{64}$/.test(v.sha256),'INVALID_'+kind.toUpperCase());
 const {sha256,...body}=v;need(digest(body)===sha256,'CHANGED_'+kind.toUpperCase());return v;
}
