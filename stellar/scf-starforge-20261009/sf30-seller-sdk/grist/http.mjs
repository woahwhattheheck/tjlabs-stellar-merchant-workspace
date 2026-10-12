// MIT. Fixed-origin, bounded, read-only Grist REST access.
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { object, identity, digest, fault, stamp } from '../postgres/publisher/files.mjs';
import { binding, documentBinding, restOptions, SCALAR_TYPES, identifier, typeBase, MAX_CAPTURE_BYTES, MAX_PAGE_BYTES, only, HASH } from './declaration.mjs';
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
export function createGristReader(config,{env=process.env,signal,allowUnordered=false,documentOnly=false}={}) {
  const selected=documentOnly?documentBinding(config):binding(config,{allowUnordered}),options=restOptions(config,{allowUnordered,documentOnly});
  const credential=options.allowAnonymous?null:env[options.tokenEnv];
  if(!options.allowAnonymous&&(typeof credential!=='string'||!credential.length||credential.length>32768||/[^\x21-\x7e]/.test(credential)))
    throw fault('GRIST_TOKEN_MISSING','Supply the existing read credential through its declared environment variable.');
  const credentialBinding=createHash('sha256').update('grist-read-authority\0'+(credential===null?'anonymous':'bearer\0'+credential)).digest('hex');
  const timeout=AbortSignal.timeout(options.timeoutMs),abort=signal?AbortSignal.any([signal,timeout]):timeout;
  const allowed=new Set((documentOnly?[documentRequest(selected),tablesRequest(selected)]:
    [documentRequest(selected),stateRequest(selected),metadataRequest(selected),tablesRequest(selected),recordsRequest(selected)]).map(x=>x.url));
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

/** Metadata-only document observation. Does not fabricate a table or read records. */
export const MAX_DOCUMENT_CATALOG_BYTES = Math.ceil(2 * MAX_PAGE_BYTES * 4 / 3) + 2097152;
export function createGristDocumentReader(config,options={}) {
  return createGristReader(config,{...options,documentOnly:true});
}
export function inspectGristTablesBytes(content) {
  const value=json(content);
  if(!object(value)||!Array.isArray(value.tables)||value.tables.length>10000)
    throw fault('GRIST_TABLE_CATALOG_INVALID');
  const ids=new Set(),refs=new Set(),tables=[];
  for(const item of value.tables) {
    if(!object(item)||!object(item.fields)||typeof item.id!=='string')
      throw fault('GRIST_TABLE_CATALOG_INVALID');
    identifier(item.id,'TABLE_ID');
    if(ids.has(item.id)||!Number.isSafeInteger(item.fields.tableRef)||item.fields.tableRef<1||refs.has(item.fields.tableRef))
      throw fault('GRIST_TABLE_CATALOG_IDENTITY_INVALID');
    ids.add(item.id);refs.add(item.fields.tableRef);
    if(!item.id.startsWith('_grist'))tables.push({id:item.id,title:item.id,tableRef:item.fields.tableRef});
  }
  return{tables,nativeTableCount:value.tables.length};
}
export function readGristDocumentCatalog(content,config) {
  if(!Buffer.isBuffer(content)||content.length>MAX_DOCUMENT_CATALOG_BYTES)
    throw fault('GRIST_DOCUMENT_CATALOG_TOO_LARGE');
  const observation=json(content);
  only(observation,['schema','source','authorization','authoritySha256','resources'],'GRIST_DOCUMENT_CATALOG_INVALID');
  if(observation.schema!=='stellar-forge.grist-document-observation.v1'||
      !['anonymous','bearer'].includes(observation.authorization)||!HASH.test(observation.authoritySha256??'')||
      !Array.isArray(observation.resources)||observation.resources.length!==2)
    throw fault('GRIST_DOCUMENT_CATALOG_INVALID');
  const source=documentBinding(observation.source);
  if(identity(source)!==identity(observation.source)||config&&identity(source)!==identity(documentBinding(config)))
    throw fault('GRIST_DOCUMENT_CATALOG_BINDING_CHANGED');
  if(config && (restOptions(config,{documentOnly:true}).allowAnonymous?'anonymous':'bearer')!==observation.authorization)
    throw fault('GRIST_DOCUMENT_AUTHORITY_CHANGED');
  const requests=[documentRequest(source),tablesRequest(source)],roles=['document','tables'],bodies=[];
  let total=0;
  for(const [index,resource]of observation.resources.entries()) {
    only(resource,['role','request','receivedAt','headers','bytes','sha256','bodyBase64'],'GRIST_DOCUMENT_CATALOG_RESOURCE_INVALID');
    if(resource.role!==roles[index]||identity(resource.request)!==identity(requests[index])||
        typeof resource.receivedAt!=='string'||!Number.isFinite(Date.parse(resource.receivedAt))||
        !Number.isSafeInteger(resource.bytes)||resource.bytes<1||resource.bytes>MAX_PAGE_BYTES||
        !HASH.test(resource.sha256??'')||typeof resource.bodyBase64!=='string')
      throw fault('GRIST_DOCUMENT_CATALOG_RESOURCE_INVALID');
    checkedHeaders(resource.headers);
    if(!/^application\/json(?:\s*;|$)/i.test(resource.headers['content-type']??''))
      throw fault('GRIST_DOCUMENT_CATALOG_RESOURCE_INVALID');
    const body=Buffer.from(resource.bodyBase64,'base64');
    total+=body.length;
    if(body.toString('base64')!==resource.bodyBase64||body.length!==resource.bytes||
        digest(body)!==resource.sha256||total>MAX_CAPTURE_BYTES)
      throw fault('GRIST_DOCUMENT_CATALOG_RESOURCE_CHANGED');
    bodies.push(body);
  }
  const document=inspectDocumentBytes(bodies[0],source),native=inspectGristTablesBytes(bodies[1]);
  const sha256=digest(content),catalog={
    schema:'stellar-forge.grist-document-catalog.v1',source,document,authorization:observation.authorization,
    receivedAt:observation.resources[1].receivedAt,startedAt:observation.resources[0].receivedAt,
    documentSha256:digest(bodies[0]),metadataSha256:digest(bodies[1]),catalogSha256:sha256,
    retainedBytes:content.length,sourceBytes:total,nativeTableCount:native.nativeTableCount,
    tableCount:native.tables.length,tables:native.tables,atomicSourceSnapshot:false,
    scope:'Native user table IDs visible through this document metadata response. A listed ID does not establish row access, record completeness or an atomic snapshot. Inspect the selected table and then capture its actual typed records.'
  };
  return{catalog,observation,bytes:content,sha256};
}
export async function discoverGristDocument(config,options={}) {
  const reader=createGristDocumentReader(config,options),resources=[];
  let total=0;
  for(const [index,request]of [documentRequest(reader.selected),tablesRequest(reader.selected)].entries()) {
    const response=await reader.read(request);total+=response.content.length;
    if(total>reader.options.maxCaptureBytes)throw fault('GRIST_DOCUMENT_CATALOG_TOO_LARGE');
    resources.push({role:index===0?'document':'tables',request:response.request,receivedAt:response.receivedAt,
      headers:response.headers,bytes:response.content.length,sha256:digest(response.content),
      bodyBase64:response.content.toString('base64')});
  }
  const content=Buffer.from(JSON.stringify({schema:'stellar-forge.grist-document-observation.v1',
    source:reader.selected,authorization:reader.authorization,authoritySha256:reader.credentialBinding,resources},null,2)+'\n');
  return readGristDocumentCatalog(content,config);
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
