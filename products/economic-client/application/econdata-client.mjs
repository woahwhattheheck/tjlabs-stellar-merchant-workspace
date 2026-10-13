// SPDX-License-Identifier: MIT
// Original EconData GET acquisition, retained source and portable customer state.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import https from 'node:https';
import zlib from 'node:zlib';
import lossless from './vendor/lossless-json.cjs';

const ACCEPT = 'application/vnd.sdmx-codera.data+json';
const BASE = 'https://www.econdata.co.za/sdmx-codera/v1';
const AUTH = 'https://codera-econdata.auth.af-south-1.amazoncognito.com/oauth2/token';
const RESOURCES = new Set(['datasets','dataflows','datastructures','codelists','conceptschemes','provisionagreements']);
const COLLECTION = {datasets:'data-sets',dataflows:'dataflows',datastructures:'data-structures',codelists:'codelists',conceptschemes:'concept-schemes',provisionagreements:'provision-agreements'};
const NOW = () => new Date().toISOString();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k,sort(value[k])]));
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite request value');
  if (value === undefined) throw new Error('Undefined request value');
  return value;
}
function exactKeys(value, allowed, label) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Invalid '+label+' fields');
}
function text(value,label) {
  if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value)) throw new Error('Use the original '+label);
  return value;
}
function relative(name) {
  if (typeof name !== 'string' || name.startsWith('/') || name.includes('\\') || name.split('/').some(x => !x || x === '.' || x === '..') || name.includes('\0')) throw new Error('Invalid source-relative path');
  return name;
}
function safeHttps(value,label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(label+' requires HTTPS without embedded credentials or fragments');
  return url;
}
function pointer(key) { return String(key).replace(/~/g,'~0').replace(/\//g,'~1'); }
export function parseEconDataJSON(raw) {
  const number_lexemes = {};
  const parsed = lossless.parse(raw);
  function convert(value, at) {
    if (lossless.isLosslessNumber(value)) { number_lexemes[at] = value.value; return value.value; }
    if (Array.isArray(value)) return value.map((v,i) => convert(v,at+'/'+i));
    if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,convert(v,at+'/'+pointer(k))]));
    return value;
  }
  const original = convert(parsed,'');
  const type_tags = {};
  function untag(value, at='') {
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'string' && /^#sdmx[.:/]/.test(value[0])) {
        if(Object.hasOwn(type_tags,at))type_tags[at]=[...[type_tags[at]].flat(),value[0]];
        else type_tags[at]=value[0];
        return untag(value[1],at);
      }
      return value.map((v,i)=>untag(v,at+'/'+i));
    }
    if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,untag(v,at+'/'+pointer(k))]));
    return value;
  }
  const data=untag(original);
  return {data,number_lexemes,type_tags};
}
export function nativeReference(value) {
  if (!plain(value)) throw new Error('Missing original agency/id/version reference');
  return ['agencyid','id','version'].map(k => text(value[k],k)).join('-');
}
function collection(data,resource) {
  const value = resource === 'datasets' ? data?.['data-sets'] : data?.structures?.[COLLECTION[resource]];
  if (!Array.isArray(value)) throw new Error('Native response is missing '+COLLECTION[resource]);
  return value;
}
function nextLink(value,current) {
  if (!value) return null;
  const segments = []; let start=0, quote=false, angle=false, escaped=false;
  for (let i=0;i<value.length;i++) {
    const c=value[i];
    if (escaped) { escaped=false; continue; }
    if (c==='\\' && quote) { escaped=true; continue; }
    if (c==='"') quote=!quote;
    if (!quote && c==='<') angle=true;
    if (!quote && c==='>') angle=false;
    if (!quote && !angle && c===',') {segments.push(value.slice(start,i));start=i+1;}
  }
  segments.push(value.slice(start));
  const next = segments.flatMap(segment => {
    const target=segment.match(/^\s*<([^>]+)>/), rel=segment.match(/;\s*rel\s*=\s*(?:"([^"]*)"|([^;\s]+))/i);
    return target && rel && (rel[1]||rel[2]).split(/\s+/).includes('next') ? [new URL(target[1],current)] : [];
  });
  if (next.length>1) throw new Error('Native Link contains multiple next pages');
  return next[0] || null;
}
function releaseQuery(value, nativeRelease=false) {
  text(value,'release timestamp');
  // The released R client formats instants in Africa/Johannesburg (UTC+02).
  // A native explicit wall time is already in the provider's query timezone.
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(value)) {
    if(!nativeRelease)return value;
    value += value.includes('T') ? 'Z' : 'T00:00:00Z';
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) throw new Error('Use an ISO release instant or provider local timestamp');
  const epoch=Date.parse(value);
  if (!Number.isFinite(epoch)) throw new Error('Invalid original release timestamp');
  return new Date(epoch+7200000).toISOString().slice(0,19);
}
function nativeURL(base, request) {
  exactKeys(request,['resource','ref','section','series_ref','query'],'native GET');
  if (!RESOURCES.has(request.resource)) throw new Error('Unsupported read-only resource');
  let suffix=request.resource, allowed;
  if (request.ref!==undefined) suffix += '/'+encodeURIComponent(text(request.ref,'native reference'));
  if (request.section!==undefined) {
    if (request.resource!=='datasets' || !request.ref || !['release','schema','series'].includes(request.section)) throw new Error('Unsupported original dataset section');
    suffix+='/'+request.section;
  }
  if (request.series_ref!==undefined) {
    if (request.section!=='series') throw new Error('A series reference requires the original series section');
    suffix+='/'+encodeURIComponent(text(request.series_ref,'series reference'));
  }
  if (request.resource!=='datasets') allowed=request.ref ? ['detail','relations'] : ['agencyids','ids','versions','detail','relations'];
  else if (!request.ref) allowed=['agencyids','ids','versions','relations'];
  else if (request.section==='release') allowed=['latest','after','before','description'];
  else if (request.section==='schema') allowed=[];
  else if (request.section==='series') allowed=request.series_ref ? ['relations','release','hist-obs','start','end'] : ['detail','relations','release','series-key'];
  else allowed=['release','relations','offset','hist-obs','detail','limit','start','series-key','end'];
  const query=request.query||{};
  exactKeys(query,allowed,'native GET query');
  const url=new URL(base.href.replace(/\/$/,'')+'/'+suffix);
  for (const key of Object.keys(query).sort()) {
    let value=query[key];
    if (value===undefined || value===null) continue;
    if (Array.isArray(value) && ['agencyids','ids','versions'].includes(key)) value=value.map(v=>text(v,key)).join(',');
    if (['hist-obs','latest'].includes(key) && typeof value!=='boolean') throw new Error(key+' must be a native boolean');
    if (['offset','limit'].includes(key) && (!Number.isSafeInteger(value) || value<(key==='limit'?1:0))) throw new Error('Invalid '+key);
    if (key==='detail' && !['stub','full'].includes(value)) throw new Error('Invalid detail');
    if (key==='relations' && !['none','references','referenced-by'].includes(value)) throw new Error('Invalid relations');
    if (!['string','number','boolean'].includes(typeof value)) throw new Error('Invalid native query value '+key);
    if (typeof value==='string' && /[\0\r\n]/.test(value)) throw new Error('Invalid query control character');
    url.searchParams.set(key,String(value));
  }
  return url;
}

