// SPDX-License-Identifier: MIT
import { createCsvRecordParser } from '../dataset-handler.mjs';
import { csvLine } from '../postgres/publisher/plan.mjs';
import { parseExactJSON } from '../stellar-expert/exact-json.mjs';
import { identity, object } from '../postgres/publisher/files.mjs';
import { need, whole, SEMANTICS } from './contract.mjs';
export const COLUMNS=Object.freeze([
 'capture_id','location_id','location_name','sensor_id','parameter_id','parameter','unit','value_token','value_present',
 'resolution','datetime_utc','datetime_local','local_day','archive_local_day','period_from_utc','period_from_local','period_to_utc','period_to_local','period_interval','period_label',
 'latitude','longitude','has_flags','coverage_json','summary_json','source_file','source_sha256','source_row','source_url','source_acquired_at'
]);
const str=v=>v===null||v===undefined?'':typeof v==='string'?v:String(v);
const json=v=>v===undefined?'':JSON.stringify(v);
export function parseAPI(data){
 const raw=typeof data==='string'?data:new TextDecoder('utf-8',{fatal:true}).decode(data);
 const value=parseExactJSON(raw);need(object(value)&&Array.isArray(value.results),'OPENAQ_API_RESPONSE_INVALID');return value;
}
function common(capture,receipt,index){return {capture_id:capture.id,location_id:String(capture.plan.locationId),location_name:str(capture.context.location.name),
 archive_local_day:receipt.archiveLocalDay??'',source_file:receipt.file,source_sha256:receipt.sha256,source_row:String(index+1),source_url:receipt.url,source_acquired_at:receipt.acquiredAt};}
