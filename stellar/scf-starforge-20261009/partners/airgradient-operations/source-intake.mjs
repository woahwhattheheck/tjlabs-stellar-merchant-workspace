// SPDX-License-Identifier: MIT
import {need,plain,text,timestamp,period,MEASURES,MAX_BODY,MAX_PACKAGE,canonical,sha,digest,envelope,verifyEnvelope,normalizeProject,locationKey} from './contract.mjs';
import {MAP_CONNECTION,mapConnection,verifyConnection,decodeJson,normalizeCapture} from './source.mjs';

const ORIGIN='https://map-data.airgradient.com';
const decode=bytes=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
const locationId=value=>{need(Number.isSafeInteger(Number(value))&&/^(?:0|[1-9]\d*)$/.test(String(value)),'NUMERIC_MAP_LOCATION_REQUIRED');return String(value);};
function originalUrl(record){
 need(record?.method==='GET'&&typeof record.url==='string'&&record.final_url===record.url,'ORIGINAL_SOURCE_REQUEST_REQUIRED');
 const url=new URL(record.url);need(url.origin===ORIGIN&&!url.username&&!url.password&&!url.hash,'PUBLIC_MAP_SOURCE_REQUIRED');
 need(plain(record.retrieval_window)&&Date.parse(timestamp(record.retrieval_window.not_before))<=Date.parse(timestamp(record.retrieval_window.not_after)),'SOURCE_RETRIEVAL_WINDOW_REQUIRED');
 text(record.reader,'SOURCE_READER');text(record.content_basis,'SOURCE_CONTENT_BASIS',1000);return url;
}
function rawPacket(input){
 need(input instanceof Uint8Array,'SOURCE_PACKET_BYTES_REQUIRED');const raw=Buffer.from(input);need(raw.length>0&&raw.length<=MAX_PACKAGE,'SOURCE_PACKET_TOO_LARGE');return raw;
}
export function inspectSourcePacket(input){
 const raw=rawPacket(input),packet=decode(raw);
 need(plain(packet)&&packet.schema==='commons.delivery.source_packet.v1'&&Array.isArray(packet.files)&&packet.files.length>0,'COMPLETE_COMMONS_SOURCE_PACKET_REQUIRED');
 const operationId=text(packet.operation_id,'SOURCE_OPERATION',240),createdAt=timestamp(packet.created_at),files=new Map();
 for(const file of packet.files){
  need(plain(file)&&typeof file.path==='string'&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(file.path)&&!file.path.split('/').some(p=>p==='.'||p==='..')&&!files.has(file.path),'INVALID_SOURCE_FILE_PATH');
  need(file.encoding==='utf8'&&typeof file.content==='string','ORIGINAL_UTF8_SOURCE_REQUIRED');const bytes=Buffer.from(file.content);
  need(bytes.length<=MAX_BODY&&file.bytes===bytes.length&&file.sha256===sha(bytes),'ORIGINAL_SOURCE_FILE_CHANGED');files.set(file.path,{...file,raw:bytes});
 }
 const json=path=>{const f=files.get(path);need(f,'SOURCE_PACKET_FILE_MISSING');return decodeJson(f.raw);};
 const scope=json('source-scope.json'),manifest=json('source-manifest.json');
 need(scope.schema==='commons.research.source_scope.v1'&&manifest.schema==='commons.research.sources.v1'&&scope.operation_id===operationId&&manifest.operation_id===operationId&&Array.isArray(scope.locations)&&Array.isArray(scope.histories)&&Array.isArray(manifest.sources),'SOURCE_SCOPE_BINDING_CHANGED');
 const definition=files.get('schemas/map-openapi.json');need(definition,'MAP_SOURCE_DEFINITION_REQUIRED');
 const connection=mapConnection(definition.raw,{id:definition.sha256===MAP_CONNECTION.definition.sha256?MAP_CONNECTION.id:'map-source-'+definition.sha256.slice(0,24)});
 const records=new Map();
 for(const record of manifest.sources){const file=files.get(record.path);need(file&&file.bytes===record.bytes&&file.sha256===record.sha256&&!records.has(record.path),'SOURCE_MANIFEST_CHANGED');records.set(record.path,record);}
 const definitionRecord=records.get(definition.path);need(definitionRecord?.url===connection.sourceUrl,'MAP_DEFINITION_SOURCE_CHANGED');
 const locations=[],byLocation=new Map(),histories=[];
 for(const item of scope.locations){
  need(plain(item)&&['indoor','outdoor'].includes(item.source),'PUBLIC_LOCATION_TYPE_REQUIRED');const id=locationId(item.location_id),key=locationKey(item.source,id);
  need(!byLocation.has(key)&&plain(item.location)&&String(item.location.locationId)===id,'SOURCE_LOCATION_CHANGED');
  const endpoint='/map/api/v1/'+(item.source==='indoor'?'indoor/':'')+'locations',candidates=[];
  for(const [path,record]of records){if(!record.url)continue;const url=new URL(record.url);if(url.origin!==ORIGIN||url.pathname!==endpoint)continue;
   originalUrl(record);const data=json(path);if(!Array.isArray(data.data))continue;
   const matches=data.data.filter(v=>String(v.locationId)===id);if(matches.length===1&&canonical(matches[0])===canonical(item.location))candidates.push(path);
  }
  need(candidates.length>0,'ORIGINAL_LOCATION_PAGE_REQUIRED');candidates.sort();const metadataPath=candidates[0];
  const value={id,sourceType:item.source,key,metadataPath,metadata:item.location};locations.push(value);byLocation.set(key,value);
 }
 need(locations.length>0&&locations.length<=20,'ONE_TO_TWENTY_LOCATIONS_REQUIRED');
 const historyKeys=new Set();
 for(const item of scope.histories){
  const id=locationId(item.location_id),key=locationKey(item.source,id),location=byLocation.get(key),file=files.get(item.source_file),record=records.get(item.source_file);
  need(location&&file&&record&&item.source_sha256===file.sha256&&item.source_url===record.url,'ORIGINAL_HISTORY_BINDING_CHANGED');
  const url=originalUrl(record),endpoint='/map/api/v1/'+(item.source==='indoor'?'indoor/':'')+'locations/'+id+'/measures/history';
  need(url.pathname===endpoint,'HISTORY_LOCATION_ROUTE_CHANGED');
  const names=[...url.searchParams.keys()],expected=item.source==='indoor'?['start','end','bucketSize']:['start','end','bucketSize','measure'];
  need(names.length===expected.length&&expected.every(n=>url.searchParams.getAll(n).length===1)&&names.every(n=>expected.includes(n)),'ORIGINAL_HISTORY_PARAMETERS_CHANGED');
  const window=period({start:url.searchParams.get('start'),end:url.searchParams.get('end')},url.searchParams.get('bucketSize'));
  need(timestamp(item.request_start)===window.start&&timestamp(item.request_end)===window.end&&item.bucket_size===window.bucket,'ORIGINAL_HISTORY_WINDOW_CHANGED');
  const measure=item.source==='outdoor'?url.searchParams.get('measure'):null;
  need(item.source==='indoor'||Object.hasOwn(MEASURES,measure)&&item.measure===measure,'ORIGINAL_HISTORY_MEASURE_CHANGED');
  const historyKey=key+':'+(measure??'all');need(!historyKeys.has(historyKey),'AMBIGUOUS_RETAINED_HISTORY');historyKeys.add(historyKey);
  const data=json(item.source_file);need(Array.isArray(data.data)&&data.data.length===item.returned_rows,'ORIGINAL_HISTORY_ROWS_CHANGED');
  histories.push({locationKey:key,sourceType:item.source,locationId:id,path:item.source_file,window,measure,measures:measure?[measure]:Object.keys(MEASURES)});
 }
 for(const location of locations)need(histories.some(h=>h.locationKey===location.key),'LOCATION_HISTORY_MISSING');
 const packetSha256=sha(raw),record=envelope('source-set',{id:'source_set_'+packetSha256,createdAt,operationId,caseUrl:typeof packet.case_url==='string'?packet.case_url:null,packetSha256,packetBytes:raw.length,rawBase64:raw.toString('base64')});
 const buckets=[...new Set(histories.map(h=>h.window.bucket))];need(buckets.length===1,'RETAINED_BUCKETS_DIFFER');
 const range=period({start:new Date(Math.max(...histories.map(h=>Date.parse(h.window.start)))).toISOString(),end:new Date(Math.min(...histories.map(h=>Date.parse(h.window.end)))).toISOString()},buckets[0]);
 const commonMeasures=Object.keys(MEASURES).filter(m=>locations.every(l=>histories.some(h=>h.locationKey===l.key&&h.measures.includes(m))));
 const reportWindows=(scope.report_windows??[]).map(w=>({id:text(w.id,'REPORT_WINDOW_ID',100),...period(w,range.bucket)}));
 need(reportWindows.every(w=>Date.parse(w.start)>=Date.parse(range.start)&&Date.parse(w.end)<=Date.parse(range.end)),'SOURCE_REPORT_WINDOW_OUTSIDE_REQUESTS');
 const summary={id:record.id,sha256:record.sha256,operationId,packetSha256,packetBytes:raw.length,files:files.size,sourceBytes:[...files.values()].reduce((n,f)=>n+f.bytes,0),connectionId:connection.id,range,reportWindows,commonMeasures,
  locations:locations.map(l=>({id:l.id,sourceType:l.sourceType,label:l.metadata.locationName??(l.sourceType==='indoor'?'Indoor ':'Outdoor ')+l.id,timezone:l.metadata.timezone??'UTC',measures:[...new Set(histories.filter(h=>h.locationKey===l.key).flatMap(h=>h.measures))]}))};
 return {record,packet,scope,files,records,connection,locations,histories,summary};
}
export function inspectSourceSet(value){
 verifyEnvelope(value,'source-set');need(typeof value.rawBase64==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.rawBase64),'SOURCE_SET_ENCODING_CHANGED');
 const inspected=inspectSourcePacket(Buffer.from(value.rawBase64,'base64'));need(inspected.record.sha256===value.sha256,'SOURCE_SET_CHANGED');return inspected;
}
export function sourceProject(inspected,input){
 const summary=inspected.summary;
 return normalizeProject({...input,connectionId:inspected.connection.id,bucket:summary.range.bucket,locations:input.locations??summary.locations.map(({id,sourceType,label,timezone})=>({id,sourceType,label,timezone})),measures:input.measures??summary.commonMeasures});
}
export function retainedTasks(project,window,connection,inspected){
 verifyConnection(connection);need(connection.sha256===inspected.connection.sha256,'RETAINED_SOURCE_CONNECTION_CHANGED');const tasks=[];
 function add(task,path,extra={}){
  const file=inspected.files.get(path),record=inspected.records.get(path);need(file&&record,'RETAINED_SOURCE_MISSING');
  tasks.push({...task,...extra,url:record.url,sourceSetId:inspected.record.id,sourceSetSha256:inspected.record.sha256,sourcePath:path,sourceRawSha256:file.sha256,sourceRecord:record});
 }
 for(const selected of project.locations){
  const key=locationKey(selected.sourceType,selected.id),location=inspected.locations.find(l=>l.key===key);need(location,'LOCATION_NOT_IN_RETAINED_SOURCE');
  const identity={locationId:selected.id,locationKey:key,sourceType:selected.sourceType};
  add({key:key+':metadata',kind:'metadata',...identity},location.metadataPath,{metadataSelector:{kind:'catalogue-location',locationId:selected.id,sourceType:selected.sourceType}});
  const measures=selected.sourceType==='indoor'?[null]:project.measures;
  for(const measure of measures){
   const history=inspected.histories.find(h=>h.locationKey===key&&h.measure===measure);need(history,'MEASURE_NOT_IN_RETAINED_SOURCE');
   need(window.bucket===history.window.bucket&&Date.parse(window.start)>=Date.parse(history.window.start)&&Date.parse(window.end)<=Date.parse(history.window.end),'REPORT_PERIOD_OUTSIDE_RETAINED_SOURCE');
   add({key:key+':'+(measure??'history'),kind:'history',...identity,...(measure?{measure}:{measures:project.measures})},history.path,{sourceWindow:history.window});
  }
 }
 return tasks.map((task,index)=>({...task,index,requestSha256:digest({method:'GET',url:task.url,connectionSha256:connection.sha256})}));
}
export function retainedCapture(plan,task,connection,inspected){
 need(plan.sourceSetId===inspected.record.id&&plan.sourceSetSha256===inspected.record.sha256,'PLAN_SOURCE_SET_CHANGED');const raw=inspected.files.get(task.sourcePath).raw;
 normalizeCapture(raw,task,connection,plan.period);
 const metadata=envelope('capture',{id:'capture_'+digest({planId:plan.id,taskKey:task.key,sourceSetId:inspected.record.id}),origin:'retained-source',planId:plan.id,taskKey:task.key,attemptId:null,
  sourceSetId:inspected.record.id,sourceSetSha256:inspected.record.sha256,sourcePath:task.sourcePath,sourceRecordSha256:digest(task.sourceRecord),
  requestSha256:task.requestSha256,connectionSha256:connection.sha256,sourceUrl:task.url,retrievedAt:null,retrievalWindow:task.sourceRecord.retrieval_window,
  sourceReader:task.sourceRecord.reader,contentBasis:task.sourceRecord.content_basis,status:null,contentType:null,retryAfter:null,retryAt:null,bytes:raw.length,rawSha256:sha(raw)});
 return {metadata,raw};
}
export function verifyRetainedCapture(metadata,task,plan){
 need(metadata.origin==='retained-source'&&metadata.status===null&&metadata.attemptId===null&&metadata.retrievedAt===null&&metadata.retryAfter===null&&metadata.retryAt===null&&metadata.contentType===null,'RETAINED_CAPTURE_KIND_CHANGED');
 need(metadata.planId===plan.id&&metadata.taskKey===task.key&&metadata.sourceSetId===plan.sourceSetId&&metadata.sourceSetSha256===plan.sourceSetSha256&&metadata.sourcePath===task.sourcePath&&metadata.rawSha256===task.sourceRawSha256&&metadata.sourceRecordSha256===digest(task.sourceRecord),'RETAINED_CAPTURE_BINDING_CHANGED');
 need(metadata.requestSha256===task.requestSha256&&metadata.connectionSha256===plan.connectionSha256&&metadata.sourceUrl===task.url&&canonical(metadata.retrievalWindow)===canonical(task.sourceRecord.retrieval_window)&&metadata.sourceReader===task.sourceRecord.reader&&metadata.contentBasis===task.sourceRecord.content_basis,'RETAINED_SOURCE_PROVENANCE_CHANGED');return metadata;
}