export class EconDataAttention extends Error {
  constructor(message, detail={}) { super(message); this.name='EconDataAttention'; this.detail=detail; }
}

export function createEconDataClient(options) {
  const directory=path.resolve(text(options?.directory,'private source directory'));
  const base=safeHttps(options.baseUrl||BASE,'EconData base');
  if (base.search) throw new Error('Base URL cannot contain a query');
  const auth=safeHttps(options.authUrl||AUTH,'OAuth endpoint');
  const credentialEnv=options.credentialEnv||null, credentialsEnv=options.credentialsEnv||null;
  if (credentialEnv && credentialsEnv) throw new Error('Select one credential environment name');
  for (const name of [credentialEnv,credentialsEnv]) if (name && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Use a credential environment variable NAME');
  const timeoutMs=options.timeoutMs??30000, maxBytes=options.maxResponseBytes??256*1024*1024;
  if (!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||!Number.isSafeInteger(maxBytes)||maxBytes<1024) throw new Error('Invalid native response bounds');
  let token=null, tail=Promise.resolve();
  function locate(name) {
    relative(name); const selected=path.join(directory,name);
    let current=directory;
    for (const part of name.split('/')) {
      current=path.join(current,part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('A retained source path is a symbolic link');
    }
    return selected;
  }
  function ensure() {
    let ancestor=directory;
    while (!fs.existsSync(ancestor)) ancestor=path.dirname(ancestor);
    for (let current=ancestor;;current=path.dirname(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Private source directory has a linked parent');
      if (current===path.dirname(current)) break;
    }
    fs.mkdirSync(directory,{recursive:true,mode:0o700}); fs.chmodSync(directory,0o700);
    for (const d of ['operations','sources','objects','attempts']) fs.mkdirSync(locate(d),{recursive:true,mode:0o700});
  }
  function syncDir(dir) { const fd=fs.openSync(dir,'r'); try {fs.fsyncSync(fd);} finally {fs.closeSync(fd);} }
  function atomic(name,bytes) {
    const target=locate(name); fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    const tmp=target+'.'+crypto.randomUUID()+'.part', fd=fs.openSync(tmp,'wx',0o600);
    try {fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    fs.renameSync(tmp,target);syncDir(path.dirname(target));
  }
  const save=(name,value)=>atomic(name,json(value));
  const exists=name=>fs.existsSync(locate(name));
  const readJSON=name=>JSON.parse(fs.readFileSync(locate(name),'utf8'));
  function identity(name) { const bytes=fs.readFileSync(locate(name));return {path:name,bytes:bytes.length,sha256:digest(bytes)}; }
  function bodyRead(row) {
    relative(row.path);const bytes=fs.readFileSync(locate(row.path));
    if(bytes.length!==row.bytes||digest(bytes)!==row.sha256) throw new Error('Retained source body differs: '+row.path);
    return bytes;
  }
  function object(bytes) {
    const sha256=digest(bytes), name='objects/'+sha256;
    if(exists(name)) { const prior=identity(name);if(prior.sha256!==sha256||prior.bytes!==bytes.length)throw new Error('Original object conflict'); }
    else atomic(name,bytes);
    return {path:name,bytes:bytes.length,sha256};
  }
  function processIdentity(pid) {
    try {
      const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
      return {pid,boot:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),start:fields[19],state:fields[0],hostname:os.hostname()};
    } catch(e) {
      if(process.platform==='linux') {if(e.code==='ENOENT')return null;throw e;}
      try {process.kill(pid,0);return {pid,boot:null,start:null,state:'alive',hostname:os.hostname()};}
      catch(probe) {if(probe.code==='ESRCH')return null;if(probe.code==='EPERM')return {pid,boot:null,start:null,state:'alive',hostname:os.hostname()};throw probe;}
    }
  }
  function acquire() {
    ensure();const nonce=crypto.randomUUID(), candidate='lock-candidate-'+nonce;
    fs.mkdirSync(locate(candidate),{mode:0o700});
    const owner={nonce,identity:processIdentity(process.pid),created_at:NOW()};
    if(!owner.identity)throw new Error('Original process identity unavailable');
    save(candidate+'/owner.json',owner);
    try {fs.renameSync(locate(candidate),locate('client.lock'));}
    catch(error) {
      if(!['EEXIST','ENOTEMPTY'].includes(error.code)) throw error;
      const prior=readJSON('client.lock/owner.json'), current=processIdentity(prior.identity.pid);
      if(prior.identity.hostname!==owner.identity.hostname) throw new EconDataAttention('Source journal belongs to another native host; receive its exported state into a fresh directory');
      if(prior.identity.boot===owner.identity.boot && current && current.start===prior.identity.start && current.boot===prior.identity.boot && current.state!=='Z') throw new EconDataAttention('Original acquisition process is still active',{owner:prior});
      // Fixed nonempty tombstone makes competing stale-owner recoveries atomic.
      fs.renameSync(locate('client.lock'),locate('stale-lock-'+prior.nonce));
      fs.renameSync(locate(candidate),locate('client.lock'));
    }
    return ()=>{ if(readJSON('client.lock/owner.json').nonce!==nonce)throw new Error('Original lock ownership changed');fs.unlinkSync(locate('client.lock/owner.json'));fs.rmdirSync(locate('client.lock')); };
  }
  function exclusive(fn) {
    const run=tail.then(async()=>{
      const release=acquire();
      try {
        if(exists('authority.json')) {
          const original=readJSON('authority.json');
          if(original.base_url!==base.href) {
            if(fs.readdirSync(locate('operations')).length||fs.readdirSync(locate('sources')).length)throw new Error('Retain the original source directory API authority');
            save('authority.json',{schema:'tjl.econdata.authority.v1',base_url:base.href,created_at:NOW()});
          }
        } else save('authority.json',{schema:'tjl.econdata.authority.v1',base_url:base.href,created_at:NOW()});
        return await fn();
      } finally {release();}
    });
    tail=run.catch(()=>{});return run;
  }
  function backoff() {
    if(exists('provider.json')) {
      const state=readJSON('provider.json');
      if(state.origin===base.origin && Date.parse(state.not_before)>Date.now()) throw new EconDataAttention('Provider retry delay is still active',state);
    }
  }
  function delay(headers,status,receivedAt=NOW()) {
    const raw=headers['retry-after']; if(!raw)return null;
    const parsed=/^\d+$/.test(String(raw)) ? Date.parse(receivedAt)+Number(raw)*1000 : Date.parse(String(raw));
    if(!Number.isFinite(parsed))return null;
    const row={origin:base.origin,status,received_at:receivedAt,retry_after:String(raw),not_before:new Date(parsed).toISOString()};
    save('provider.json',row);return row;
  }
  function headersSafe(headers) {
    const denied=new Set(['set-cookie','set-cookie2','authorization','proxy-authorization','authentication-info','proxy-authentication-info']);
    return {headers:Object.fromEntries(Object.entries(headers).filter(([k])=>!denied.has(k.toLowerCase()))),omitted_headers:Object.keys(headers).filter(k=>denied.has(k.toLowerCase()))};
  }
  async function bearer() {
    const envName=credentialsEnv||credentialEnv;
    if(!envName)throw new EconDataAttention('Bind an existing authorized credential environment NAME');
    const value=process.env[envName];
    if(!value)throw new EconDataAttention('Credential environment value is unavailable',{credential_env:envName});
    const split=value.indexOf(';');
    if(!credentialsEnv && split===-1) {
      if(/[\r\n]/.test(value))throw new Error('Invalid credential header');
      return value.startsWith('Bearer ')?value:'Bearer '+value;
    }
    if(split<1||split===value.length-1)throw new Error('Service credentials must contain client_id;client_secret');
    if(token && token.expires>Date.now()+30000)return 'Bearer '+token.value;
    const bytes=Buffer.from(new URLSearchParams({grant_type:'client_credentials',client_id:value.slice(0,split),client_secret:value.slice(split+1)}).toString());
    // Credential-bearing request and token response remain memory-only.
    const response=await new Promise((resolve,reject)=>{
      const req=https.request(auth,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':bytes.length,Accept:'application/json'}},res=>{
        const chunks=[];let n=0;
        res.on('data',b=>{n+=b.length;if(n>1024*1024)res.destroy(new Error('OAuth response exceeds native limit'));else chunks.push(b);});
        res.on('error',reject);res.on('end',()=>{if(!res.complete)return reject(new Error('Incomplete OAuth response'));resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)});});
      });
      const timer=setTimeout(()=>req.destroy(new Error('OAuth deadline exceeded')),timeoutMs);
      req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(bytes);
    });
    if(response.status!==200) {delay(response.headers,response.status);throw new EconDataAttention('Original OAuth request returned HTTP '+response.status,{status:response.status,credential_env:envName});}
    const result=JSON.parse(response.bytes.toString('utf8'));
    if(typeof result.access_token!=='string'||!result.access_token||/[\r\n]/.test(result.access_token))throw new Error('Native OAuth response has no valid access token');
    token={value:result.access_token,expires:Date.now()+Math.max(0,Number(result.expires_in)||0)*1000};
    return 'Bearer '+token.value;
  }

  async function wire(url,attemptName) {
    const envelopeName=attemptName+'.response.json';
    if(exists(envelopeName)) {
      const result=readJSON(envelopeName);bodyRead(result.wire_body);
      if(result.complete)return result;
      throw new EconDataAttention('Original native response was incomplete',{response:result});
    }
    const authorization=await bearer();
    const wireName=attemptName+'.wire', fd=fs.openSync(locate(wireName),'wx',0o600);
    let req,timer,res,count=0,header,complete=false,error=null;
    try {
      res=await new Promise((resolve,reject)=>{
        req=https.request(url,{method:'GET',headers:{Accept:ACCEPT,'Accept-Encoding':'identity',Authorization:authorization}},resolve);
        timer=setTimeout(()=>req.destroy(new Error('Native GET deadline exceeded')),timeoutMs);
        req.on('error',reject);req.end();
      });
      header={status:res.statusCode,status_message:res.statusMessage,http_version:res.httpVersion,...headersSafe(res.headers),received_at:NOW()};
      save(attemptName+'.headers.json',header);
      for await(const chunk of res) {
        if(count+chunk.length>maxBytes) {res.destroy();throw new Error('Original response exceeds configured byte bound');}
        let offset=0;while(offset<chunk.length)offset+=fs.writeSync(fd,chunk,offset,chunk.length-offset);
        count+=chunk.length;
      }
      const length=res.headers['content-length'];
      if(!res.complete || (length!==undefined && (!/^\d+$/.test(String(length)) || BigInt(length)!==BigInt(count))))throw new Error('Original HTTP response ended before its complete declared body');
      complete=true;
    } catch(e) {error={name:e.name,message:e.message};}
    finally {if(timer)clearTimeout(timer);fs.fsyncSync(fd);fs.closeSync(fd);}
    const response={schema:'tjl.econdata.http-response.v1',method:'GET',url:url.href,...header,complete,
      wire_body:identity(wireName),completed_at:NOW(),error};
    save(envelopeName,response);
    if(!complete)throw new EconDataAttention('Original native GET did not complete',{response});
    return response;
  }
  function decodeResponse(response) {
    const wireBytes=bodyRead(response.wire_body), encoding=String(response.headers['content-encoding']||'identity').toLowerCase().trim();
    let bytes;
    const limits={maxOutputLength:maxBytes};
    if(encoding==='identity')bytes=wireBytes;
    else if(encoding==='gzip')bytes=zlib.gunzipSync(wireBytes,limits);
    else if(encoding==='deflate')bytes=zlib.inflateSync(wireBytes,limits);
    else if(encoding==='br')bytes=zlib.brotliDecompressSync(wireBytes,limits);
    else throw new Error('Unsupported native content encoding: '+encoding);
    if(bytes.length>maxBytes)throw new Error('Decoded native response exceeds byte bound');
    const raw_text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {bytes,raw_text};
  }
  async function get(operation,urlValue) {
    const url=safeHttps(urlValue,'Native source URL');
    if(url.origin!==base.origin || !url.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/'))throw new Error('Source URL changed original API authority');
    const id=digest(canonical({operation_id:operation.operation_id,method:'GET',url:url.href,accept:ACCEPT}));
    const name='sources/'+id+'.json';
    let row=exists(name)?readJSON(name):{schema:'tjl.econdata.source-journal.v1',id,operation_id:operation.operation_id,url:url.href,method:'GET',accept:ACCEPT,state:'PREPARED',attempts:[]};
    if(row.url!==url.href || row.operation_id!==operation.operation_id)throw new Error('Original source identity conflict');
    if(!exists(name))save(name,row); // Persist the source before another journal references it.
    if(!operation.source_ids.includes(id)){operation.source_ids.push(id);saveOperation(operation);}
    if(row.state==='COMPLETE'){bodyRead(row.source.body);return readSource(id);}
    backoff();
    if(!row.active) {
      const index=row.attempts.length;
      row.active={index,prefix:'attempts/'+id+'-'+index,started_at:NOW(),hops:[]};
      row.attempts.push(row.active);row.state='REQUESTING';save(name,row);
    }
    const current=row.active;row.attempts[current.index]=current;let target=url;
    try {
      const seen=new Set();
      for(let hop=0;hop<6;hop++) {
        if(seen.has(target.href))throw new Error('Original redirect loop');
        seen.add(target.href);
        const response=await wire(target,current.prefix+'-'+hop);
        if(!current.hops[hop])current.hops[hop]=response;
        else if(canonical(current.hops[hop])!==canonical(response))throw new Error('Original response journal conflict');
        save(name,row);
        delay(response.headers,response.status,response.received_at);
        if([301,302,303,307,308].includes(response.status)) {
          if(!response.headers.location)throw new Error('Native redirect has no Location');
          const next=safeHttps(new URL(response.headers.location,target).href,'Native redirect');
          if(next.origin!==base.origin||!next.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/'))throw new Error('Native redirect leaves original API authority');
          target=next;continue;
        }
        const decoded=decodeResponse(response),body=object(decoded.bytes);
        const source={id,operation_id:operation.operation_id,method:'GET',url:url.href,response_url:target.href,
          status:response.status,headers:response.headers,omitted_headers:response.omitted_headers,body,
          wire_body:response.wire_body,redirects:current.hops.slice(0,-1),acquired_at:response.completed_at,number_encoding:'json-number-lexeme-string'};
        current.source=source;current.completed_at=NOW();
        if(response.status<200||response.status>=300) {
          row.source=source;row.state='ATTENTION';row.active=null;save(name,row);
          if(response.status===401)token=null;
          throw new EconDataAttention('Original EconData GET returned HTTP '+response.status,{source,retry:exists('provider.json')?readJSON('provider.json'):null});
        }
        const parsed=parseEconDataJSON(decoded.raw_text);
        source.number_lexemes=parsed.number_lexemes;
        source.type_tags=parsed.type_tags;
        row.source=source;row.state='COMPLETE';row.active=null;save(name,row);
        return {source,raw_text:decoded.raw_text,...parsed};
      }
      throw new Error('Original redirect chain exceeds six hops');
    } catch(error) {
      if(row.state!=='COMPLETE') {row.state='ATTENTION';row.last_error={name:error.name,message:error.message,at:NOW()};row.active=null;save(name,row);}
      throw error;
    }
  }
  function readSource(id) {
    if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Use the original source ID');
    const row=readJSON('sources/'+id+'.json');
    if(row.state!=='COMPLETE')throw new EconDataAttention('Original source is not complete',{source_id:id,state:row.state});
    const source=row.source,bytes=bodyRead(source.body);
    const raw_text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {source,raw_text,...parseEconDataJSON(raw_text)};
  }
  function operationName(id) {return 'operations/'+digest(text(id,'operation ID'))+'.json';}
  function saveOperation(op) {op.updated_at=NOW();save(operationName(op.operation_id),op);}
  function openOperation(id,kind,selection) {
    const name=operationName(id),intent={kind,selection:clone(selection),base_url:base.href};
    if(exists(name)) {
      const op=readJSON(name);
      if(canonical(op.intent)!==canonical(intent))throw new Error('Original operation ID is bound to a different source selection');
      return op;
    }
    const op={schema:'tjl.econdata.operation.v1',operation_id:id,intent,state:'PREPARED',source_ids:[],created_at:NOW()};
    saveOperation(op);return op;
  }
  function sources(op) {return op.source_ids.map(id=>{const row=readJSON('sources/'+id+'.json');return row.source||{id,url:row.url,method:'GET',state:row.state};});}
  async function operate(id,kind,selection,fn) {
    return exclusive(async()=>{
      const op=openOperation(id,kind,selection);
      if(op.state==='COMPLETE') {for(const source of sources(op))bodyRead(source.body);return clone(op.result);}
      op.state='RUNNING';saveOperation(op);
      try {
        const result=await fn(op);
        op.state='COMPLETE';op.result=result;op.completed_at=NOW();delete op.error;saveOperation(op);return clone(result);
      } catch(error) {
        op.state='ATTENTION';op.error={name:error.name,message:error.message,detail:error.detail||null,at:NOW()};saveOperation(op);
        const attention=new EconDataAttention(error.message,{operation_id:id,state:op.state,error:op.error,source_ids:op.source_ids});
        attention.cause=error;throw attention;
      }
    });
  }
  function inspect(id) {
    const op=readJSON(operationName(id));
    for(const source of sources(op))if(source.body)bodyRead(source.body);
    return op.state==='COMPLETE'?clone(op.result):{schema:'tjl.econdata.operation-inspection.v1',operation_id:id,state:op.state,selection:op.intent.selection,kind:op.intent.kind,source_ids:op.source_ids,sources:sources(op),error:op.error||null,progress:op.progress||null,frozen:op.frozen||null};
  }
  async function pages(op,request,consumer) {
    let url=nativeURL(base,request);const first=new URL(url),seen=new Set();
    const frozen=Array.from(first.searchParams).filter(([k])=>!['offset','limit'].includes(k));
    let index=0;
    while(url) {
      if(seen.has(url.href))throw new Error('Native next-page cycle');
      seen.add(url.href);
      const received=await get(op,url.href);
      await consumer(received,index++);
      const next=nextLink(received.source.headers.link,received.source.response_url);
      if(next) {
        if(next.origin!==first.origin||next.pathname!==first.pathname)throw new Error('Native next page changes original source endpoint');
        const allowed=new Set([...first.searchParams.keys(),'offset','limit']);
        for(const [key]of next.searchParams)if(!allowed.has(key))throw new Error('Native next page introduces a new selection: '+key);
        for(const [key,value]of frozen) {
          const all=next.searchParams.getAll(key);
          if(all.length!==1||all[0]!==value)throw new Error('Native next page changes frozen '+key);
        }
        for(const key of ['offset','limit'])if(next.searchParams.has(key)&&(!/^\d+$/.test(next.searchParams.get(key))||next.searchParams.getAll(key).length!==1))throw new Error('Invalid native page cursor');
      }
      url=next;op.progress={source_id:received.source.id,pages:index,next_url:url?.href||null};saveOperation(op);
    }
  }
  function addStructures(target,data,origins=null,sourceId=null) {
    if(!data.structures)return;
    if(!plain(data.structures))throw new Error('Native structures container is invalid');
    for(const [kind,rows]of Object.entries(data.structures)) {
      if(!Array.isArray(rows))throw new Error('Native structure collection is not an array: '+kind);
      target[kind] ||= [];
      for(let rowIndex=0;rowIndex<rows.length;rowIndex++) {
        const row=rows[rowIndex];
        if(!plain(row))throw new Error('Native structure member is invalid');
        const key=nativeReference(row),existing=target[kind].find(x=>nativeReference(x)===key);
        if(existing && canonical(existing)!==canonical(row)) {
          // Full reference representations may replace an earlier declared stub.
          const a=Object.keys(existing),b=Object.keys(row);
          if(a.every(k=>Object.hasOwn(row,k)&&canonical(existing[k])===canonical(row[k]))) {
            target[kind][target[kind].indexOf(existing)]=clone(row);
            if(origins&&sourceId)origins[kind+'/'+key]={source_id:sourceId,pointer:'/structures/'+pointer(kind)+'/'+rowIndex};
          }
          else if(!b.every(k=>Object.hasOwn(existing,k)&&canonical(row[k])===canonical(existing[k])))throw new Error('Contradictory native structure editions: '+kind+'/'+key);
        } else if(!existing) {
          target[kind].push(clone(row));
          if(origins&&sourceId)origins[kind+'/'+key]={source_id:sourceId,pointer:'/structures/'+pointer(kind)+'/'+rowIndex};
        } else if(origins&&sourceId&&!origins[kind+'/'+key]) origins[kind+'/'+key]={source_id:sourceId,pointer:'/structures/'+pointer(kind)+'/'+rowIndex};
      }
    }
  }
  async function registry(id,selection) {
    exactKeys(selection,['kind','agencyids','ids','versions','detail','relations'],'registry selection');
    if(!['datasets','dataflows','datastructures','codelists'].includes(selection.kind))throw new Error('Unsupported registry kind');
    return operate(id,'registry',selection,async op=>{
      const query={};
      for(const k of ['agencyids','ids','versions','detail','relations'])if(selection[k]!==undefined&&!(selection.kind==='datasets'&&k==='detail'))query[k]=selection[k];
      if(selection.kind!=='datasets')query.detail ||= 'full';
      query.relations ||= 'references';
      const records=[],structures={};
      await pages(op,{resource:selection.kind,query},received=>{for(const record of collection(received.data,selection.kind))records.push(record);addStructures(structures,received.data);});
      return {schema:'tjl.econdata.registry.v1',state:'COMPLETE',operation_id:id,selection:clone(selection),records,structures,sources:sources(op),acquired_at:NOW(),number_encoding:'json-number-lexeme-string'};
    });
  }
  async function read(id,request) {
    nativeURL(base,request);
    return operate(id,'read',request,async op=>{
      const responses=[];
      await pages(op,request,received=>responses.push({source_id:received.source.id,data:received.data,number_lexemes:received.number_lexemes,type_tags:received.type_tags}));
      return {schema:'tjl.econdata.read.v1',state:'COMPLETE',operation_id:id,request:clone(request),responses,sources:sources(op),acquired_at:NOW(),number_encoding:'json-number-lexeme-string'};
    });
  }

  function mergeDataset(target,native,received,page,selectorIndex,seriesSources) {
    if(!plain(native))throw new Error('Native dataset is invalid');
    const ref=nativeReference(native);
    let dataset=target.find(x=>nativeReference(x)===ref);
    const meta=Object.fromEntries(Object.entries(native).filter(([key])=>key!=='series'));
    if(!dataset){dataset={...clone(meta),series:[]};target.push(dataset);}
    else {
      for(const [key,value]of Object.entries(meta)) {
        if(key in dataset && canonical(dataset[key])!==canonical(value))throw new Error('Contradictory dataset metadata across the retained pages: '+key);
        dataset[key]=clone(value);
      }
    }
    if(!Array.isArray(native.series))throw new Error('A full native dataset page has no series array');
    for(let index=0;index<native.series.length;index++) {
      const item=native.series[index];
      if(!plain(item)||!Object.hasOwn(item,'series-key')||!Array.isArray(item.obs))throw new Error('Native series requires its original series-key and obs array');
      const key=canonical(item['series-key']),meta=Object.fromEntries(Object.entries(item).filter(([k])=>k!=='obs'));
      let merged=dataset.series.find(x=>canonical(x['series-key'])===key);
      if(!merged){merged={...clone(meta),obs:[]};dataset.series.push(merged);}
      else if(canonical(Object.fromEntries(Object.entries(merged).filter(([k])=>k!=='obs')))!==canonical(meta))throw new Error('Contradictory series metadata across retained pages');
      const offset=merged.obs.length;for(const observation of item.obs)merged.obs.push(clone(observation));
      seriesSources.push({dataset_ref:ref,series_key:clone(item['series-key']),source_id:received.source.id,page,
        page_series_index:index,selector_index:selectorIndex,observation_offset:offset,observation_count:item.obs.length});
    }
  }
  async function metadata(op,datasets,structures,origins) {
    const joins=[];
    async function getStructure(resource,reference,requiredField) {
      const ref=nativeReference(reference),key=COLLECTION[resource];
      let row=structures[key]?.find(x=>nativeReference(x)===ref);
      if(!row || (requiredField && !Object.hasOwn(row,requiredField))) {
        await pages(op,{resource,ref,query:{detail:'full',relations:'references'}},received=>addStructures(structures,received.data,origins,received.source.id));
        row=structures[key]?.find(x=>nativeReference(x)===ref);
      }
      if(!row || (requiredField&&!Object.hasOwn(row,requiredField)))throw new Error('Complete native metadata reference was not returned: '+resource+'/'+ref);
      return row;
    }
    for(const dataset of datasets) {
      const agreement=await getStructure('provisionagreements',dataset['provision-agreement'],'dataflow');
      const flow=await getStructure('dataflows',agreement.dataflow,'data-structure');
      const structure=await getStructure('datastructures',flow['data-structure'],'components');
      if(!Array.isArray(structure.components))throw new Error('Native DSD has no components array');
      const components=[];
      const structureOrigin=origins['data-structures/'+nativeReference(structure)];
      const structureSource=structureOrigin?readSource(structureOrigin.source_id):null;
      for(let componentIndex=0;componentIndex<structure.components.length;componentIndex++) {
        const component=structure.components[componentIndex];
        const componentPointer=structureOrigin?structureOrigin.pointer+'/components/'+componentIndex:null;
        const nativeType=componentPointer?structureSource.type_tags[componentPointer]??null:null;
        const identity=component?.['concept-identity'];
        if(!plain(identity))throw new Error('Native component lacks concept identity');
        const schemeRef={agencyid:identity.agencyid,id:identity.parentid,version:identity.parentversion};
        const scheme=await getStructure('conceptschemes',schemeRef,'concepts');
        if(!Array.isArray(scheme.concepts))throw new Error('Native concept scheme has no concepts array');
        const concept=scheme.concepts.find(x=>x.id===identity.id);
        if(!concept)throw new Error('Native concept identity was not found in its complete scheme');
        let codelist=null;
        if(plain(component['local-representation'])) codelist=await getStructure('codelists',component['local-representation'],'codes');
        components.push({component:clone(component),native_type:nativeType,source_id:structureOrigin?.source_id??null,source_pointer:componentPointer,concept:clone(concept),concept_scheme_ref:nativeReference(schemeRef),
          codelist_ref:codelist?nativeReference(codelist):null});
      }
      joins.push({dataset_ref:nativeReference(dataset),provision_agreement_ref:nativeReference(agreement),
        data_provider:clone(agreement['data-provider']??null),dataflow_ref:nativeReference(flow),
        data_structure_ref:nativeReference(structure),components});
    }
    return joins;
  }
  async function capture(id,selection) {
    exactKeys(selection,['dataset','release','series_keys','start','end','hist_obs'],'capture selection');
    exactKeys(selection.dataset,['agencyid','id','version'],'dataset selection');nativeReference(selection.dataset);
    exactKeys(selection.release,['kind','value'],'release selection');
    if(!['latest','timestamp','description','unreleased'].includes(selection.release.kind))throw new Error('Select the original release mode');
    if(['description','timestamp'].includes(selection.release.kind))text(selection.release.value,'release value');
    else if(selection.release.value!==undefined)throw new Error('This release choice has no value');
    if(selection.hist_obs!==undefined&&typeof selection.hist_obs!=='boolean')throw new Error('hist_obs must be a native boolean');
    for(const key of ['start','end'])if(selection[key]!==undefined)text(selection[key],key);
    if(selection.series_keys!==undefined&&!Array.isArray(selection.series_keys))throw new Error('Use a native series filter array');
    const selectors=selection.series_keys?.length?selection.series_keys:[null];
    const seenSelectors=new Set();
    for(const key of selectors) {
      if(key!==null)text(key,'native series-key query');
      const hash=canonical(key);if(seenSelectors.has(hash))throw new Error('Duplicate explicit series selector');seenSelectors.add(hash);
    }
    return operate(id,'capture',selection,async op=>{
      const structures={},structure_sources={};
      if(!op.frozen) {
        const catalogue=[];
        await pages(op,{resource:'datasets',query:{agencyids:selection.dataset.agencyid,ids:selection.dataset.id,versions:selection.dataset.version,relations:'references'}},received=>{
          for(const row of collection(received.data,'datasets'))catalogue.push(row);addStructures(structures,received.data,structure_sources,received.source.id);
        });
        const candidates=catalogue.filter(x=>x.agencyid===selection.dataset.agencyid&&x.id===selection.dataset.id
          &&(selection.dataset.version==='latest'||x.version===selection.dataset.version));
        if(candidates.length!==1)throw new Error('Native dataset selection must resolve to one exact agency/id/version');
        const dataset=candidates[0],dataset_ref=nativeReference(dataset);
        let release;
        if(selection.release.kind==='unreleased')release={kind:'unreleased',query:null,mutable:true};
        else if(selection.release.kind==='timestamp')release={kind:'timestamp',value:selection.release.value,query:releaseQuery(selection.release.value),timezone:'Africa/Johannesburg'};
        else {
          const released=await get(op,nativeURL(base,{resource:'datasets',ref:dataset_ref,section:'release'}).href);
          const values=released.data.releases;
          if(!Array.isArray(values))throw new Error('Native release catalogue is absent');
          const selected=selection.release.kind==='latest'?values[0]:values.find(x=>x.description===selection.release.value);
          if(!plain(selected)||typeof selected.release!=='string')throw new Error('The selected original release was not returned');
          release={kind:selection.release.kind,value:clone(selected),query:releaseQuery(selected.release,true),timezone:'Africa/Johannesburg',source_id:released.source.id};
        }
        op.frozen={dataset:clone(dataset),dataset_ref,release};saveOperation(op);
      }
      // Reconstruct metadata from every previously retained original source.
      for(const sourceId of op.source_ids) {
        const row=readJSON('sources/'+sourceId+'.json');if(row.state==='COMPLETE')addStructures(structures,readSource(sourceId).data,structure_sources,sourceId);
      }
      const datasets=[],series_sources=[];
      for(let i=0;i<selectors.length;i++) {
        const query={detail:'full',relations:'references'};
        if(op.frozen.release.query!==null)query.release=op.frozen.release.query;
        if(selectors[i]!==null)query['series-key']=selectors[i];
        if(selection.start!==undefined)query.start=selection.start;
        if(selection.end!==undefined)query.end=selection.end;
        if(selection.hist_obs!==undefined)query['hist-obs']=selection.hist_obs;
        await pages(op,{resource:'datasets',ref:op.frozen.dataset_ref,query},(received,page)=>{
          addStructures(structures,received.data,structure_sources,received.source.id);
          for(const native of collection(received.data,'datasets')) {
            if(nativeReference(native)!==op.frozen.dataset_ref)throw new Error('Native response changed the frozen dataset identity');
            mergeDataset(datasets,native,received,page,i,series_sources);
          }
        });
      }
      if(datasets.length!==1)throw new Error('Full native capture did not return its selected dataset');
      const metadata_joins=await metadata(op,datasets,structures,structure_sources);
      return {schema:'tjl.econdata.capture.v1',operation_id:id,state:'COMPLETE',selection:clone(selection),
        dataset_ref:op.frozen.dataset_ref,release:clone(op.frozen.release),datasets,structures,structure_sources,metadata_joins,
        series_sources,sources:sources(op),acquired_at:NOW(),number_encoding:'json-number-lexeme-string'};
    });
  }
  function exportState() {
    return exclusive(async()=>{
      const files=[];
      function walk(name) {
        const full=locate(name);
        if(!fs.existsSync(full))return;
        const stat=fs.lstatSync(full);
        if(stat.isSymbolicLink())throw new Error('Retained export member is a link');
        if(stat.isDirectory())for(const member of fs.readdirSync(full).sort())walk(name+'/'+member);
        else if(stat.isFile()&&!name.endsWith('.part')) {
          const bytes=fs.readFileSync(full);
          files.push({path:name,bytes:bytes.length,sha256:digest(bytes),content_base64:bytes.toString('base64')});
        } else if(!stat.isFile())throw new Error('Retained export member is not a regular file');
      }
      for(const root of ['operations','sources','objects','attempts'])walk(root);
      if(exists('provider.json'))walk('provider.json');
      if(exists('authority.json'))walk('authority.json');
      const manifest=files.map(({path,bytes,sha256})=>({path,bytes,sha256}));
      return {schema:'tjl.econdata.source-state.v1',base_url:base.href,auth_url:auth.href,
        credential_env_names:{credentialEnv,credentialsEnv},files,manifest_sha256:digest(canonical(manifest)),exported_at:NOW()};
    });
  }
  function importState(packet) {
    return exclusive(async()=>{
      if(!plain(packet)||packet.schema!=='tjl.econdata.source-state.v1'||packet.base_url!==base.href||!Array.isArray(packet.files))throw new Error('Select the complete original source-state packet for this API');
      const names=new Set(),validated=[];let total=0;
      if(packet.files.length>100000)throw new Error('Source-state member count exceeds limit');
      for(const file of packet.files) {
        relative(file.path);
        if(names.has(file.path)||(!/^(operations|sources|objects|attempts)\//.test(file.path)&&!['provider.json','authority.json'].includes(file.path)))throw new Error('Invalid or duplicate retained source member');
        names.add(file.path);
        if(typeof file.content_base64!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content_base64))throw new Error('Invalid complete source base64');
        const bytes=Buffer.from(file.content_base64,'base64');total+=bytes.length;
        if(total>1024*1024*1024||bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw new Error('Retained source member differs or exceeds total receiving bound');
        if(exists(file.path)&&file.path!=='authority.json') {const actual=identity(file.path);if(actual.bytes!==file.bytes||actual.sha256!==file.sha256)throw new Error('Receiving source conflicts with an existing original member');}
        validated.push({file,bytes});
      }
      const manifest=packet.files.map(({path,bytes,sha256})=>({path,bytes,sha256}));
      if(digest(canonical(manifest))!==packet.manifest_sha256)throw new Error('Complete source manifest differs');
      // Validate the original logical identities before touching receiving files.
      const byName=new Map(validated.map(({file,bytes})=>[file.path,bytes]));
      for(const {file,bytes}of validated) {
        if(file.path==='authority.json') {
          const declared=JSON.parse(bytes.toString('utf8'));
          if(declared.schema!=='tjl.econdata.authority.v1'||declared.base_url!==base.href)throw new Error('Imported source authority differs');
        }
        if(file.path.startsWith('sources/')||file.path.startsWith('operations/')) {
          const value=JSON.parse(bytes.toString('utf8'));
          if(file.path.startsWith('sources/')) {
            if(file.path!=='sources/'+value.id+'.json'||value.method!=='GET')throw new Error('Invalid original source identity');
            const sourceURL=safeHttps(value.url,'Imported native GET');
            if(sourceURL.origin!==base.origin||!sourceURL.pathname.startsWith(base.pathname.replace(/\/$/,'')+'/'))throw new Error('Imported source changed API authority');
            if(value.source?.body) {
              const body=value.source.body,original=byName.get(body.path);
              if(!original||original.length!==body.bytes||digest(original)!==body.sha256)throw new Error('Complete original response object is absent');
            }
          } else if(file.path!==operationName(value.operation_id)||value.intent?.base_url!==base.href)throw new Error('Invalid original operation identity');
        }
      }
      for(const {file,bytes}of validated)if(!exists(file.path)||file.path==='authority.json')atomic(file.path,bytes);
      return {schema:'tjl.econdata.source-receive.v1',state:'COMPLETE',files:validated.length,bytes:total,manifest_sha256:packet.manifest_sha256,
        credential_env_names:{credentialEnv,credentialsEnv},received_at:NOW()};
    });
  }
  return Object.freeze({registry,read,capture,inspect,readSource,exportState,importState});
}
