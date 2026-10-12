// MIT. One retained native read per attempt; exact response bytes survive replay.
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { validateConnection, credentialHeaders, databaseURL } from './declaration.mjs';
import { object, only, need, text, integer, bytes, digest, identity, privateDirectory, readPrivate, readJson, retain, retainJSON, exists, stamp, ensureActive, safeIssue, MAX_BODY } from './common.mjs';

const MAGIC=Buffer.from('COUCHDB_NATIVE_RESPONSE_1\n');
const RETAINED_HEADERS=['content-type','content-encoding','content-length','etag','last-modified','date','server','retry-after','x-couch-request-id'];
export const MAX_EXCHANGE=MAX_BODY+131072;
export function encodeResponse(meta, body) {
  const head=bytes({...meta,body:{bytes:body.length,sha256:digest(body)}}),size=Buffer.from(String(head.length)+'\n');
  need(head.length<=65536,'COUCHDB_RESPONSE_HEADERS_TOO_LARGE');
  return Buffer.concat([MAGIC,size,head,body]);
}
export function decodeResponse(raw) {
  need(Buffer.isBuffer(raw)&&raw.subarray(0,MAGIC.length).equals(MAGIC),'COUCHDB_RETAINED_RESPONSE_INVALID');
  const delimiter=raw.indexOf(10,MAGIC.length);
  need(delimiter>MAGIC.length&&delimiter-MAGIC.length<=8,'COUCHDB_RETAINED_RESPONSE_INVALID');
  const sizeText=raw.toString('ascii',MAGIC.length,delimiter);
  need(/^[1-9][0-9]*$/.test(sizeText),'COUCHDB_RETAINED_RESPONSE_INVALID');
  const size=integer(Number(sizeText),1,65536),offset=delimiter+1+size;
  need(offset<=raw.length,'COUCHDB_RETAINED_RESPONSE_INVALID');
  let meta;try{meta=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw.subarray(delimiter+1,offset)));}catch{need(false,'COUCHDB_RETAINED_RESPONSE_INVALID');}
  need(object(meta)&&meta.schema==='stellar-forge.couchdb-native-response.v1'&&Number.isInteger(meta.status)&&meta.status>=100&&meta.status<600&&typeof meta.startedAt==='string'&&Number.isFinite(Date.parse(meta.startedAt))&&typeof meta.receivedAt==='string'&&Number.isFinite(Date.parse(meta.receivedAt)),'COUCHDB_RETAINED_RESPONSE_INVALID');
  const body=raw.subarray(offset);
  need(meta.body?.bytes===body.length&&meta.body?.sha256===digest(body),'COUCHDB_RETAINED_BODY_CHANGED');
  return {meta,body,offset};
}
export function nativeRequest(connection, supplied) {
  only(supplied,['method','url','body','maximum'],'COUCHDB_NATIVE_REQUEST_INVALID');
  need(['GET','POST'].includes(supplied.method),'COUCHDB_NATIVE_READ_REQUIRED');
  const url=new URL(supplied.url),base=new URL(connection.baseUrl);
  need(url.origin===base.origin&&!url.username&&!url.password&&!url.hash,'COUCHDB_NATIVE_ORIGIN_CHANGED');
  const root=base.pathname.replace(/\/+$/,'');
  need(url.pathname===root||url.pathname===root+'/'||url.pathname.startsWith(root+'/'),'COUCHDB_NATIVE_PATH_CHANGED');
  need(supplied.body===undefined||typeof supplied.body==='string','COUCHDB_NATIVE_BODY_INVALID');
  if(supplied.method==='POST')need(['_all_docs','_changes'].some(tail=>url.pathname===new URL(databaseURL(connection,tail)).pathname),'COUCHDB_NATIVE_READ_REQUIRED');
  const maximum=integer(supplied.maximum??connection.limits.maxResponseBytes,1,MAX_BODY);
  const body=supplied.body??null;
  need(body===null||Buffer.byteLength(body)<=MAX_BODY,'COUCHDB_NATIVE_BODY_TOO_LARGE');
  return {schema:'stellar-forge.couchdb-native-request.v1',method:supplied.method,url:url.href,body,maximum};
}
async function nativeRead(connection, request, environment, signal, session) {
  ensureActive(signal);
  const headers=credentialHeaders(connection,environment);
  headers['Accept-Encoding']='identity';
  if(connection.auth.kind==='basic'&&session?.cookie){delete headers.Authorization;headers.Cookie='AuthSession='+session.cookie;}
  if(request.body!==null)headers['Content-Type']='application/json';
  const startedAt=stamp(),deadline=AbortSignal.timeout(connection.limits.timeoutMs),selected=signal?AbortSignal.any([signal,deadline]):deadline;
  let response;
  try { response=await fetch(request.url,{method:request.method,headers,body:request.body??undefined,redirect:'manual',signal:selected}); }
  catch(error) { ensureActive(signal);need(false,deadline.aborted?'COUCHDB_READ_TIMEOUT':'COUCHDB_READ_TRANSPORT','The original read did not return a complete response. Resume the saved capture.',503); }
  need(response.status<300||response.status>=400,'COUCHDB_REDIRECT_REFUSED','The server returned a redirect; select its original fixed endpoint before capturing.');
  const parts=[];let size=0;
  try{
    if(response.body)for await(const part of response.body){ensureActive(selected);size+=part.length;need(size<=request.maximum,'COUCHDB_RESPONSE_TOO_LARGE','This original native response exceeds the selected body limit.',413);parts.push(Buffer.from(part));}
  }catch(error){if(error.code)throw error;ensureActive(signal);need(false,deadline.aborted?'COUCHDB_READ_TIMEOUT':'COUCHDB_READ_TRANSPORT','The original response body was interrupted. Resume the saved capture.',503);}
  if(connection.auth.kind==='basic'&&session){
    const cookies=response.headers.getSetCookie?.()??[response.headers.get('set-cookie')??''];
    for(const cookie of cookies){const match=/^AuthSession=([^;\s]*)/i.exec(cookie);if(match)session.cookie=match[1]||null;}
    if(response.status===401)session.cookie=null;
  }
  const retained=Object.fromEntries(RETAINED_HEADERS.flatMap(name=>{const value=response.headers.get(name);return value===null?[]:[[name,value.slice(0,8192)]];}));
  return {meta:{schema:'stellar-forge.couchdb-native-response.v1',requestSha256:identity(request),status:response.status,headers:retained,startedAt,receivedAt:stamp()},body:Buffer.concat(parts,size)};
}
/** Caller holds its capture lease. Headers and the complete body publish in
 * one framed file, so a reply lost after publication never causes a refetch. */
