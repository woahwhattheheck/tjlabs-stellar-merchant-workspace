// MIT. Complete public GTFS HTTPS acquisitions in the original workspace journal.
import { request as httpsRequest, Agent } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { constants } from 'node:fs';
import { open, lstat, readdir, rename } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { object, bytes, identity, digest, fault, stamp, privateDirectory, readJson,
  readPrivate, hashPrivate, createFile, atomicJson, syncDirectory } from '../postgres/publisher/files.mjs';
import { GTFS_ZIP_MAX_BYTES } from './source.mjs';

export const GTFS_FEED_SOURCE_SCHEMA = 'stellar-forge.gtfs-feed-source.v1';
export const GTFS_HTTP_ACQUISITION_SCHEMA = 'stellar-forge.gtfs-http-acquisition.v1';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const JSON_MAX = 1024 * 1024;
const ATTEMPT_MAX = 64;
const REDIRECT_MAX = 5;
const HEADER_MAX = 32 * 1024;
const ERROR_BODY_MAX = 64 * 1024;
const RESPONSE_HEADERS = ['date','etag','last-modified','content-type','content-length',
  'content-encoding','content-location','cache-control','expires','vary','retry-after','location'];
const own = (value, key) => Object.hasOwn(value, key);
const integer = (value,min,max) => Number.isSafeInteger(value)&&value>=min&&value<=max;
function only(value,fields,required=[]) {
  if(!object(value)||Object.keys(value).some(key=>!fields.includes(key))||required.some(key=>!own(value,key)))
    throw fault('GTFS_FEED_SOURCE_INVALID','Use the declared feed-source fields.');
}
function text(value,label,maximum,empty=false) {
  if(typeof value!=='string'||value.length>maximum||/[\u0000-\u001f\u007f]/.test(value)||!empty&&!value.trim())
    throw fault('GTFS_FEED_SOURCE_INVALID','Enter '+label+'.');
  return value.trim();
}
export function gtfsFeedUrl(value) {
  if(typeof value!=='string'||value.length>4096||value!==value.trim()||/[\u0000-\u0020\u007f]/.test(value))
    throw fault('GTFS_FEED_URL_INVALID','Enter the complete public HTTPS feed URL.');
  let url;
  try { url=new URL(value); } catch { throw fault('GTFS_FEED_URL_INVALID','Enter the complete public HTTPS feed URL.'); }
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)||!host.includes('.')||host.includes('..')||
    host.split('.').some(label=>!label||label.length>63||label.startsWith('-')||label.endsWith('-'))||
    isIP(host)||/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(host))
    throw fault('GTFS_FEED_URL_INVALID','Use a public HTTPS domain and the original feed path, without a port or login.');
  return url.href;
}
export function normalizeGtfsFeedSource(input) {
  only(input,['title','url','note','timeoutMs'],['title','url']);
  const timeoutMs=input.timeoutMs??120000;
  if(!integer(timeoutMs,1000,180000))throw fault('GTFS_FEED_TIMEOUT_INVALID','Choose 1–180 seconds for a complete feed acquisition.');
  const note=input.note??'';
  if(typeof note!=='string'||note.length>4000||note.includes('\0'))
    throw fault('GTFS_FEED_SOURCE_INVALID','Keep the source note within 4,000 characters.');
  return {title:text(input.title,'the feed-source title',128),url:gtfsFeedUrl(input.url),
    note:note.trim(),timeoutMs};
}
function publicAddress(address) {
  const family=isIP(address);
  if(family===4) {
    const [a,b,c]=address.split('.').map(Number);
    return a!==0&&a!==10&&a!==127&&a<224&&
      !(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&
      !(a===192&&(b===168||b===0&&(c===0||c===2)||b===88&&c===99))&&
      !(a===198&&(b===18||b===19||b===51&&c===100))&&!(a===203&&b===0&&c===113);
  }
  // Public global-unicast IPv6 only; mapped IPv4, loopback, link/unique-local,
  // multicast and the documentation/benchmark ranges never become destinations.
  if(family===6) {
    const parts=address.split(':'),first=parseInt(parts[0],16),second=parseInt(parts[1]||'0',16);
    return first>=0x2000&&first<0x3fff&&first!==0x2002&&
      !(first===0x2001&&(second<0x200||second===0xdb8));
  }
  return false;
}
function safeHeaders(headers) {
  const out={};
  for(const key of RESPONSE_HEADERS) {
    const value=headers[key];
    if(value===undefined)continue;
    if(typeof value!=='string'||value.length>4096||/[\u0000-\u0008\u000a-\u001f\u007f]/.test(value))
      throw fault('GTFS_FEED_RESPONSE_HEADERS','The source returned an invalid or oversized response field.',502);
    out[key]=value;
  }
  return out;
}
function etag(value) {
  return typeof value==='string'&&value.length<=1024&&/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)?value:null;
}
function modified(value) {
  return typeof value==='string'&&value.length<=128&&/^[\x20-\x7e]+$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
}
export function gtfsResponseValidators(headers) {
  return {etag:etag(headers?.etag),lastModified:modified(headers?.['last-modified'])};
}
function requestValidators(previous) {
  if(!previous)return {};
  const validators=previous.validators??{};
  const tag=etag(validators.etag),date=modified(validators.lastModified);
  return tag?{'if-none-match':tag}:date?{'if-modified-since':date}:{};
}
function retryAt(value,now=Date.now()) {
  if(typeof value!=='string')return null;
  if(/^\d{1,10}$/.test(value.trim())) {
    const time=now+Number(value.trim())*1000;
    return Number.isSafeInteger(time)&&time<=8640000000000000?new Date(time).toISOString():null;
  }
  const parsed=Date.parse(value);
  return Number.isFinite(parsed)?new Date(Math.max(now,parsed)).toISOString():null;
}
async function exists(path) {try {await lstat(path);return true;}catch(issue){if(issue.code==='ENOENT')return false;throw issue;}}
async function writeAll(handle,chunk) {
  let offset=0;
  while(offset<chunk.length) {
    const part=await handle.write(chunk,offset,chunk.length-offset,null);
    if(!part.bytesWritten)throw fault('GTFS_FEED_WRITE_UNAVAILABLE','The original response file could not advance.',503);
    offset+=part.bytesWritten;
  }
}
async function immutable(path,value) {
  const data=bytes(value);
  if(data.length>JSON_MAX)throw fault('GTFS_FEED_RESPONSE_HEADERS','The retained response exceeds its complete metadata limit.',502);
  if(await exists(path)) {
    if(!(await readPrivate(path,JSON_MAX)).equals(data))
      throw fault('GTFS_FEED_ACQUISITION_CHANGED','The retained acquisition file describes another original request.',409);
  } else await atomicJson(dirname(path),basename(path),value);
}
function cancelError(signal) {
  const reason=signal?.reason;
  return reason?.code&&/^GTFS_/.test(reason.code)?reason:
    fault('GTFS_FEED_CANCELLED','The feed acquisition stopped; its original retained request can resume.',409);
}
async function resolvedAddress(host,signal) {
  signal?.throwIfAborted();
  const resolver=lookup(host,{all:true,verbatim:true});
  let handler;
  const cancelled=new Promise((_,reject)=>{
    handler=()=>reject(cancelError(signal));
    if(signal?.aborted)handler();else signal?.addEventListener('abort',handler,{once:true});
  });
  try {
    const addresses=await Promise.race([resolver,cancelled]);
    signal?.throwIfAborted();
    const usable=addresses.filter(item=>publicAddress(item.address));
    if(!usable.length||usable.length!==addresses.length)
      throw fault('GTFS_FEED_PUBLIC_ADDRESS_REQUIRED','The selected source does not resolve exclusively to public addresses.',400);
    return usable.find(item=>item.family===4)??usable[0];
  } catch(issue) {
    if(issue?.code?.startsWith('GTFS_'))throw issue;
    throw fault('GTFS_FEED_DNS_UNAVAILABLE','The selected feed domain could not be resolved; resume the original acquisition.',502);
  } finally {signal?.removeEventListener('abort',handler);}
}
async function responseFor(url,headers,{signal}) {
  const selected=new URL(url),address=await resolvedAddress(selected.hostname,signal);
  signal?.throwIfAborted();
  const agent=new Agent({keepAlive:false,maxSockets:1,maxCachedSessions:0,proxyEnv:{}});
  try {
    const response=await new Promise((resolve,reject)=>{
      const call=httpsRequest(selected,{method:'GET',headers,agent,signal,rejectUnauthorized:true,
        maxHeaderSize:HEADER_MAX,family:address.family,
        lookup:(host,options,done)=>{
          if(host!==selected.hostname)return done(fault('GTFS_FEED_DNS_CHANGED'));
          if(options?.all)done(null,[address]);else done(null,address.address,address.family);
        }},resolve);
      call.once('error',reject);
      call.setTimeout(30000,()=>call.destroy(fault('GTFS_FEED_TIMEOUT','The source stopped sending data; resume the original acquisition.',504)));
      call.end();
    });
    return {response,address,close:()=>agent.destroy()};
  } catch(issue) {agent.destroy();throw issue;}
}
function bindingFor({requestId,sourceId,sourceVersionId,sourceSha256,url,timeoutMs,previous}) {
  if(!UUID.test(requestId??'')||!UUID.test(sourceId??'')||!UUID.test(sourceVersionId??'')||!SHA.test(sourceSha256??''))
    throw fault('GTFS_FEED_ACQUISITION_ID','Use the original source and acquisition identities.');
  if(!integer(timeoutMs,1000,180000))throw fault('GTFS_FEED_TIMEOUT_INVALID');
  if(previous!==null) {
    only(previous,['acquisitionId','acquisitionSha256','feedId','feedSha256','feedBytes','url','validatorUrl','validators','conditional'],
      ['acquisitionId','acquisitionSha256','feedId','feedSha256','feedBytes','url','validatorUrl','validators','conditional']);
    if(!UUID.test(previous.acquisitionId??'')||!UUID.test(previous.feedId??'')||
      !SHA.test(previous.acquisitionSha256??'')||!SHA.test(previous.feedSha256??'')||
      !integer(previous.feedBytes,1,GTFS_ZIP_MAX_BYTES)||previous.url!==url||typeof previous.conditional!=='boolean'||
      gtfsFeedUrl(previous.validatorUrl)!==previous.validatorUrl)
      throw fault('GTFS_FEED_PREVIOUS_CHANGED','Choose the exact retained acquisition for this feed URL.',409);
    only(previous.validators,['etag','lastModified'],['etag','lastModified']);
    if(previous.validators.etag!==null&&etag(previous.validators.etag)!==previous.validators.etag||
      previous.validators.lastModified!==null&&modified(previous.validators.lastModified)!==previous.validators.lastModified)
      throw fault('GTFS_FEED_PREVIOUS_CHANGED','The retained response validators are inconsistent.',409);
  }
  return {schema:GTFS_HTTP_ACQUISITION_SCHEMA,requestId,sourceId,sourceVersionId,sourceSha256,
    url:gtfsFeedUrl(url),timeoutMs,maximumBytes:GTFS_ZIP_MAX_BYTES,previous};
}
function responseIssue(record) {
  const status=record.response?.status,deadline=record.retryAt;
  if(record.outcome==='HTTP_ERROR') {
    const retryable=status===408||status===429||status>=500;
    const code=status===429?'GTFS_FEED_RATE_LIMIT_UNAVAILABLE':retryable?'GTFS_FEED_PROVIDER_UNAVAILABLE':'GTFS_FEED_PROVIDER_RESPONSE';
    const issue=fault(code,'The feed provider returned HTTP '+status+
      (deadline?'; resume this same acquisition after '+deadline+'.':'.'),status===429?429:502);
    issue.providerStatus=status;issue.retryAt=deadline;return issue;
  }
  return fault(record.error?.code??'GTFS_FEED_TRANSPORT_UNAVAILABLE',
    record.error?.message??'The source response was interrupted; resume this original acquisition.',502);
}
function completed(record,binding) {
  if(!object(record)||record.schema!==GTFS_HTTP_ACQUISITION_SCHEMA||record.bindingSha256!==identity(binding)||
    record.requestId!==binding.requestId||!UUID.test(record.attemptId??'')||
    !['COMPLETE','NOT_MODIFIED','HTTP_ERROR','TRANSPORT_ERROR'].includes(record.outcome)||
    record.originalUrl!==binding.url||typeof record.startedAt!=='string'||!Number.isFinite(Date.parse(record.startedAt))||
    typeof record.completedAt!=='string'||!Number.isFinite(Date.parse(record.completedAt))||
    !Array.isArray(record.redirects)||record.redirects.length>REDIRECT_MAX)
    throw fault('GTFS_FEED_ACQUISITION_CHANGED','The retained original HTTP response is inconsistent.',409);
  let expectedUrl=binding.url;
  for(const redirect of record.redirects) {
    if(!object(redirect)||redirect.url!==expectedUrl||![301,302,303,307,308].includes(redirect.status)||
      !object(redirect.headers)||typeof redirect.nextUrl!=='string'||gtfsFeedUrl(redirect.nextUrl)!==redirect.nextUrl)
      throw fault('GTFS_FEED_ACQUISITION_CHANGED','The retained redirect chain changed.',409);
    expectedUrl=redirect.nextUrl;
  }
  if(record.response!==null&&(!object(record.response)||record.response.url!==expectedUrl||
    !integer(record.response.status,100,599)||!object(record.response.headers)||
    identity(safeHeaders(record.response.headers))!==identity(record.response.headers)))
    throw fault('GTFS_FEED_ACQUISITION_CHANGED','The retained response URL or headers changed.',409);
  if(['COMPLETE','NOT_MODIFIED','HTTP_ERROR'].includes(record.outcome)&&record.response===null)
    throw fault('GTFS_FEED_ACQUISITION_CHANGED');
  if(record.outcome==='COMPLETE'&&(!SHA.test(record.body?.sha256??'')||
    !integer(record.body?.bytes,1,GTFS_ZIP_MAX_BYTES)||record.body.file!=='original.gtfs.zip'||record.response?.status!==200))
    throw fault('GTFS_FEED_ACQUISITION_CHANGED','The retained original complete ZIP is inconsistent.',409);
  if(record.outcome==='NOT_MODIFIED'&&(record.response?.status!==304||!binding.previous?.conditional||
    !Object.keys(requestValidators(binding.previous)).length||record.response.url!==binding.previous.validatorUrl))
    throw fault('GTFS_FEED_ACQUISITION_CHANGED','A conditional response needs the exact previous retained feed.',409);
  return record;
}
async function retainedAttempts(directory,binding,{create=false}={}) {
  const base=join(directory,'attempts');
  if(!await exists(base)) {if(!create)return [];await privateDirectory(base,true);}
  else await privateDirectory(base);
  const records=[];
  for(const name of (await readdir(base)).sort()) {
    if(name.startsWith('.preparing-')&&UUID.test(name.slice('.preparing-'.length))) {
      await privateDirectory(join(base,name));continue;
    }
    if(!UUID.test(name))throw fault('GTFS_FEED_ACQUISITION_CHANGED','The original acquisition attempt directory contains an unexpected entry.',409);
    const path=join(base,name);await privateDirectory(path);
    const marker=await readJson(join(path,'request.json'),JSON_MAX);
    if(marker.schema!=='stellar-forge.gtfs-http-attempt.v1'||marker.attemptId!==name||
      marker.bindingSha256!==identity(binding)||!Number.isSafeInteger(marker.ordinal)||marker.ordinal<1)
      throw fault('GTFS_FEED_ACQUISITION_CHANGED','The retained source attempt differs from the original request.',409);
    const done=await exists(join(path,'response.json'))?completed(await readJson(join(path,'response.json'),JSON_MAX),binding):null;
    if(done&&done.attemptId!==name)throw fault('GTFS_FEED_ACQUISITION_CHANGED');
    records.push({path,marker,done});
  }
  records.sort((a,b)=>a.marker.ordinal-b.marker.ordinal);
  if(records.length>ATTEMPT_MAX||records.some((item,index)=>item.marker.ordinal!==index+1))
    throw fault('GTFS_FEED_ACQUISITION_CHANGED','The original acquisition history is inconsistent.',409);
  return records;
}
async function verifyCompleted(directory,binding,record) {
  completed(record,binding);
  if(!['COMPLETE','NOT_MODIFIED'].includes(record.outcome))throw responseIssue(record);
  const file=join(directory,'attempts',record.attemptId,'response.json');
  const saved=await readPrivate(file,JSON_MAX);
  if(identity(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(saved)))!==identity(record))
    throw fault('GTFS_FEED_ACQUISITION_CHANGED');
  let bodyFile=null;
  if(record.outcome==='COMPLETE') {
    bodyFile=join(directory,'attempts',record.attemptId,record.body.file);
    const body=await hashPrivate(bodyFile,GTFS_ZIP_MAX_BYTES);
    if(body.hash!==record.body.sha256||body.bytes!==record.body.bytes)
      throw fault('GTFS_FEED_SOURCE_CHANGED','The retained complete source ZIP changed.',409);
  }
  return {response:record,responseSha256:digest(saved),bodyFile};
}
export async function inspectGtfsFeedAttempts(directory,input) {
  await privateDirectory(directory);const binding=bindingFor(input);
  const saved=await readJson(join(directory,'request.json'),JSON_MAX);
  if(identity(saved)!==identity(binding))throw fault('GTFS_FEED_ACQUISITION_CHANGED');
  const attempts=await retainedAttempts(directory,binding),history=[];
  for(const attempt of attempts) {
    const record=attempt.done;
    if(record?.errorBody?.file) {
      if(record.errorBody.file!=='error-response.bin'||!integer(record.errorBody.bytes,1,ERROR_BODY_MAX)||
        !SHA.test(record.errorBody.sha256??''))throw fault('GTFS_FEED_ACQUISITION_CHANGED');
      const body=await hashPrivate(join(attempt.path,record.errorBody.file),ERROR_BODY_MAX);
      if(body.hash!==record.errorBody.sha256||body.bytes!==record.errorBody.bytes)
        throw fault('GTFS_FEED_ACQUISITION_CHANGED','The original provider error response changed.',409);
    }
    history.push({request:attempt.marker,response:record,responseSha256:record?
      digest(await readPrivate(join(attempt.path,'response.json'),JSON_MAX)):null});
  }
  return {binding,attempts:history,historySha256:identity({binding,attempts:history})};
}
export async function inspectGtfsFeedResponse(directory,input) {
  await privateDirectory(directory);const binding=bindingFor(input);
  const saved=await readJson(join(directory,'request.json'),JSON_MAX);
  if(identity(saved)!==identity(binding))throw fault('GTFS_FEED_ACQUISITION_CHANGED');
  const attempts=await retainedAttempts(directory,binding);
  const done=attempts.filter(item=>['COMPLETE','NOT_MODIFIED'].includes(item.done?.outcome));
  if(done.length!==1)throw fault('GTFS_FEED_ACQUISITION_NOT_COMPLETE','Resume the original feed acquisition.',409);
  return {...await verifyCompleted(directory,binding,done[0].done),binding};
}
export async function acquireGtfsFeedResponse(directory,input,{signal}={}) {
  await privateDirectory(directory,true);const binding=bindingFor(input);
  await immutable(join(directory,'request.json'),binding);
  const attempts=await retainedAttempts(directory,binding,{create:true});
  const done=attempts.filter(item=>['COMPLETE','NOT_MODIFIED'].includes(item.done?.outcome));
  if(done.length>1)throw fault('GTFS_FEED_ACQUISITION_CHANGED','One original request retains more than one completed response.',409);
  if(done.length)return {...await verifyCompleted(directory,binding,done[0].done),binding,reused:true};
  const previousAttempt=attempts.at(-1)?.done;
  if(previousAttempt?.outcome==='HTTP_ERROR') {
    if(![408,429].includes(previousAttempt.response.status)&&previousAttempt.response.status<500)
      throw responseIssue(previousAttempt);
    if(previousAttempt.retryAt&&Date.parse(previousAttempt.retryAt)>Date.now())throw responseIssue(previousAttempt);
  }
  if(attempts.length>=ATTEMPT_MAX)
    throw fault('GTFS_FEED_ATTEMPT_LIMIT','Retain this complete acquisition history and begin a new source acquisition.',409);
  if(signal?.aborted)throw cancelError(signal);
  const attemptId=randomUUID(),path=join(directory,'attempts',attemptId),startedAt=stamp();
  const staging=join(directory,'attempts','.preparing-'+attemptId);
  const bindingSha256=identity(binding),redirects=[];
  await privateDirectory(staging,true);
  await immutable(join(staging,'request.json'),{schema:'stellar-forge.gtfs-http-attempt.v1',attemptId,
    bindingSha256,ordinal:attempts.length+1,startedAt});
  if(await exists(path))throw fault('GTFS_FEED_ACQUISITION_CHANGED');
  await rename(staging,path);await syncDirectory(join(directory,'attempts'));
  const controller=new AbortController();
  const onAbort=()=>controller.abort(cancelError(signal));
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted)onAbort();
  const timer=setTimeout(()=>controller.abort(fault('GTFS_FEED_TIMEOUT','The full source acquisition reached its selected timeout; resume the original request.',504)),binding.timeoutMs);
  timer.unref?.();
  const record={schema:GTFS_HTTP_ACQUISITION_SCHEMA,requestId:binding.requestId,attemptId,bindingSha256,
    startedAt,completedAt:null,originalUrl:binding.url,redirects,outcome:null,response:null,body:null,retryAt:null,error:null};
  const savedValidators=binding.previous?.conditional?requestValidators(binding.previous):{};
  let url=binding.url,bodyHandle=null,activeResponse=null;
  try {
    for(let hop=0;;hop++) {
      if(controller.signal.aborted)throw cancelError(controller.signal);
      const validators=url===binding.previous?.validatorUrl?savedValidators:{};
      const headers={accept:'application/zip, application/octet-stream;q=0.9','accept-encoding':'identity',
        'user-agent':'Starforge-GTFS/1.0',...validators};
      const opened=await responseFor(url,headers,{signal:controller.signal});activeResponse=opened;
      const response=opened.response,status=response.statusCode,receivedHeaders=safeHeaders(response.headers);
      const summary={url,status,headers:receivedHeaders,requestHeaders:headers,address:opened.address,receivedAt:stamp()};
      record.response=summary;
      if([301,302,303,307,308].includes(status)) {
        if(hop>=REDIRECT_MAX)throw fault('GTFS_FEED_REDIRECT_LIMIT','The source exceeded five HTTPS redirects.',502);
        if(!receivedHeaders.location)throw fault('GTFS_FEED_REDIRECT_INVALID','The source returned a redirect without its destination.',502);
        const next=gtfsFeedUrl(new URL(receivedHeaders.location,url).href);
        if(next===url||redirects.some(item=>item.url===next))throw fault('GTFS_FEED_REDIRECT_LOOP','The source repeated a redirect destination.',502);
        redirects.push({...summary,nextUrl:next});response.destroy();opened.close();activeResponse=null;url=next;record.response=null;continue;
      }
      if(status===304) {
        if(!Object.keys(validators).length||!binding.previous?.conditional)
          throw fault('GTFS_FEED_CONDITIONAL_RESPONSE_INVALID','The source returned 304 without the original retained feed validator.',502);
        response.destroy();opened.close();activeResponse=null;record.outcome='NOT_MODIFIED';break;
      }
      if(status!==200) {
        // Keep the complete bounded error response when it fits, plus exact headers.
        const chunks=[];let count=0,truncated=false;
        try {
          for await(const chunk of response) {
            const remaining=ERROR_BODY_MAX-count;
            if(chunk.length>remaining) {
              if(remaining){chunks.push(chunk.subarray(0,remaining));count+=remaining;}
              truncated=true;response.destroy();break;
            }
            chunks.push(chunk);count+=chunk.length;
          }
          if(!response.complete)truncated=true;
        } catch {truncated=true;}
        if(count){const raw=Buffer.concat(chunks);await createFile(join(path,'error-response.bin'),raw);
          record.errorBody={file:'error-response.bin',bytes:raw.length,sha256:digest(raw),truncated};}
        else record.errorBody={file:null,bytes:0,sha256:null,truncated};
        opened.close();activeResponse=null;record.outcome='HTTP_ERROR';
        record.retryAt=retryAt(receivedHeaders['retry-after']);break;
      }
      const encoding=receivedHeaders['content-encoding'];
      if(encoding&&encoding.toLowerCase()!=='identity')
        throw fault('GTFS_FEED_ENCODING_UNSUPPORTED','The source must return the complete ZIP with identity HTTP encoding.',502);
      const length=receivedHeaders['content-length'];
      if(length!==undefined&&(!/^\d+$/.test(length)||!integer(Number(length),1,GTFS_ZIP_MAX_BYTES)))
        throw fault('GTFS_FEED_SIZE_INVALID','The complete source ZIP must fit within 16 MiB.',413);
      bodyHandle=await open(join(path,'original.gtfs.zip'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      const hash=createHash('sha256');let count=0;
      for await(const chunk of response) {
        if(controller.signal.aborted)throw cancelError(controller.signal);
        count+=chunk.length;
        if(count>GTFS_ZIP_MAX_BYTES)throw fault('GTFS_FEED_SIZE_INVALID','The complete source ZIP exceeds 16 MiB.',413);
        await writeAll(bodyHandle,chunk);hash.update(chunk);
      }
      if(!response.complete||count===0||length!==undefined&&Number(length)!==count)
        throw fault('GTFS_FEED_RESPONSE_UNAVAILABLE','The source ZIP response was incomplete; resume the original acquisition.',502);
      await bodyHandle.sync();await bodyHandle.close();bodyHandle=null;await syncDirectory(path);
      record.body={file:'original.gtfs.zip',bytes:count,sha256:hash.digest('hex')};
      record.outcome='COMPLETE';opened.close();activeResponse=null;break;
    }
    record.completedAt=stamp();
    await immutable(join(path,'response.json'),record);
    if(record.outcome==='HTTP_ERROR')throw responseIssue(record);
    return {...await verifyCompleted(directory,binding,record),binding,reused:false};
  } catch(issue) {
    if(!record.outcome) {
      const original=controller.signal.aborted?cancelError(controller.signal):issue;
      const code=/^GTFS_[A-Z0-9_]+$/.test(original?.code??'')?original.code:'GTFS_FEED_TRANSPORT_UNAVAILABLE';
      record.outcome='TRANSPORT_ERROR';record.completedAt=stamp();
      record.error={code,message:code===original?.code?String(original.message).slice(0,2000):
        'The source response was interrupted; resume this original acquisition.'};
      await immutable(join(path,'response.json'),record).catch(()=>{});
      const error=fault(code,record.error.message,original?.status??502);
      throw error;
    }
    throw issue;
  } finally {
    clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
    activeResponse?.response?.destroy();activeResponse?.close();
    if(bodyHandle)await bodyHandle.close().catch(()=>{});
  }
}
