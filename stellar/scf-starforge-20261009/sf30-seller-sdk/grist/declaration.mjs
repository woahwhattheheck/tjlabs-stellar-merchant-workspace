// MIT. Explicit Grist document/table selection and typed public projections.
import { dirname, resolve } from 'node:path';
import { object, readPrivate, digest, identity, fault } from '../postgres/publisher/files.mjs';
export const HASH = /^[a-f0-9]{64}$/;
export const MAX_CAPTURE_BYTES = 268435456;
export const MAX_PAGE_BYTES = 67108864;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const ID = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const RESERVED = new Set(['constructor','prototype','__proto__']);
const TYPES = new Set(['Any','Text','Bool','Int','Numeric','Date','DateTime','Ref','RefList','Choice','ChoiceList','Attachments']);
export const typeBase = value => typeof value === 'string' ? value.split(':')[0] : '';
export const SCALAR_TYPES = Object.freeze({has: value => typeof value === 'string' && value.length <= 256 && TYPES.has(typeBase(value))});
export function only(value, keys, code) {
  if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw fault(code);
}
export function integer(value, low, high, code) {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw fault(code);
  return value;
}
export function identifier(value, label='ID') {
  if (typeof value !== 'string' || !ID.test(value) || RESERVED.has(value)) throw fault('GRIST_'+label+'_INVALID');
  return value;
}
export function documentId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{5,159}$/.test(value) || RESERVED.has(value))
    throw fault('GRIST_DOCUMENT_ID_INVALID','Use the original document ID or URL ID. Fork/share/snapshot expressions are separate identities and are not inferred from a URL.');
  return value;
}
export function normalizeFilter(value) {
  if (value===null || value===undefined) return null;
  if (!object(value) || Object.keys(value).length>32) throw fault('GRIST_FILTER_INVALID');
  const result=Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,values])=>{
    identifier(key,'FILTER_FIELD');
    if (!Array.isArray(values)||!values.length||values.length>100) throw fault('GRIST_FILTER_INVALID');
    return [key,values.map(item=>{
      if (item===null||typeof item==='boolean'||Number.isSafeInteger(item)||
          typeof item==='string'&&item.length<=2048&&!/[\u0000-\u0008]/.test(item)) return item;
      throw fault('GRIST_FILTER_VALUE_INVALID','Use the native membership filter with strings, booleans, nulls or exact safe integers.');
    })];
  }));
  if (Buffer.byteLength(JSON.stringify(result))>8192) throw fault('GRIST_FILTER_TOO_LARGE');
  return Object.keys(result).length ? result : null;
}
export function normalizeGristServer(value) {
  let url;try{url=new URL(value);}catch{throw fault('GRIST_SERVER_INVALID');}
  if (!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||
      /%2f|%5c|%2e/i.test(url.pathname)||url.pathname.includes('//'))
    throw fault('GRIST_SERVER_INVALID','Use the exact existing Grist site origin and any fixed proxy prefix, without credentials, query or fragment.');
  return url.origin+url.pathname.replace(/\/$/,'');
}
export function documentBinding(value) {
  if (!object(value)||value.apiVersion!=='unversioned') throw fault('GRIST_REST_API_REQUIRED');
  return {server:normalizeGristServer(value.server),apiVersion:'unversioned',docId:documentId(value.docId)};
}
export function binding(value,{allowUnordered=false}={}) {
  const {server,docId}=documentBinding(value);
  const orders=value.sourceOrder??[];
  if (!Array.isArray(orders)||orders.length>8) throw fault('GRIST_SOURCE_ORDER_INVALID');
  const seen=new Set(),sourceOrder=orders.map(item=>{
    only(item,['field','direction'],'GRIST_SOURCE_ORDER_INVALID');
    const field=identifier(item.field,'SORT_FIELD');
    if(seen.has(field)||!['asc','desc'].includes(item.direction)||field==='manualSort'||field.startsWith('gristHelper_'))
      throw fault('GRIST_SOURCE_ORDER_INVALID');
    seen.add(field);return{field,direction:item.direction};
  });
  if(!allowUnordered&&sourceOrder.at(-1)?.field!=='id')
    throw fault('GRIST_IDENTITY_ORDER_REQUIRED','End the exact native record order with id so every tie is resolved by native identity.');
  const tableId=identifier(value.tableId,'TABLE_ID');
  if(tableId.startsWith('_grist')) throw fault('GRIST_USER_TABLE_REQUIRED','Choose a user data table. Private Grist metadata is retained only by the native metadata endpoints.');
  return{server,apiVersion:'unversioned',docId,tableId,filter:normalizeFilter(value.filter),sourceOrder};
}
export function compileQueries(value,allowEmpty=false) {
  if(!object(value)||!allowEmpty&&!Object.keys(value).length||Object.keys(value).length>32)throw fault('GRIST_QUERIES_REQUIRED');
  return Object.fromEntries(Object.entries(value).map(([name,query])=>{
    if(!NAME.test(name)||RESERVED.has(name))throw fault('GRIST_QUERY_NAME_INVALID');
    only(query,['columns'],'GRIST_QUERY_INVALID');
    if(!object(query.columns)||!Object.keys(query.columns).length||Object.keys(query.columns).length>64)throw fault('GRIST_PUBLIC_COLUMNS_REQUIRED');
    const selected=new Set();
    const projection=Object.fromEntries(Object.entries(query.columns).map(([alias,spec])=>{
      if(!NAME.test(alias)||RESERVED.has(alias))throw fault('GRIST_COLUMN_NAME_INVALID');
      only(spec,['source','providerType','type','encoding','nullable','empty'],'GRIST_COLUMN_INVALID');
      const recordId=spec.source==='$recordId';
      if(!recordId){identifier(spec.source,'FIELD_ID');if(spec.source==='id'||spec.source==='manualSort'||spec.source.startsWith('gristHelper_'))throw fault('GRIST_PUBLIC_FIELD_REQUIRED');}
      if(selected.has(spec.source)||!['string','integer','number','boolean'].includes(spec.type)||
          spec.nullable!==undefined&&typeof spec.nullable!=='boolean'||spec.empty!==undefined&&!['preserve','null'].includes(spec.empty))
        throw fault('GRIST_COLUMN_INVALID');
      selected.add(spec.source);
      if(recordId?spec.providerType!==undefined:!SCALAR_TYPES.has(spec.providerType))throw fault('GRIST_FIELD_TYPE_REQUIRED');
      const encoding=spec.encoding??(recordId&&spec.type==='string'?'identity-text':'native');
      const base=typeBase(spec.providerType);
      if(!['native','number-text','identity-text','epoch-seconds-text','reference-id-text','typed-json'].includes(encoding)||
          encoding!=='native'&&spec.type!=='string'||
          encoding==='identity-text'&&!recordId||
          encoding==='epoch-seconds-text'&&!['Date','DateTime'].includes(base)||
          encoding==='reference-id-text'&&base!=='Ref'||
          recordId&&!['identity-text','native','number-text'].includes(encoding))
        throw fault('GRIST_VALUE_ENCODING_INVALID');
      if(['RefList','ChoiceList','Attachments'].includes(base)&&encoding!=='typed-json')throw fault('GRIST_STRUCTURED_ENCODING_REQUIRED','Use explicit typed-json for encoded lists or attachment/reference IDs; they are not expanded records or file bytes.');
      const nullable=spec.nullable??false,empty=spec.empty??'preserve';
      if(recordId&&nullable||empty==='null'&&!nullable)throw fault('GRIST_NULL_POLICY_INVALID');
      return[alias,{source:spec.source,...(recordId?{}:{providerType:spec.providerType}),type:spec.type,encoding,nullable,empty}];
    }));
    return[name,{columns:Object.keys(projection),projection,parameters:{},parameterOrder:[],
      sql:'Grist REST: complete API-visible typed records with native membership filter and explicit identity order; no SQL or saved-view reconstruction.'}];
  }));
}
export function selectedFields(queries) {
  const result=new Map();
  for(const query of Object.values(queries))for(const spec of Object.values(query.projection)){
    if(spec.source==='$recordId')continue;
    if(result.has(spec.source)&&result.get(spec.source)!==spec.providerType)throw fault('GRIST_FIELD_TYPE_DECLARATION_CONFLICT');
    result.set(spec.source,spec.providerType);
  }
  if(!result.size)throw fault('GRIST_PUBLIC_SOURCE_FIELD_REQUIRED');
  return[...result].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([id,type])=>({id,type}));
}
export function connectionOptions(server,c) {
  only(c,['kind','tokenEnv','allowAnonymous','allowHttp','maxPageBytes','maxCaptureBytes','maxRows','timeoutMs','requestIntervalMs'],'GRIST_REST_CONNECTION_INVALID');
  if(c.kind!=='rest'||c.allowAnonymous!==undefined&&typeof c.allowAnonymous!=='boolean'||
      c.allowHttp!==undefined&&typeof c.allowHttp!=='boolean')throw fault('GRIST_REST_CONNECTION_INVALID');
  if(c.allowAnonymous===true?c.tokenEnv!==undefined:typeof c.tokenEnv!=='string'||!/^[A-Z][A-Z0-9_]{0,127}$/.test(c.tokenEnv))
    throw fault('GRIST_TOKEN_REFERENCE_REQUIRED','Declare an existing read credential by environment reference, or explicitly select anonymous access to a public document.');
  const url=new URL(normalizeGristServer(server));
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&c.allowHttp!==true)throw fault('GRIST_HTTPS_REQUIRED');
  return{...(c.tokenEnv?{tokenEnv:c.tokenEnv}:{}),allowAnonymous:c.allowAnonymous===true,
    maxPageBytes:integer(c.maxPageBytes??16777216,1024,MAX_PAGE_BYTES,'GRIST_RESPONSE_BYTES_INVALID'),
    maxCaptureBytes:integer(c.maxCaptureBytes??67108864,1024,MAX_CAPTURE_BYTES,'GRIST_CAPTURE_BYTES_INVALID'),
    maxRows:integer(c.maxRows??1000000,1,1000000,'GRIST_ROW_LIMIT_INVALID'),
    timeoutMs:integer(c.timeoutMs??300000,100,3600000,'GRIST_TIMEOUT_INVALID'),
    requestIntervalMs:integer(c.requestIntervalMs??250,200,30000,'GRIST_REQUEST_INTERVAL_INVALID')};
}
export function restOptions(config,{allowUnordered=false,documentOnly=false}={}) {
  const selected=documentOnly?documentBinding(config):binding(config,{allowUnordered});
  return connectionOptions(selected.server,config.connection);
}
export async function readGristDocumentFile(filename) {
  const original=await readPrivate(filename,1048576);let config;
  try{config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original));}catch{throw fault('GRIST_DOCUMENT_JSON_INVALID');}
  only(config,['schema','server','apiVersion','docId','connection'],'GRIST_DOCUMENT_CONFIG_INVALID');
  if(config.schema!=='stellar-forge.grist-document.v1')throw fault('GRIST_DOCUMENT_CONFIG_INVALID');
  const selected=documentBinding(config);restOptions(config,{documentOnly:true});
  return{config,binding:selected,original,hash:digest(original)};
}
export function sourceSelection(config,queries=compileQueries(config.queries)){
  return{...binding(config),fields:selectedFields(queries)};
}
export async function readGristSourceFile(filename,{allowUnprojected=false}={}) {
  const original=await readPrivate(filename);let config;
  try{config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(original));}catch{throw fault('GRIST_SOURCE_JSON_INVALID');}
  only(config,['schema','server','apiVersion','docId','tableId','filter','sourceOrder','connection','queries'],'GRIST_SOURCE_CONFIG_INVALID');
  if(config.schema!=='stellar-forge.grist-source.v1')throw fault('GRIST_SOURCE_CONFIG_INVALID');
  const selected=binding(config,{allowUnordered:allowUnprojected}),queries=compileQueries(config.queries,allowUnprojected);
  if(config.connection?.kind==='capture'){
    only(config.connection,['kind','file','sha256'],'GRIST_CAPTURE_CONNECTION_INVALID');
    if(typeof config.connection.file!=='string'||!config.connection.file||config.connection.file.includes('\0')||!HASH.test(config.connection.sha256??''))throw fault('GRIST_CAPTURE_CONNECTION_INVALID');
  }else restOptions(config,{allowUnordered:allowUnprojected});
  return{config,binding:selected,queries,original,hash:digest(original),
    selectionHash:Object.keys(queries).length?identity(sourceSelection(config,queries)):null,
    captureFile:config.connection.kind==='capture'?resolve(dirname(filename),config.connection.file):null};
}