export async function readCouchdbStep(root, connectionInput, label, supplied, validate, {environment=process.env,signal,session,allowedStatuses=[200]}={}) {
  need(/^[a-z][a-z0-9-]{0,127}$/.test(label),'COUCHDB_READ_LABEL_INVALID');
  const connection=validateConnection(connectionInput),request=nativeRequest(connection,supplied);
  const directory=join(root,'requests',label);
  await privateDirectory(directory,true);
  const requestBytes=bytes(request);need(requestBytes.length<=MAX_BODY,'COUCHDB_NATIVE_REQUEST_TOO_LARGE');
  await retain(join(directory,'request.json'),requestBytes);
  const acceptedPath=join(directory,'accepted.json');
  const accepted=await exists(acceptedPath)?await readJson(acceptedPath):null;
  const names=(await readdir(directory)).filter(name=>/^attempt-[0-9]{8}\.http$/.test(name)).sort();
  let lastIssue=null;
  async function openAttempt(name){
    const path=join(directory,name),raw=await readPrivate(path,MAX_EXCHANGE),response=decodeResponse(raw);
    need(response.meta.requestSha256===identity(request),'COUCHDB_RETAINED_REQUEST_CHANGED');
    const file={path:'requests/'+label+'/'+name,bytes:raw.length,sha256:digest(raw)};
    const record={schema:'stellar-forge.couchdb-accepted-read.v1',requestSha256:identity(request),file,body:{offset:response.offset,bytes:response.body.length,sha256:digest(response.body)},status:response.meta.status,receivedAt:response.meta.receivedAt};
    if(accepted)need(identity(accepted)===identity(record),'COUCHDB_ACCEPTED_RESPONSE_CHANGED');
    if(!allowedStatuses.includes(response.meta.status)){
      const status=response.meta.status;
      need(false,'COUCHDB_HTTP_'+status,'The original server returned HTTP '+status+'. Its complete response is retained.',[401,403,404,429,503].includes(status)?status:502);
    }
    const value=await validate(response.body,response.meta);
    return {value,record,meta:response.meta,body:response.body};
  }
  if(accepted){
    need(names.includes(accepted.file?.path?.split('/').at(-1)),'COUCHDB_ACCEPTED_RESPONSE_MISSING');
    return openAttempt(accepted.file.path.split('/').at(-1));
  }
  for(const name of names){
    try{const result=await openAttempt(name);await retainJSON(acceptedPath,result.record);return result;}
    catch(error){lastIssue=error;}
  }
  ensureActive(signal);
  let attempt=1;
  const all=new Set(await readdir(directory));
  while(all.has('attempt-'+String(attempt).padStart(8,'0')+'.http')||all.has('attempt-'+String(attempt).padStart(8,'0')+'.json')||all.has('.attempt-'+String(attempt).padStart(8,'0')+'.http.couchdb-pending')||all.has('.attempt-'+String(attempt).padStart(8,'0')+'.json.couchdb-pending'))attempt++;
  integer(attempt,1,99999999,'COUCHDB_ATTEMPT_LIMIT');
  const name='attempt-'+String(attempt).padStart(8,'0'),attemptPath=join(directory,name+'.json');
  await retainJSON(attemptPath,{schema:'stellar-forge.couchdb-read-attempt.v1',requestSha256:identity(request),startedAt:stamp(),...(lastIssue?{previousIssue:safeIssue(lastIssue)}:{})});
  let result;
  try{
    const response=await nativeRead(connection,request,environment,signal,session);
    await retain(join(directory,name+'.http'),encodeResponse(response.meta,response.body));
    result=await openAttempt(name+'.http');
    await retainJSON(acceptedPath,result.record);
  }catch(error){
    await retainJSON(join(directory,name+'.issue.json'),{schema:'stellar-forge.couchdb-read-issue.v1',requestSha256:identity(request),issue:safeIssue(error),at:stamp()});
    throw error;
  }
  return result;
}
