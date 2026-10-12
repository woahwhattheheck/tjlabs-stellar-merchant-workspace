// MIT. Fixed-origin, bounded, read-only Grist REST access.
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { object, identity, fault, stamp } from '../postgres/publisher/files.mjs';
import { binding, restOptions, SCALAR_TYPES, identifier, typeBase } from './declaration.mjs';
export const SAFE_HEADERS=Object.freeze(['content-type','date','etag','last-modified','x-request-id','retry-after','x-ratelimit-limit','x-ratelimit-remaining']);
export const responseKind=()=> 'COMPLETE_TYPED_RECORDS_READ';
export const modeOf=()=> 'records';
const url=(s,tail)=>new URL(s.server+'/api/docs/'+encodeURIComponent(s.docId)+tail);
export const documentRequest=s=>({method:'GET',url:url(s,'').href});
export const stateRequest=s=>({method:'GET',url:url(s,'/states').href});
export const metadataRequest=s=>({method:'GET',url:url(s,'/tables/'+encodeURIComponent(s.tableId)+'/columns').href});
export const tablesRequest=s=>({method:'GET',url:url(s,'/tables').href});
export function recordsRequest(s) {
  const result=url(s,'/tables/'+encodeURIComponent(s.tableId)+'/records');
  result.searchParams.set('cellFormat','typed');
  result.searchParams.set('sort',s.sourceOrder.map(x=>(x.direction==='desc'?'-':'')+x.field).join(','));
  if(s.filter!==null)result.searchParams.set('filter',JSON.stringify(s.filter));
  // No limit, X-Limit, immediate, hidden or arbitrary query parameter is sent.
  return{method:'GET',url:result.href};
}
const json=content=>{
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content));}
  catch{throw fault('GRIST_METADATA_JSON_INVALID');}
};
export function inspectDocumentBytes(content,s) {
  const d=json(content);
  if(!object(d)||typeof d.id!=='string'||!d.id||typeof d.name!=='string'||
      d.urlId!==null&&d.urlId!==undefined&&typeof d.urlId!=='string'||
      s.docId!==d.id&&s.docId!==d.urlId)throw fault('GRIST_DOCUMENT_BINDING_CHANGED','The native document metadata must identify this exact document or its exact URL ID.');
  return{id:d.id,urlId:d.urlId??null,name:d.name,access:typeof d.access==='string'?d.access:null};
}
export function inspectStateBytes(content) {
  const result=json(content);
  if(!object(result)||!Array.isArray(result.states)||!result.states.length)throw fault('GRIST_DOCUMENT_STATE_REQUIRED','A native document history head is required for this capture. Use an account with the original document read authority; state is not guessed from timestamps.');
  const state=result.states[0];
  if(!object(state)||typeof state.h!=='string'||!/^[a-f0-9]{40,64}$/.test(state.h)||
      !Number.isSafeInteger(state.n)||state.n<0)throw fault('GRIST_DOCUMENT_STATE_INVALID');
  return{n:state.n,h:state.h};
}
export function inspectTableBytes(content,s,fields=null) {
  const original=json(content);
  if(!object(original)||!Array.isArray(original.columns)||original.columns.length>10000)throw fault('GRIST_COLUMN_METADATA_INVALID');
  const map=new Map();
  for(const column of original.columns){
    if(!object(column)||!object(column.fields)||typeof column.fields.type!=='string'||typeof column.fields.label!=='string'||
        typeof column.fields.isFormula!=='boolean'||!Number.isSafeInteger(column.fields.colRef)||column.fields.colRef<1)
      throw fault('GRIST_COLUMN_METADATA_INVALID');
    identifier(column.id,'FIELD_ID');
    if(column.id==='id'||column.id==='manualSort'||column.id.startsWith('gristHelper_')||map.has(column.id))
      throw fault('GRIST_COLUMN_IDENTITY_INVALID');
    map.set(column.id,column);
  }
  if(fields!==null){
    for(const field of fields)if(map.get(field.id)?.fields.type!==field.type)throw fault('GRIST_SELECTED_FIELD_CHANGED');
    for(const field of [...s.sourceOrder.map(x=>x.field),...Object.keys(s.filter??{})])
      if(field!=='id'&&!map.has(field))throw fault('GRIST_FILTER_OR_ORDER_FIELD_CHANGED');
  }
  const table={id:s.tableId,title:s.tableId,fields:[...map.values()].map(c=>({
    id:c.id,title:c.fields.label,type:c.fields.type,isFormula:c.fields.isFormula,
    formula:typeof c.fields.formula==='string'?c.fields.formula:null,colRef:c.fields.colRef
  })),views:[]};
  return{table,schema:{docId:s.docId,tableId:s.tableId,columns:original.columns},schemaSha256:identity(original.columns)};
}
export function checkedHeaders(value={}) {
  if(!object(value)||Object.keys(value).some(key=>!SAFE_HEADERS.includes(key)))throw fault('GRIST_CAPTURE_HEADERS_INVALID');
  for(const text of Object.values(value))if(typeof text!=='string'||text.length>1024||/[\r\n\0]/.test(text))throw fault('GRIST_CAPTURE_HEADERS_INVALID');
  return value;
}
export function createGristReader(config,{env=process.env,signal,allowUnordered=false}={}) {
  const selected=binding(config,{allowUnordered}),options=restOptions(config,{allowUnordered});
  const credential=options.allowAnonymous?null:env[options.tokenEnv];
  if(!options.allowAnonymous&&(typeof credential!=='string'||!credential.length||credential.length>32768||/[^\x21-\x7e]/.test(credential)))
    throw fault('GRIST_TOKEN_MISSING','Supply the existing read credential through its declared environment variable.');
  const credentialBinding=createHash('sha256').update('grist-read-authority\0'+(credential===null?'anonymous':'bearer\0'+credential)).digest('hex');
  const timeout=AbortSignal.timeout(options.timeoutMs),abort=signal?AbortSignal.any([signal,timeout]):timeout;
  const allowed=new Set([documentRequest(selected),stateRequest(selected),metadataRequest(selected),tablesRequest(selected),recordsRequest(selected)].map(x=>x.url));
  let lastStarted=0;
  const fail=(code,status=null,headers={})=>{
    const issue=fault(code);
    if(status!==null)issue.providerStatus=status;
    if(headers['retry-after'])issue.retryAfter=headers['retry-after'];
    if(headers['x-request-id'])issue.requestId=headers['x-request-id'];
    return issue;
  };
  return{selected,options,signal:abort,credentialBinding,authorization:credential===null?'anonymous':'bearer',
    async read(spec){
      if(!object(spec)||Object.keys(spec).some(k=>!['method','url'].includes(k))||spec.method!=='GET'||!allowed.has(spec.url))
        throw fault('GRIST_READ_ENDPOINT_REQUIRED');
      const wait=options.requestIntervalMs-(Date.now()-lastStarted);
      try{if(wait>0)await delay(wait,undefined,{signal:abort});}
      catch{throw fail(timeout.aborted?'GRIST_CAPTURE_TIMEOUT':'GRIST_CAPTURE_CANCELLED');}
      lastStarted=Date.now();let response;
      try{response=await fetch(spec.url,{method:'GET',redirect:'error',signal:abort,headers:{
        accept:'application/json',...(credential===null?{}:{authorization:'Bearer '+credential})}});}
      catch{throw fail(signal?.aborted?'GRIST_CAPTURE_CANCELLED':timeout.aborted?'GRIST_CAPTURE_TIMEOUT':'GRIST_PROVIDER_UNREACHABLE');}
      const headers=checkedHeaders(Object.fromEntries(SAFE_HEADERS.filter(k=>response.headers.has(k)).map(k=>[k,response.headers.get(k)])));
      if(response.status!==200){
        await response.body?.cancel();
        const codes={400:'GRIST_REQUEST_INVALID',401:'GRIST_TOKEN_INVALID',402:'GRIST_PROVIDER_PLAN_REQUIRED',403:'GRIST_READ_SCOPE_REQUIRED',404:'GRIST_SOURCE_NOT_FOUND',429:'GRIST_RATE_LIMITED'};
        throw fail(codes[response.status]??'GRIST_PROVIDER_FAILED',response.status,headers);
      }
      if(!/^application\/json(?:\s*;|$)/i.test(headers['content-type']??'')){await response.body?.cancel();throw fail('GRIST_JSON_RESPONSE_REQUIRED');}
      if(Number(response.headers.get('content-length')??0)>options.maxPageBytes){await response.body?.cancel();throw fail('GRIST_RESPONSE_TOO_LARGE');}
      const chunks=[];let size=0;
      try{
        if(!response.body)throw fail('GRIST_RESPONSE_MISSING');
        for await(const chunk of response.body){size+=chunk.byteLength;if(size>options.maxPageBytes)throw fail('GRIST_RESPONSE_TOO_LARGE');chunks.push(chunk);}
      }catch(issue){if(issue.code?.startsWith('GRIST_'))throw issue;throw fail(signal?.aborted?'GRIST_CAPTURE_CANCELLED':timeout.aborted?'GRIST_CAPTURE_TIMEOUT':'GRIST_RESPONSE_INTERRUPTED');}
      return{content:Buffer.concat(chunks),receivedAt:stamp(),request:structuredClone(spec),headers};
    }
  };
}
export async function discoverGristTable(config,options={}) {
  const reader=createGristReader(config,{...options,allowUnordered:true}),s=reader.selected;
  const document=inspectDocumentBytes((await reader.read(documentRequest(s))).content,s);
  const tableList=json((await reader.read(tablesRequest(s))).content);
  if(!object(tableList)||!Array.isArray(tableList.tables)||tableList.tables.some(t=>!object(t)||typeof t.id!=='string')||
      tableList.tables.filter(t=>t.id===s.tableId).length!==1)throw fault('GRIST_TABLE_NOT_FOUND');
  const observed=await reader.read(metadataRequest(s)),native=inspectTableBytes(observed.content,s);
  return{schema:'stellar-forge.grist-discovery.v1',source:s,receivedAt:observed.receivedAt,requestUrl:observed.request.url,
    schemaSha256:native.schemaSha256,title:document.name+' / '+s.tableId,document,
    fields:[{id:'id',title:'Native row identity',type:'identity',scalarProjectionSupported:true,generatedRecordIdentity:true},
      ...native.table.fields.map(f=>({...f,scalarProjectionSupported:SCALAR_TYPES.has(f.type),generatedRecordIdentity:false,
        suggestedEncoding:['Date','DateTime'].includes(typeBase(f.type))?'epoch-seconds-text':typeBase(f.type)==='Ref'?'reference-id-text':
          ['Any','ChoiceList','RefList','Attachments'].includes(typeBase(f.type))?'typed-json':['Int','Numeric'].includes(typeBase(f.type))?'number-text':'native'}))],
    tables:tableList.tables.filter(t=>!t.id.startsWith('_grist')).map(t=>({id:t.id,title:t.id})),views:[],
    scope:'The selected account’s native document/table metadata. Capture reads the complete typed table result twice and compares document history and schema before/after; saved UI views and linked display values are not reconstructed.'};
}
