// SPDX-License-Identifier: MIT
// Retained official public indoor/outdoor Map and private Dashboard contracts.
import {readFileSync} from 'node:fs';
import {MAP_ORIGIN,DASHBOARD_ORIGIN,MAP_SOURCE,MEASURES,MAX_BODY,need,plain,text,identifier,timestamp,finite,digest,sha,envelope,verifyEnvelope,locationKey} from './contract.mjs';

export function mapConnection(input,options={}){
 const raw=Buffer.from(input),spec=decodeJson(raw);need(spec.openapi==='3.0.0'&&plain(spec.paths)&&plain(spec.components?.schemas)&&spec.servers?.some(v=>v.url===MAP_ORIGIN),'OFFICIAL_MAP_OPENAPI_REQUIRED');
 for(const path of ['/map/api/v1/locations/{id}','/map/api/v1/locations/{id}/measures/history','/map/api/v1/indoor/locations/{id}','/map/api/v1/indoor/locations/{id}/measures/history'])need(spec.paths[path]?.get,'MAP_LOCATION_OPERATION_CHANGED');
 const indoor=resolve(spec,{$ref:'#/components/schemas/IndoorMeasurementHistoryDto'});need(indoor.properties?.timebucket?.type==='string','MAP_INDOOR_TIMESTAMP_CHANGED');
 for(const measure of Object.keys(MEASURES))need(indoor.properties?.[measure]&&['number','integer'].includes(indoor.properties[measure].type),'MAP_INDOOR_MEASURE_CHANGED');
 const operation=spec.paths['/map/api/v1/indoor/locations/{id}/measures/history'].get,queries=new Map((operation.parameters??[]).filter(p=>p.in==='query').map(p=>[p.name,p]));
 need(['start','end','bucketSize'].every(k=>queries.has(k))&&!queries.has('measure')&&!queries.has('excludeOutliers'),'MAP_INDOOR_HISTORY_PARAMETERS_CHANGED');
 for(const [type,path]of [['outdoor','/map/api/v1/locations/{id}/measures/history'],['indoor','/map/api/v1/indoor/locations/{id}/measures/history']]){
  const get=spec.paths[path].get,parameters=new Map(get.parameters.map(p=>[p.in+':'+p.name,p]));
  need(parameters.get('path:id')?.required&&parameters.get('path:id').schema?.type==='number','MAP_LOCATION_ID_CHANGED');
  for(const name of ['start','end'])need(parameters.get('query:'+name)?.required&&parameters.get('query:'+name).schema?.type==='string'&&/with timezone/.test(parameters.get('query:'+name).description??''),'MAP_HISTORY_TIME_CHANGED');
  const buckets=parameters.get('query:bucketSize');need(buckets?.required&&['15m','1h','8h','1d'].every(x=>buckets.schema?.enum?.includes(x)),'MAP_HISTORY_BUCKET_CHANGED');
  if(type==='outdoor')need(Object.keys(MEASURES).every(x=>parameters.get('query:measure')?.schema?.enum?.includes(x)),'MAP_OUTDOOR_MEASURES_CHANGED');
  const response=resolve(spec,get.responses?.['200']?.content?.['application/json']?.schema),data=response.properties?.data;
  need(data?.type==='array','MAP_HISTORY_RESPONSE_CHANGED');const row=resolve(spec,data.items);
  need(row.properties?.timebucket?.type==='string'&&(type==='indoor'||row.properties?.value?.type==='number'),'MAP_HISTORY_ROW_CHANGED');
 }

 return envelope('connection',{id:identifier(options.id??'map-public','CONNECTION_ID'),kind:'map-public',title:text(options.title??'AirGradient public Map','CONNECTION_TITLE'),origin:MAP_ORIGIN,sourceUrl:MAP_SOURCE,
  definition:{sha256:sha(raw),rawBase64:raw.toString('base64'),version:spec.info?.version??null,title:spec.info?.title??null}});
}
const DEFINITION_URL='https://api.airgradient.com/public/docs/api/v1/swagger.json';
const PAST='/public/api/v1/locations/{locationId}/measures/past',CURRENT='/public/api/v1/locations/{locationId}/measures/current';
const FIELDS={pm25:'pm02_corrected',pm10:'pm10_corrected',atmp:'atmp_corrected',rhum:'rhum_corrected',rco2:'rco2_corrected'};
export function decodeJson(bytes){need(bytes.length<=MAX_BODY,'SOURCE_TOO_LARGE');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
function resolve(spec,node,depth=0){
 need(depth<24&&plain(node),'INVALID_SWAGGER_SCHEMA');
 if(node.$ref){need(typeof node.$ref==='string'&&node.$ref.startsWith('#/'),'LOCAL_SCHEMA_REFERENCE_REQUIRED');let target=spec;
  for(const p of node.$ref.slice(2).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'))){need(plain(target)&&Object.hasOwn(target,p),'SCHEMA_REFERENCE_MISSING');target=target[p];}return resolve(spec,target,depth+1);
 }
 if(node.allOf){const result={...node,properties:{...node.properties}};delete result.allOf;for(const part of node.allOf){const v=resolve(spec,part,depth+1);Object.assign(result.properties,v.properties??{});if(v.type)result.type=v.type;}return result;}
 return node;
}
export function inspectDashboardDefinition(raw){
 const spec=decodeJson(raw);need(spec.swagger==='2.0'&&(!spec.host||spec.host==='api.airgradient.com')&&plain(spec.paths),'OFFICIAL_DASHBOARD_SWAGGER_REQUIRED');
 return {sha256:sha(raw),title:spec.info?.title??null,version:spec.info?.version??null,
  operations:Object.entries(spec.paths).filter(([path,item])=>item.get&&/locations/.test(path)).map(([path,item])=>({path,operationId:item.get.operationId??null,summary:item.get.summary??'',parameters:item.get.parameters??[],response:item.get.responses?.['200']?.schema??null})),definitions:spec.definitions??{}};
}
export function dashboardConnection(input,options={}){
 const raw=Buffer.from(input),info=inspectDashboardDefinition(raw),spec=decodeJson(raw),operation=spec.paths[PAST]?.get,current=spec.paths[CURRENT]?.get;
 need(operation?.operationId==='getPastMeasures'&&current?.operationId==='getCurrentMeasures','DASHBOARD_HISTORY_OPERATION_CHANGED');
 need(!spec.basePath||spec.basePath==='/','DASHBOARD_BASE_PATH_CHANGED');
 const params=new Map((operation.parameters??[]).map(p=>[p.in+':'+p.name,p]));
 need(params.get('path:locationId')?.type==='number'&&params.get('path:locationId').required&&params.get('query:from')?.type==='string'&&params.get('query:from').required&&params.get('query:to')?.type==='string'&&params.get('query:to').required,'DASHBOARD_HISTORY_PARAMETERS_CHANGED');
 need((operation.parameters??[]).filter(p=>p.required).every(p=>['locationId','from','to'].includes(p.name)),'DASHBOARD_REQUIRED_PARAMETER_CHANGED');
 need(/basic format/i.test(params.get('query:from').description??'')&&/basic format/i.test(params.get('query:to').description??''),'DASHBOARD_TIME_FORMAT_CHANGED');
 const match=/limited to (\d+) days/i.exec(params.get('query:to').description??''),maxDays=match?Number(match[1]):0;need(maxDays>=1&&maxDays<=30,'DASHBOARD_HISTORY_LIMIT_CHANGED');
 need(/5 minute buckets or 60 minutes buckets/i.test(operation.summary??''),'DASHBOARD_RETURNED_CADENCE_CHANGED');
 const response=resolve(spec,operation.responses?.['200']?.schema);need(response.type==='array','DASHBOARD_HISTORY_ARRAY_CHANGED');const row=resolve(spec,response.items);
 need(row.properties?.timestamp?.type==='string','DASHBOARD_TIMESTAMP_CHANGED');
 const measures={};for(const [measure,field]of Object.entries(FIELDS)){
  const property=row.properties?.[field];need(property&&['number','integer'].includes(property.type),'DASHBOARD_MEASUREMENT_CHANGED');
  measures[measure]={field,unit:MEASURES[measure].unit,meaning:property.description};
 }
 need(row.properties?.datapoints?.type==='integer','DASHBOARD_DATAPOINTS_CHANGED');
 need(spec.securityDefinitions?.TokenQuery?.type==='apiKey'&&spec.securityDefinitions.TokenQuery.in==='query'&&spec.securityDefinitions.TokenQuery.name==='token'&&(operation.security??spec.security)?.some(x=>Object.hasOwn(x,'TokenQuery')),'DASHBOARD_AUTHENTICATION_CHANGED');
 const tokenEnv=text(options.tokenEnv??'AIRGRADIENT_TOKEN','TOKEN_ENV',100);need(/^[A-Za-z_][A-Za-z0-9_]*$/.test(tokenEnv),'INVALID_TOKEN_ENV');
 return envelope('connection',{id:identifier(options.id??'dashboard','CONNECTION_ID'),kind:'dashboard',title:text(options.title??'Authorised AirGradient Dashboard','CONNECTION_TITLE'),origin:DASHBOARD_ORIGIN,sourceUrl:DEFINITION_URL,
  definition:{sha256:info.sha256,rawBase64:raw.toString('base64'),version:info.version,title:info.title},
  binding:{historyPath:PAST,currentPath:CURRENT,maximumPeriodDays:maxDays,timeEncoding:'basic-iso',returnedCadence:'Provider-selected five- or sixty-minute aggregates',measures,tokenEnv}});
}
export const MAP_CONNECTION=mapConnection(readFileSync(new URL('./sources/map-openapi-original-20261013.json',import.meta.url)));
export const DEFAULT_DASHBOARD_CONNECTION=dashboardConnection(readFileSync(new URL('./sources/dashboard-openapi-original-20261013.json',import.meta.url)));
export function verifyConnection(v){
 verifyEnvelope(v,'connection');if(v.kind==='map-public'){
  const raw=Buffer.from(v.definition.rawBase64,'base64');need(sha(raw)===v.definition.sha256,'SOURCE_DEFINITION_CHANGED');const rebuilt=mapConnection(raw,{id:v.id,title:v.title});need(rebuilt.sha256===v.sha256,'MAP_CONNECTION_CHANGED');return v;
 }
 need(v.kind==='dashboard','UNSUPPORTED_CONNECTION');const raw=Buffer.from(v.definition.rawBase64,'base64');need(sha(raw)===v.definition.sha256,'SOURCE_DEFINITION_CHANGED');
 const rebuilt=dashboardConnection(raw,{id:v.id,title:v.title,tokenEnv:v.binding.tokenEnv});need(rebuilt.sha256===v.sha256,'CONNECTION_BINDING_CHANGED');return v;
}
const basic=value=>value.replaceAll('-','').replaceAll(':','').replace(/\.\d{3}Z$/,'Z');
export function acquisitionTasks(project,window,connection){
 verifyConnection(connection);const tasks=[];
 for(const location of project.locations){
  const sourceType=location.sourceType,key=locationKey(sourceType,location.id),identity={locationId:location.id,locationKey:key,sourceType};
  if(connection.kind==='map-public'){
   need(['outdoor','indoor'].includes(sourceType),'PUBLIC_LOCATION_TYPE_REQUIRED');need(/^(?:0|[1-9]\d*)$/.test(location.id)&&Number.isSafeInteger(Number(location.id)),'NUMERIC_MAP_LOCATION_REQUIRED');
   const base=MAP_ORIGIN+'/map/api/v1/'+(sourceType==='indoor'?'indoor/':'')+'locations/'+encodeURIComponent(location.id);
   tasks.push({key:key+':metadata',kind:'metadata',...identity,url:base});
   if(sourceType==='indoor'){
    const u=new URL(base+'/measures/history');for(const [k,v]of Object.entries({start:window.start,end:window.end,bucketSize:window.bucket}))u.searchParams.set(k,v);
    tasks.push({key:key+':history',kind:'history',...identity,measures:project.measures,url:u.href});
   }else for(const measure of project.measures){
    const u=new URL(base+'/measures/history');for(const [k,v]of Object.entries({measure,start:window.start,end:window.end,bucketSize:window.bucket}))u.searchParams.set(k,String(v));
    tasks.push({key:key+':'+measure,kind:'history',...identity,measure,url:u.href});
   }
  }else{
   need(sourceType==='dashboard'&&/^\d+$/.test(location.id)&&Number.isSafeInteger(Number(location.id)),'NUMERIC_DASHBOARD_LOCATION_REQUIRED');need(project.measures.every(m=>connection.binding.measures[m]),'CONNECTION_MEASURE_UNSUPPORTED');
   const selected=encodeURIComponent(location.id),b=connection.binding;
   tasks.push({key:key+':metadata',kind:'metadata',...identity,url:connection.origin+b.currentPath.replace('{locationId}',selected)});
   const start=Date.parse(window.start),end=Date.parse(window.end),limit=b.maximumPeriodDays*86400000;
   // Original overlapping bytes stay; interpretation owns each timestamp once.
   const count=Math.ceil((end-start)/(limit-2000)),chunk=Math.ceil((end-start)/count/1000)*1000;
   for(let from=start,index=0;from<end;from+=chunk,index++){
    const to=Math.min(from+chunk,end),u=new URL(b.historyPath.replace('{locationId}',selected),connection.origin),segment={start:new Date(from).toISOString(),end:new Date(to).toISOString()};
    u.searchParams.set('from',basic(new Date(from-1000).toISOString()));u.searchParams.set('to',basic(new Date(to+1000).toISOString()));
    tasks.push({key:key+':history:'+index,kind:'history',...identity,segment,url:u.href});
   }
  }
 }
 return tasks.map((task,index)=>({...task,index,requestSha256:digest({method:'GET',url:task.url,connectionSha256:connection.sha256})}));
}
export function privateRequest(task,connection,environment=process.env){
 const url=new URL(task.url);need(url.origin===connection.origin,'SOURCE_ORIGIN_CHANGED');
 if(connection.kind==='dashboard'){const token=environment[connection.binding.tokenEnv];need(typeof token==='string'&&token.length&&token.length<=4096&&!/[\r\n]/.test(token),'AIRGRADIENT_TOKEN_REQUIRED');url.searchParams.set('token',token);}return url.href;
}
export function normalizeCapture(raw,task,connection,window){
 const data=decodeJson(raw);
 if(task.kind==='metadata'){need(plain(data)&&String(data.locationId)===task.locationId,'LOCATION_RESPONSE_CHANGED');return {metadata:{...data,sourceType:task.sourceType},series:[]};}
 let records,measurements;if(connection.kind==='map-public'){
  need(plain(data)&&Array.isArray(data.data),'MAP_HISTORY_ARRAY_REQUIRED');records=data.data;
  measurements=task.sourceType==='indoor'?Object.fromEntries(task.measures.map(m=>[m,{field:m,unit:MEASURES[m].unit}])):{[task.measure]:{field:'value',unit:MEASURES[task.measure].unit}};
 }
 else{need(Array.isArray(data),'DASHBOARD_HISTORY_ARRAY_REQUIRED');records=data;measurements=connection.binding.measures;}
 const output=[],seen=new Set(),excluded={before:0,atOrAfterEnd:0},start=Math.max(Date.parse(window.start),Date.parse(task.segment?.start??window.start)),end=Math.min(Date.parse(window.end),Date.parse(task.segment?.end??window.end));
 for(const row of records){
  need(plain(row),'HISTORY_ROW_REQUIRED');if(connection.kind==='dashboard'&&row.locationId!==undefined)need(String(row.locationId)===task.locationId,'HISTORY_LOCATION_CHANGED');
  const utc=timestamp(row[connection.kind==='map-public'?'timebucket':'timestamp']),epoch=Date.parse(utc);
  if(epoch<start){excluded.before++;continue;}if(epoch>=end){excluded.atOrAfterEnd++;continue;}
  if(connection.kind==='map-public')need((epoch-Date.parse(window.start))%(window.seconds*1000)===0,'SOURCE_BUCKET_ALIGNMENT_CHANGED');
  const sourceDatapoints=connection.kind==='dashboard'?finite(row.datapoints):null;need(sourceDatapoints===null||Number.isSafeInteger(sourceDatapoints)&&sourceDatapoints>=0,'INVALID_SOURCE_DATAPOINTS');
  for(const [measure,{field,unit}]of Object.entries(measurements)){
   const key=measure+':'+utc;need(!seen.has(key),'DUPLICATE_SOURCE_TIMESTAMP');seen.add(key);const original=Object.hasOwn(row,field)?row[field]:null,value=finite(original);
   output.push({locationId:task.locationId,locationKey:task.locationKey,sourceType:task.sourceType,measure,unit,utc,value,originalValue:original,sourceDatapoints});
  }
 }
 output.sort((a,b)=>a.utc.localeCompare(b.utc)||a.measure.localeCompare(b.measure));
 return {metadata:null,series:output,excluded,returnedRows:records.length};
}
export function reportingBins(rows,window){
 const start=Date.parse(window.start),step=window.seconds*1000,groups=new Map(),seen=new Set();
 for(const row of rows){need(!seen.has(row.utc),'DUPLICATE_REPORT_SOURCE_TIMESTAMP');seen.add(row.utc);const bucket=new Date(start+Math.floor((Date.parse(row.utc)-start)/step)*step).toISOString();
  const group=groups.get(bucket)??{utc:bucket,returnedRows:0,availableRows:0,sum:0};group.returnedRows++;if(row.value!==null){group.availableRows++;group.sum+=row.value;}groups.set(bucket,group);}
 return [...groups.values()].sort((a,b)=>a.utc.localeCompare(b.utc)).map(({sum,...group})=>({...group,value:group.availableRows?sum/group.availableRows:null}));
}
