// MIT. Explicit native database selection, credential references and public fields.
import { dirname, resolve } from 'node:path';
import { only, need, text, integer, safeName, object, identity, readPrivate, digest, HASH, checkSequence, parseOriginal, sourceValue, sourcePath } from './common.mjs';
const ENV = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
export function validateConnection(input) {
  only(input,['schema','baseUrl','database','auth','selection','attachments','limits'],'COUCHDB_CONNECTION_INVALID');
  need(input.schema === 'stellar-forge.couchdb-connection.v1','COUCHDB_CONNECTION_INVALID');
  let url; try { url = new URL(input.baseUrl); } catch { need(false,'COUCHDB_BASE_URL_INVALID'); }
  need(['https:','http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,'COUCHDB_BASE_URL_INVALID','Use the existing server URL with credential environment references.');
  const database = text(input.database,238,'COUCHDB_DATABASE_REQUIRED');
  need(!database.includes('/') && !database.includes('\\') && !/[\u0000-\u001f\u007f]/.test(database),'COUCHDB_DATABASE_INVALID');
  const auth = input.auth ?? { kind:'none' };
  const authKeys = { none:['kind'], basic:['kind','usernameEnv','passwordEnv'], bearer:['kind','tokenEnv'], cookie:['kind','tokenEnv'] }[auth.kind];
  need(authKeys,'COUCHDB_AUTH_INVALID'); only(auth,authKeys,'COUCHDB_AUTH_INVALID');
  for (const key of authKeys.filter(x=>x!=='kind')) need(ENV.test(auth[key] ?? ''),'COUCHDB_CREDENTIAL_REFERENCE_INVALID');
  const selected = input.selection ?? { kind:'range' }; need(object(selected),'COUCHDB_SELECTION_INVALID');
  let selection;
  if (selected.kind === 'ids') {
    only(selected,['kind','ids'],'COUCHDB_SELECTION_INVALID');
    need(Array.isArray(selected.ids) && selected.ids.length && selected.ids.length <= 1000000,'COUCHDB_DOCUMENT_IDS_REQUIRED');
    const ids=selected.ids.map(v=>text(v,4096,'COUCHDB_DOCUMENT_ID_INVALID'));
    need(new Set(ids).size===ids.length,'COUCHDB_DOCUMENT_IDS_DUPLICATED'); selection={kind:'ids',ids};
  } else if (selected.kind === 'range') {
    only(selected,['kind','startKey','endKey','inclusiveEnd'],'COUCHDB_SELECTION_INVALID');
    for(const key of ['startKey','endKey']) if(selected[key]!==undefined) need(typeof selected[key]==='string' && selected[key].length<=4096 && !selected[key].includes('\0'),'COUCHDB_RANGE_KEY_INVALID');
    need(selected.inclusiveEnd===undefined || typeof selected.inclusiveEnd==='boolean','COUCHDB_RANGE_INVALID');
    if(selected.startKey!==undefined && selected.endKey!==undefined) need(Buffer.compare(Buffer.from(selected.startKey),Buffer.from(selected.endKey))<=0,'COUCHDB_RANGE_INVALID');
    selection={kind:'range',...(selected.startKey!==undefined?{startKey:selected.startKey}:{}),...(selected.endKey!==undefined?{endKey:selected.endKey}:{}),inclusiveEnd:selected.inclusiveEnd??true};
  } else if (selected.kind === 'changes') {
    only(selected,['kind','ids','since'],'COUCHDB_SELECTION_INVALID');
    let ids=null;
    if(selected.ids!==undefined){need(Array.isArray(selected.ids)&&selected.ids.length&&selected.ids.length<=1000000,'COUCHDB_DOCUMENT_IDS_REQUIRED');ids=selected.ids.map(v=>text(v,4096,'COUCHDB_DOCUMENT_ID_INVALID'));need(new Set(ids).size===ids.length,'COUCHDB_DOCUMENT_IDS_DUPLICATED');}
    const since=selected.since===undefined?{kind:'number',json:'0',query:'0'}:checkSequence(selected.since);
    selection={kind:'changes',...(ids?{ids}:{}),since};
  } else need(false,'COUCHDB_SELECTION_INVALID');
  const attachments=input.attachments??{mode:'none'};
  only(attachments,['mode','names'],'COUCHDB_ATTACHMENTS_INVALID');
  need(['none','all','names'].includes(attachments.mode),'COUCHDB_ATTACHMENTS_INVALID');
  let names=[];
  if(attachments.mode==='names'){
    need(Array.isArray(attachments.names)&&attachments.names.length<=100000,'COUCHDB_ATTACHMENTS_INVALID');
    names=attachments.names.map(v=>{only(v,['documentId','name'],'COUCHDB_ATTACHMENT_SELECTION_INVALID');return {documentId:text(v.documentId,4096),name:text(v.name,8192)};});
    need(new Set(names.map(identity)).size===names.length,'COUCHDB_ATTACHMENT_SELECTION_DUPLICATED');
  } else need(attachments.names===undefined,'COUCHDB_ATTACHMENTS_INVALID');
  const limits=input.limits??{};only(limits,['pageSize','maxPages','maxDocuments','maxTotalBytes','maxResponseBytes','maxAttachmentBytes','timeoutMs'],'COUCHDB_LIMITS_INVALID');
  const defaults={pageSize:100,maxPages:100000,maxDocuments:250000,maxTotalBytes:1073741824,maxResponseBytes:67108864,maxAttachmentBytes:134217728,timeoutMs:30000};
  const ranges={pageSize:[1,10000],maxPages:[1,1000000],maxDocuments:[1,1000000],maxTotalBytes:[1024,17179869184],maxResponseBytes:[1024,268435456],maxAttachmentBytes:[1,268435456],timeoutMs:[100,300000]};
  const normalized=Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,integer(limits[k]??v,...ranges[k])]));
  return {schema:input.schema,baseUrl:url.href.replace(/\/+$/,''),database,auth:{...auth},selection,attachments:{mode:attachments.mode,...(attachments.mode==='names'?{names}:{})},limits:normalized};
}
export function sourceIdentity(connection) {
  const c=validateConnection(connection),selection={...c.selection};delete selection.since;
  return identity({baseUrl:c.baseUrl,database:c.database,selection,attachments:c.attachments});
}
export function databaseURL(connection, tail='') {
  return connection.baseUrl + '/' + encodeURIComponent(connection.database) + (tail?'/'+tail:'');
}
export function documentRoute(id) {
  return id.startsWith('_design/') ? '_design/' + encodeURIComponent(id.slice(8)) : id.startsWith('_local/') ? '_local/' + encodeURIComponent(id.slice(7)) : encodeURIComponent(id);
}
export function credentialHeaders(connection, env=process.env) {
  const auth=connection.auth,headers={Accept:'application/json'};
  function secret(name){const value=env[name];need(typeof value==='string'&&value.length&&value.length<=65536&&!/[\r\n\0]/.test(value),'COUCHDB_CREDENTIAL_UNAVAILABLE','The selected credential environment reference is unavailable.');return value;}
  if(auth.kind==='basic'){const user=secret(auth.usernameEnv);need(!user.includes(':'),'COUCHDB_USERNAME_INVALID');headers.Authorization='Basic '+Buffer.from(user+':'+secret(auth.passwordEnv),'utf8').toString('base64');}
  if(auth.kind==='bearer')headers.Authorization='Bearer '+secret(auth.tokenEnv);
  if(auth.kind==='cookie'){const token=secret(auth.tokenEnv);need(!/[;\s]/.test(token),'COUCHDB_SESSION_TOKEN_INVALID');headers.Cookie='AuthSession='+token;}
  return headers;
}
export function compileQueries(input) {
  need(object(input)&&Object.keys(input).length&&Object.keys(input).length<=32,'COUCHDB_QUERIES_REQUIRED');
  return Object.fromEntries(Object.entries(input).map(([name,query])=>{
    safeName(name);only(query,['columns','documentIds','review'],'COUCHDB_QUERY_INVALID');
    need(object(query.columns)&&Object.keys(query.columns).length&&Object.keys(query.columns).length<=128,'COUCHDB_PUBLIC_FIELDS_REQUIRED');
    const projection=Object.fromEntries(Object.entries(query.columns).map(([alias,spec])=>{
      safeName(alias);only(spec,['pointer','type','encoding','nullable','missing','empty'],'COUCHDB_PUBLIC_FIELD_INVALID');
      need(typeof spec.pointer==='string'&&spec.pointer.length<=4096&&(spec.pointer===''||spec.pointer.startsWith('/'))&&!/~(?:[^01]|$)/.test(spec.pointer),'COUCHDB_FIELD_POINTER_INVALID');
      need(['string','integer','number','boolean'].includes(spec.type),'COUCHDB_PUBLIC_TYPE_INVALID');
      const encoding=spec.encoding??'value',nullable=spec.nullable??false,missing=spec.missing??'error',empty=spec.empty??'preserve';
      need(['value','json','decimal'].includes(encoding)&&typeof nullable==='boolean'&&['error','null'].includes(missing)&&['preserve','null'].includes(empty),'COUCHDB_PUBLIC_FIELD_INVALID');
      need(encoding==='value'||spec.type==='string','COUCHDB_EXACT_ENCODING_REQUIRES_TEXT');
      need((missing!=='null'&&empty!=='null')||nullable,'COUCHDB_NULL_MAPPING_REQUIRES_NULLABLE');
      return [alias,{pointer:spec.pointer,type:spec.type,encoding,nullable,missing,empty}];
    }));
    let documentIds=null;
    if(query.documentIds!==undefined){need(Array.isArray(query.documentIds)&&query.documentIds.length&&new Set(query.documentIds).size===query.documentIds.length,'COUCHDB_QUERY_DOCUMENT_IDS_INVALID');documentIds=query.documentIds.map(v=>text(v,4096));}
    const review=query.review??{};
    only(review,['reviewer','note','allowConflicts','allowMissing','allowDeletions','allowConcurrentChanges'],'COUCHDB_SOURCE_REVIEW_INVALID');
    text(review.reviewer,128,'COUCHDB_REVIEWER_REQUIRED');text(review.note,4000,'COUCHDB_REVIEW_NOTE_REQUIRED');
    for(const key of ['allowConflicts','allowMissing','allowDeletions','allowConcurrentChanges'])need(review[key]===undefined||typeof review[key]==='boolean','COUCHDB_SOURCE_REVIEW_INVALID');
    return [name,{columns:Object.keys(projection),projection,documentIds,review:{...review},parameters:{},parameterOrder:[],sql:'CouchDB: reviewed retained winning revisions; explicit original JSON pointers and public column encodings.'}];
  }));
}
export async function readCouchdbSourceFile(filename) {
  const raw=await readPrivate(filename,262144);
  let config;try{config=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{need(false,'COUCHDB_SOURCE_JSON_INVALID');}
  only(config,['schema','capture','queries'],'COUCHDB_SOURCE_CONFIG_INVALID');
  need(config.schema==='stellar-forge.couchdb-source.v1','COUCHDB_SOURCE_CONFIG_INVALID');
  only(config.capture,['file','sha256'],'COUCHDB_CAPTURE_BINDING_INVALID');
  need(typeof config.capture.file==='string'&&config.capture.file.length&&!config.capture.file.includes('\0')&&HASH.test(config.capture.sha256??''),'COUCHDB_CAPTURE_BINDING_INVALID');
  return {config,original:raw,hash:digest(raw),captureFile:resolve(dirname(filename),config.capture.file),queries:compileQueries(config.queries)};
}
