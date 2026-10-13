// MIT. Municipal asset transport contracts shared by the native client and merchant adapter.
import { createHash } from 'node:crypto';
export const PREFIX = 'merchant_municipal_assets_';
export const HOST_SCHEMA = 'stellar-forge.municipal-asset-host.v1';
export const JOURNAL_SCHEMA = 'stellar-forge.municipal-asset-agent-operation.v1';
export const HASH = /^[a-f0-9]{64}$/;
export const MAX_FILE = 256 * 1024 * 1024;
export const KINDS = ['source_assets','target_assets','locations','requests','work_orders','returns'];
export const INPUT_KINDS = [...KINDS,'roundtrips'];
export const FORMATS = ['csv','json','jsonl','geojson','esri-json','belleville-capture','maximo-target'];
export const fail = (code, message) => Object.assign(new Error(message), {code});
export function need(value, message, code='MUNICIPAL_ASSET_INVALID') { if (!value) throw fail(code,message); }
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function exact(value, keys, required=[]) {
  need(plain(value) && Object.keys(value).every(key=>keys.includes(key)) &&
    required.every(key=>Object.hasOwn(value,key)), 'Supply every required field and only declared fields.');
}
export function canonical(value) {
  if (value===null || typeof value==='boolean' || typeof value==='string') return JSON.stringify(value);
  if (typeof value==='number') { need(Number.isFinite(value),'Use finite JSON numbers.'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  need(plain(value),'Use complete JSON values.');
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export const clone = value => JSON.parse(canonical(value));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function identifier(value,label='Identifier') {
  need(typeof value==='string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value),label+' must be a declared lowercase alias.'); return value;
}
export function text(value,label,maximum=4000,minimum=1) {
  need(typeof value==='string' && value.length>=minimum && value.length<=maximum && !value.includes('\0'),
    'Supply '+label+' within its supported length.'); return value;
}
export function operation(value) { return text(value,'the original request ID',100); }
export function revision(value) { need(Number.isSafeInteger(value)&&value>=0,'Use the observed nonnegative project revision.'); return value; }
export function validate(value,schema,label='input') {
  if (Array.isArray(schema.type)) {
    const actual=value===null?'null':Array.isArray(value)?'array':Number.isInteger(value)&&schema.type.includes('integer')?'integer':typeof value;
    need(schema.type.includes(actual),'Use the declared '+label+'.'); return validate(value,{...schema,type:actual},label);
  }
  if(schema.type==='null')need(value===null,'Use null for '+label+'.');
  if(schema.type==='string')need(typeof value==='string'&&value.length>=(schema.minLength??0)&&
    value.length<=(schema.maxLength??Number.MAX_SAFE_INTEGER)&&(!schema.pattern||new RegExp(schema.pattern).test(value)),
    'Use the declared '+label+'.');
  if(schema.type==='integer')need(Number.isSafeInteger(value)&&value>=(schema.minimum??0)&&value<=(schema.maximum??Number.MAX_SAFE_INTEGER),'Use the supported integer '+label+'.');
  if(schema.type==='number')need(typeof value==='number'&&Number.isFinite(value),'Use a finite '+label+'.');
  if(schema.type==='boolean')need(typeof value==='boolean','Use a boolean '+label+'.');
  if(schema.enum)need(schema.enum.includes(value),'Choose a declared '+label+'.');
  if(schema.type==='array'){
    need(Array.isArray(value)&&value.length>=(schema.minItems??0)&&value.length<=(schema.maxItems??Number.MAX_SAFE_INTEGER),'Use the declared array '+label+'.');
    if(schema.uniqueItems)need(new Set(value.map(canonical)).size===value.length,'Choose distinct '+label+' values.');
    if(schema.items)for(let i=0;i<value.length;i++)validate(value[i],schema.items,label+'['+i+']');
  }
  if(schema.type==='object'){
    need(plain(value),'Use the complete '+label+' object.');
    if(schema.additionalProperties===false)exact(value,Object.keys(schema.properties??{}),schema.required??[]);
    for(const key of schema.required??[])need(Object.hasOwn(value,key),'Supply '+label+'.'+key+'.');
    for(const [key,item]of Object.entries(value)){
      if(schema.properties?.[key])validate(item,schema.properties[key],label+'.'+key);
      else if(plain(schema.additionalProperties))validate(item,schema.additionalProperties,label+'.'+key);
    }
  }
}
export function page(rows,{offset=0,limit=50}={}) {
  revision(offset);need(Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'Select a page of 1 to 200 rows.');
  need(offset<=rows.length,'Select an offset within the original set.');
  const items=rows.slice(offset,offset+limit),next=offset+items.length;
  return {total:rows.length,offset,limit,items,nextOffset:next<rows.length?next:null};
}
export function small(value) {
  need(Buffer.byteLength(JSON.stringify(value))<=2*1024*1024,
    'Choose a smaller page or download the complete original file.','MUNICIPAL_ASSET_VIEW_TOO_LARGE');return value;
}
