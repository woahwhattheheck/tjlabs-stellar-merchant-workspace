// MIT. Original SF88 event exports into reviewed customer Analysis sources.
import {createHash} from 'node:crypto';

const EXPORT='stellar-forge.event-feed-export.v1';
export const ANALYSIS='stellar-forge.event-feed-analysis-source.v1';
const HASH=/^[a-f0-9]{64}$/, NAME=/^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const bytes=s=>Buffer.byteLength(s,'utf8');
const sha=s=>createHash('sha256').update(s).digest('hex');
const need=(v,m)=>{if(!v)throw new Error(m);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const identity=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const instant=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':object(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
const pointer=p=>{need(typeof p==='string'&&(p===''||p.startsWith('/'))&&!/~(?:[^01]|$)/.test(p)&&p.length<=2000,'Use an original JSON Pointer.');return p===''?[]:p.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'));};
function at(value,path) {for(const key of pointer(path)){if(value===null||typeof value!=='object'||!Object.prototype.hasOwnProperty.call(value,key))return{state:'missing',value:null};value=value[key];}return{state:value===null?'null':Array.isArray(value)?'array':typeof value,value};}
const textValue=selected=>['missing','null'].includes(selected.state)?null:typeof selected.value==='string'?selected.value:JSON.stringify(selected.value);
export function normalizeEventMapping(value={}) {
  need(object(value),'Use a complete mapping object.');
  const fields=value.fields??[];need(Array.isArray(fields)&&fields.length<=100,'Select at most 100 complete payload fields.');
  const reserved=new Set(['store_id','feed_id','feed_revision','source_id','event_id','sequence','event_type','received_at','occurred_at','occurred_at_state','source_body_sha256','payload_sha256','payload_json']);
  const seen=new Set(reserved);
  const mapped=fields.map(f=>{need(object(f)&&typeof f.name==='string'&&NAME.test(f.name)&&!seen.has(f.name.toLowerCase())&&!seen.has((f.name+'_state').toLowerCase()),'Choose distinct field names outside the original event columns.');seen.add(f.name.toLowerCase());seen.add((f.name+'_state').toLowerCase());pointer(f.pointer);return{name:f.name,pointer:f.pointer};});
  return{schema:'stellar-forge.event-feed-analysis-mapping.v1',fields:mapped};
}
export function inspectEventExport(ndjsonText,manifestText) {
  need(typeof ndjsonText==='string'&&typeof manifestText==='string','Receive both original complete files.');
  need(bytes(ndjsonText)<=32*1024*1024&&bytes(manifestText)<=4*1024*1024,'Select an original export within the complete source-document limits.');
  const m=JSON.parse(manifestText);
  need(object(m)&&m.schema===EXPORT&&identity(m.id)&&identity(m.feedId)&&identity(m.storeId)&&HASH.test(m.feedRevision),'The complete original export identity is required.');
  need(typeof m.source==='string'&&m.source.length<=3000,'Keep the original merchant resource URL.');
  const u=new URL(m.source);need(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash,'Retain the original resource origin/path without credentials or query.');
  need(integer(m.checkpointRevision)&&m.checkpointRevision>=1&&integer(m.throughSequence)&&integer(m.events)&&instant(m.createdAt),'The original export checkpoint is invalid.');
  need(m.cycleComplete===true,'Continue the original subscriber until its captured window is complete before customer Analysis.');
  need(object(m.data)&&m.data.format==='ndjson'&&m.data.bytes===bytes(ndjsonText)&&m.data.sha256===sha(ndjsonText),'The original export manifest must select these exact NDJSON bytes.');
  need(Array.isArray(m.pages)&&m.pages.length>0&&m.pages.length===m.checkpointRevision,'Retain every accepted original page.');
  let eventCount=0;const operations=new Set();
  m.pages.forEach((p,i)=>{need(object(p)&&p.ordinal===i+1&&identity(p.operationId)&&!operations.has(p.operationId)&&HASH.test(p.responseSha256)&&integer(p.events)&&(p.httpStatus===null||Number.isInteger(p.httpStatus)&&p.httpStatus>=100&&p.httpStatus<=599)&&(p.nativeStatus===null||typeof p.nativeStatus==='string'),'Retain the complete ordered page identities and recorded response outcomes.');operations.add(p.operationId);eventCount+=p.events;});
  need(eventCount===m.events,'The original page counts and retained event total differ.');
  const lines=ndjsonText===''?[]:ndjsonText.split('\n');
  if(lines.at(-1)==='')lines.pop();
  need(lines.length===m.events&&lines.every(line=>line.length>0),'Receive every original event row without blank records.');
  let prior=0;const ids=new Set();
  const events=lines.map((line,index)=>{
    const e=JSON.parse(line);need(object(e)&&integer(e.sequence)&&e.sequence>prior&&e.sequence<=m.throughSequence&&identity(e.sourceId)&&identity(e.eventId)&&typeof e.type==='string'&&e.type.length<=256&&instant(e.receivedAt)&&(e.occurredAt===null||instant(e.occurredAt))&&object(e.payload)&&HASH.test(e.sourceBodySha256)&&HASH.test(e.payloadSha256),'An original event row is invalid at '+(index+1)+'.');
    need(sha(JSON.stringify(e.payload))===e.payloadSha256,'The retained native payload digest differs at '+(index+1)+'.');
    const key=JSON.stringify([e.sourceId,e.eventId]);need(!ids.has(key),'An individual event identity is repeated.');ids.add(key);prior=e.sequence;
    return e;
  });
  const identityFields={id:m.id,source:m.source,storeId:m.storeId,feedId:m.feedId,feedRevision:m.feedRevision};
  return{schema:ANALYSIS,edition_id:sha(sha(ndjsonText)+':'+sha(manifestText)),source:identityFields,manifest:m,events,original_files:{ndjson:{bytes:bytes(ndjsonText),sha256:sha(ndjsonText)},manifest:{bytes:bytes(manifestText),sha256:sha(manifestText)}}};
}
export function projectEventExport(source,mapping={}) {
  const selected=normalizeEventMapping(mapping);
  const base=['store_id','feed_id','feed_revision','source_id','event_id','sequence','event_type','received_at','occurred_at','occurred_at_state','source_body_sha256','payload_sha256','payload_json'];
  const columns=[...base,...selected.fields.flatMap(f=>[f.name,f.name+'_state'])];
  const rows=source.events.map(e=>{
    const row={store_id:source.source.storeId,feed_id:source.source.feedId,feed_revision:source.source.feedRevision,source_id:e.sourceId,event_id:e.eventId,sequence:String(e.sequence),event_type:e.type,received_at:e.receivedAt,occurred_at:e.occurredAt,occurred_at_state:e.occurredAt===null?'null':'string',source_body_sha256:e.sourceBodySha256,payload_sha256:e.payloadSha256,payload_json:JSON.stringify(e.payload)};
    for(const f of selected.fields){const value=at(e.payload,f.pointer);row[f.name]=textValue(value);row[f.name+'_state']=value.state;}
    return row;
  });
  const document=JSON.stringify({events:rows})+'\n';need(bytes(document)<=32*1024*1024,'The complete projection exceeds the original Analysis JSON-document capacity; choose fewer projected fields or a smaller original subscription.');
  return{mapping:selected,mapping_sha256:sha(stable(selected)),columns,rows,document,document_bytes:bytes(document),document_sha256:sha(document)};
}
export function compareEventExports(before,after) {
  need(stable(before.source)===stable(after.source),'Use another customer programme for another subscription, source, store, feed or projection revision.');
  need(after.manifest.throughSequence>=before.manifest.throughSequence&&after.manifest.checkpointRevision>=before.manifest.checkpointRevision,'A later window cannot rewind the original subscriber checkpoint.');
  need(after.manifest.pages.length>=before.manifest.pages.length&&before.manifest.pages.every((p,i)=>stable(p)===stable(after.manifest.pages[i])),'The earlier original paid page history changed.');
  const old=new Map(before.events.map(e=>[JSON.stringify([e.sourceId,e.eventId]),e]));
  let retained=0;const added=[];
  for(const event of after.events){const key=JSON.stringify([event.sourceId,event.eventId]),prior=old.get(key);if(prior){need(stable(prior)===stable(event),'An earlier accepted individual event changed. Reconcile the original source before continuing.');old.delete(key);retained++;}else{need(event.sequence>before.manifest.throughSequence,'A new event appears behind the accepted complete window.');added.push({sourceId:event.sourceId,eventId:event.eventId,sequence:event.sequence});}}
  need(old.size===0,'A later cumulative export omitted original accepted events.');
  return{schema:'stellar-forge.event-feed-window-comparison.v1',before:before.edition_id,after:after.edition_id,retained,added:added.length,new_events:added,earlier_through_sequence:before.manifest.throughSequence,later_through_sequence:after.manifest.throughSequence,earlier_pages:before.manifest.pages.length,later_pages:after.manifest.pages.length};
}