function numeric(value){
 if(value===null||value===undefined||value==='')return;
 need(typeof value==='string'&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value),'OPENAQ_NUMERIC_TOKEN_INVALID');
}
export function apiRows(capture,receipt,sensorId,resolution,data){
 const value=parseAPI(data);
 return value.results.map((v,i)=>{
  need(object(v)&&object(v.parameter)&&object(v.period),'OPENAQ_MEASUREMENT_INVALID');numeric(v.value);
  const p=v.period,from=p.datetimeFrom??{},to=p.datetimeTo??{},coordinates=v.coordinates??{};
  const row={...common(capture,receipt,i),sensor_id:String(sensorId),parameter_id:str(v.parameter.id),parameter:str(v.parameter.name),unit:str(v.parameter.units),
   value_token:str(v.value),value_present:v.value===null||v.value===undefined?'false':'true',resolution,
   datetime_utc:str(to.utc),datetime_local:str(to.local),local_day:str(to.local).slice(0,10),
   period_from_utc:str(from.utc),period_from_local:str(from.local),period_to_utc:str(to.utc),period_to_local:str(to.local),
   period_interval:str(p.interval),period_label:str(p.label),latitude:str(coordinates.latitude),longitude:str(coordinates.longitude),
   has_flags:v.flagInfo?.hasFlags===true?'true':v.flagInfo?.hasFlags===false?'false':'unknown',
   coverage_json:json(v.coverage??null),summary_json:json(v.summary??null)};
  need(row.parameter&&row.unit,'OPENAQ_SERIES_IDENTITY_REQUIRED');
  if(v.period.datetimeTo?.utc)need(Number.isFinite(Date.parse(v.period.datetimeTo.utc)),'OPENAQ_PERIOD_INVALID');
  return row;
 });
}
export function archiveRows(capture,receipt,data){
 const input=new TextDecoder('utf-8',{fatal:true}).decode(data),rows=[];
 let header=null,position=null,rowNumber=0;
 const parser=createCsvRecordParser(cells=>{
  if(!header){
   header=cells;need(new Set(header).size===header.length,'OPENAQ_ARCHIVE_DUPLICATE_HEADER');
   const choose=(...names)=>{const found=names.filter(x=>header.includes(x));need(found.length===1,'OPENAQ_ARCHIVE_HEADER_REQUIRED','Expected exactly one of '+names.join(', ')+'.');return header.indexOf(found[0]);};
   position={location:choose('location_id'),sensor:choose('sensor_id','sensors_id'),name:choose('location'),time:choose('datetime'),
    latitude:choose('lat','latitude'),longitude:choose('lon','longitude'),parameter:choose('parameter'),unit:choose('unit','units'),value:choose('value')};
   return;
  }
  rowNumber++;need(cells.length===header.length,'OPENAQ_ARCHIVE_COLUMN_COUNT_CHANGED');
  need(whole(cells[position.location],'archive location ID')===capture.plan.locationId,'OPENAQ_ARCHIVE_LOCATION_CHANGED');
  const sensor=whole(cells[position.sensor],'archive sensor ID');
  if(capture.plan.sensorIds.length&&!capture.plan.sensorIds.includes(sensor))return;
  const t=cells[position.time];need(/(?:Z|[+-]\d{2}:\d{2})$/.test(t)&&Number.isFinite(Date.parse(t)),'OPENAQ_ARCHIVE_OFFSET_REQUIRED');
  const token=cells[position.value];numeric(token);
  const row={...common(capture,receipt,rowNumber-1),location_name:cells[position.name],sensor_id:String(sensor),
   parameter_id:'',parameter:cells[position.parameter],unit:cells[position.unit],value_token:token,value_present:token===''?'false':'true',
   resolution:'archive_reported',datetime_utc:new Date(t).toISOString(),datetime_local:t,local_day:t.slice(0,10),
   period_from_utc:'',period_from_local:'',period_to_utc:new Date(t).toISOString(),period_to_local:t,
   period_interval:'',period_label:'upstream-reported; interval not supplied in archive CSV',
   latitude:cells[position.latitude],longitude:cells[position.longitude],has_flags:'unknown',coverage_json:'',summary_json:''};
  need(row.parameter&&row.unit,'OPENAQ_SERIES_IDENTITY_REQUIRED');rows.push(row);
  need(rows.length<=capture.plan.maxRows,'OPENAQ_ROW_LIMIT_REACHED','The selected archive exceeds the reviewed full-row bound; no truncated capture is published.');
 },65536);
 parser.feed(input);parser.end();need(header,'OPENAQ_ARCHIVE_EMPTY');return {rows,originalHeaders:header,sourceRows:rowNumber};
}
export function encodeRows(rows){return csvLine(COLUMNS)+rows.map(r=>csvLine(COLUMNS.map(k=>str(r[k])))).join('');}
export function decodeRows(data){
 const rows=[];let header;const parser=createCsvRecordParser(cells=>{if(!header){header=cells;need(identity(header)===identity(COLUMNS),'OPENAQ_PROJECTION_COLUMNS_CHANGED');return;}
 need(cells.length===header.length,'OPENAQ_PROJECTION_ROW_CHANGED');rows.push(Object.fromEntries(header.map((k,i)=>[k,cells[i]])));},65536);
 parser.feed(new TextDecoder('utf-8',{fatal:true}).decode(data));parser.end();need(header,'OPENAQ_PROJECTION_MISSING');return rows;
}
export function sourceDescriptor(capture,review,filename='measurements.csv'){
 return {profile:'data-package',name:'openaq-study-'+capture.id,title:capture.plan.label,description:capture.plan.purpose,
  sources:[{title:'OpenAQ',path:'https://openaq.org/'},...capture.context.sources.map(s=>({title:s.title,path:s.url}))],
  contributors:[{title:review.reviewer,role:'maintainer'}],
  resources:[{name:'measurements',path:filename,format:'csv',encoding:'utf-8',dialect:{delimiter:',',quoteChar:'"',header:true},
   schema:{fields:COLUMNS.map(name=>({name,type:'string'})),missingValues:[]},
   description:'Lossless text projection of the retained original observations. Source bodies and acquisition receipts accompany this package.'}],
  openaq:{schema:'stellar-forge.openaq-package-context.v1',captureId:capture.id,captureSha256:capture.captureSha256,plan:capture.plan,
   semantics:SEMANTICS,context:capture.context,review,attribution:review.attribution,rightsBasis:review.rightsBasis,rightsSources:review.rightsSources}};
}
// Exact decimal comparisons keep retained tokens authoritative. No binary-float conversion enters exported measurements.
function decimal(s){
 if(!s)return null;const m=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s);if(!m)return null;
 const exponent=Number(m[4]??0)-(m[3]?.length??0);need(Number.isSafeInteger(exponent)&&Math.abs(exponent)<=1000,'OPENAQ_DECIMAL_RANGE_INVALID');
 return {n:BigInt((m[1]??'')+m[2]+(m[3]??'')),e:exponent};
}
function compare(a,b){const scale=Math.min(a.e,b.e),x=a.n*10n**BigInt(a.e-scale),y=b.n*10n**BigInt(b.e-scale);return x<y?-1:x>y?1:0;}
function add(a,b){if(!a)return b;const e=Math.min(a.e,b.e);return{n:a.n*10n**BigInt(a.e-e)+b.n*10n**BigInt(b.e-e),e};}
export function seriesSummary(rows,{includeMean=false,excludeFlagged=false}={}){
 const groups=new Map();
 for(const row of rows){
  const key=identity([row.capture_id,row.location_id,row.sensor_id,row.parameter_id,row.parameter,row.unit,row.resolution,row.period_interval]);
  if(!groups.has(key))groups.set(key,{key,captureId:row.capture_id,locationId:row.location_id,sensorId:row.sensor_id,parameterId:row.parameter_id,
   parameter:row.parameter,unit:row.unit,resolution:row.resolution,periodInterval:row.period_interval,rows:0,numericRows:0,missingRows:0,flaggedRows:0,unknownFlagRows:0,negativeRows:0,
   firstPeriodEndUTC:null,lastPeriodEndUTC:null,localDays:new Set(),minimum:null,maximum:null,sum:null});
  const g=groups.get(key);g.rows++;if(row.has_flags==='true')g.flaggedRows++;if(row.has_flags==='unknown')g.unknownFlagRows++;
  if(row.local_day)g.localDays.add(row.local_day);
  if(row.datetime_utc){const t=Date.parse(row.datetime_utc);if(Number.isFinite(t)){if(g.firstPeriodEndUTC===null||t<Date.parse(g.firstPeriodEndUTC))g.firstPeriodEndUTC=row.datetime_utc;if(g.lastPeriodEndUTC===null||t>Date.parse(g.lastPeriodEndUTC))g.lastPeriodEndUTC=row.datetime_utc;}}
  const v=row.value_present==='true'?decimal(row.value_token):null;
  if(!v){g.missingRows++;continue;}if(v.n<0n)g.negativeRows++;if(excludeFlagged&&row.has_flags==='true')continue;
  g.numericRows++;if(g.minimum===null||compare(v,decimal(g.minimum))<0)g.minimum=row.value_token;if(g.maximum===null||compare(v,decimal(g.maximum))>0)g.maximum=row.value_token;
  if(includeMean)g.sum=add(g.sum,v);
 }
 return [...groups.values()].map(g=>{
  const{sum,localDays,...v}=g;return{...v,localDays:[...localDays].sort(),
   ...(includeMean&&sum&&g.numericRows?{arithmeticMeanExact:{coefficient:sum.n.toString(),powerOfTen:sum.e,divisor:String(g.numericRows),
    method:'Unweighted arithmetic mean of retained numeric values in this exact series; not duration-weighted and not an AQI.'}}:{})};
 }).sort((a,b)=>[a.captureId,a.locationId,a.sensorId,a.resolution].join('/').localeCompare([b.captureId,b.locationId,b.sensorId,b.resolution].join('/')));
}
