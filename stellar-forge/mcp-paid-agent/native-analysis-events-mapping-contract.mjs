// SPDX-License-Identifier: MIT
// Exact complete mapping-source selection over the original native comparison.
import {EVENT_ID,EVENT_NAME,EVENT_HASH,EVENT_MAPPING_SOURCE_LIMIT,eventObject as object,
 eventNeed as need,eventCanonical,eventHash as sha} from './native-analysis-events-contract.mjs';
export const EVENT_MAPPING_PAIR='stellar-forge.event-mapping-source-pair.v1';
const copy=v=>JSON.parse(JSON.stringify(v));
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function mappingSourceSelection(value){
 need(exact(value,['programme','input_id','mapping','expected'])&&EVENT_NAME.test(value.programme??'')&&
  EVENT_ID.test(value.input_id??''),'MAPPING_SOURCE_SELECTION_REQUIRED');
 const m=value.mapping,e=value.expected;
 need(object(m)&&Object.keys(m).every(k=>['fields','schema'].includes(k))&&
  (m.schema===undefined||m.schema==='stellar-forge.event-feed-analysis-mapping.v1')&&
  Array.isArray(m.fields)&&m.fields.length<=100,'MAPPING_SOURCE_MAPPING_REQUIRED');
 for(const f of m.fields)need(exact(f,['name','pointer'])&&/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(f.name??'')&&
  typeof f.pointer==='string'&&f.pointer.length<=2000&&(f.pointer===''||f.pointer.startsWith('/'))&&
  !/~(?:[^01]|$)/.test(f.pointer),'MAPPING_SOURCE_FIELD_REQUIRED');
 need(exact(e,['comparison_sha256','programme_revision','baseline_operation_id','receiver'])&&
  EVENT_HASH.test(e.comparison_sha256??'')&&Number.isSafeInteger(e.programme_revision)&&e.programme_revision>=0&&
  EVENT_ID.test(e.baseline_operation_id??'')&&exact(e.receiver,['cli_sha256','core_sha256'])&&
  EVENT_HASH.test(e.receiver.cli_sha256??'')&&EVENT_HASH.test(e.receiver.core_sha256??''),'MAPPING_SOURCE_BASIS_REQUIRED');
 return copy(value);
}
export function mappingSourceSelectionHash(selection){return sha(Buffer.from(eventCanonical(mappingSourceSelection(selection))));}
export function mappingSelectionFromComparison(c){
 need(object(c)&&c.schema==='stellar-forge.event-feed-mapping-comparison.v1','ORIGINAL_MAPPING_COMPARISON_REQUIRED');
 return mappingSourceSelection({programme:c.programme,input_id:c.input_id,mapping:c.mapping,expected:{
  comparison_sha256:c.comparison_sha256,programme_revision:c.programme_revision,
  baseline_operation_id:c.baseline_operation_id,receiver:c.receiver}});
}
export function validateMappingSource(raw,selected,workspace){
 need(Buffer.isBuffer(raw)&&raw.length>0&&raw.length<=EVENT_MAPPING_SOURCE_LIMIT&&EVENT_ID.test(workspace??''),
  'COMPLETE_MAPPING_SOURCE_REQUIRED');
 selected=mappingSourceSelection(selected);
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{need(false,'MAPPING_SOURCE_JSON_INVALID');}
 const c=value?.comparison,e=selected.expected;
 need(exact(value,['schema','comparison','files'])&&value.schema===EVENT_MAPPING_PAIR&&
  object(c)&&c.schema==='stellar-forge.event-feed-mapping-comparison.v1'&&
  c.workspace_id===workspace&&c.programme===selected.programme&&c.input_id===selected.input_id&&
  c.comparison_sha256===e.comparison_sha256&&c.programme_revision===e.programme_revision&&
  c.baseline_operation_id===e.baseline_operation_id&&eventCanonical(c.receiver)===eventCanonical(e.receiver)&&
  eventCanonical(c.mapping?.fields)===eventCanonical(selected.mapping.fields)&&
  exact(value.files,['previous','current']),'MAPPING_SOURCE_CHANGED');
 for(const side of ['previous','current']){
  need(exact(value.files[side],['ndjson','manifest'])&&object(c[side]?.original_files),'MAPPING_SOURCE_CHANGED');
  for(const kind of ['ndjson','manifest']){
   const f=value.files[side][kind],basis=c[side].original_files[kind],limit=(kind==='ndjson'?32:4)*1024*1024;
   need(exact(f,['name','bytes','sha256','text'])&&typeof f.name==='string'&&f.name.length>0&&
    f.name.length<=240&&!/[\u0000-\u001f]/.test(f.name)&&typeof f.text==='string'&&
    Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<=limit&&EVENT_HASH.test(f.sha256??'')&&
    basis?.bytes===f.bytes&&basis.sha256===f.sha256,'MAPPING_ORIGINAL_FILE_CHANGED');
   const body=Buffer.from(f.text,'utf8');need(body.length===f.bytes&&sha(body)===f.sha256,'MAPPING_ORIGINAL_FILE_CHANGED');
  }
 }
 return value;
}
export function mappingSourceSummary(raw,selection,workspace){
 const value=validateMappingSource(raw,selection,workspace),c=value.comparison;
 return {schema:EVENT_MAPPING_PAIR,workspace_id:workspace,programme:c.programme,input_id:c.input_id,
  selection_sha256:mappingSourceSelectionHash(selection),comparison_sha256:c.comparison_sha256,
  programme_revision:c.programme_revision,baseline_operation_id:c.baseline_operation_id,receiver:copy(c.receiver),
  files:Object.fromEntries(['previous','current'].map(side=>[side,Object.fromEntries(['ndjson','manifest'].map(kind=>{
   const {text,...file}=value.files[side][kind];return[kind,file];}))]))};
}
