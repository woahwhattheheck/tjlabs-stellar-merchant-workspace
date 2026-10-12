// MIT. Typed host client for the original captured merchant handover workspace.
import {
  Sf61WorkspaceClient, readSf61Response, sf61Hash, sf61Failure,
  sf61Plain, sf61Exact,
} from '../../stellar-forge/mcp-merchant-operator/sf61-connection.mjs';
import { HASH, absolute } from './handover-files.mjs';
import { openCapturedHandoverArchive, readHandoverRange } from './handover-archive.mjs';
import {
  CAPTURED_HANDOVER_UPLOAD_CHUNK_BYTES,
  initializeCapturedHandoverUpload, inspectCapturedHandoverUpload,
  appendCapturedHandoverUpload, finishCapturedHandoverUpload,
} from './handover-upload.mjs';

const PREFIX='/api/captured-handover/';
const INFO_SCHEMA='stellar-forge.captured-handover-browser.v1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_JSON_REQUEST=1024*1024,MAX_JSON_RESPONSE=16*1024*1024;
const CHUNK=CAPTURED_HANDOVER_UPLOAD_CHUNK_BYTES;
const PINNED_URL='CAPTURED_HANDOVER_PINNED_CONSOLE_URL';
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
const fail=(code,message)=>{throw sf61Failure(code,message);};
const need=(value,code,message)=>{if(!value)fail(code,message);};
const copy=value=>structuredClone(value);
function uuid(value) {
  need(UUID.test(value??''),'INVALID_PARAMS','Use the original retained upload or job UUID.');
  return value;
}
function count(value,minimum=0) {
  need(Number.isSafeInteger(value)&&value>=minimum,'INVALID_PARAMS','Use an exact original nonnegative byte count.');
  return value;
}
function hash(value) {
  need(HASH.test(value??''),'INVALID_PARAMS','Use the complete original SHA-256.');
  return value;
}
function requestOptions(value={}) {
  sf61Exact(value,['signal','timeoutMs']);
  if(value.signal!==undefined)need(value.signal instanceof AbortSignal,'INVALID_PARAMS','Use the original AbortSignal.');
  if(value.timeoutMs!==undefined)need(Number.isSafeInteger(value.timeoutMs)&&value.timeoutMs>0&&value.timeoutMs<=2147483647,
    'INVALID_PARAMS','Use a positive request timeout in milliseconds.');
  return {...(value.signal===undefined?{}:{signal:value.signal}),...(value.timeoutMs===undefined?{}:{timeoutMs:value.timeoutMs})};
}
function interrupted(options) {
  if(options.signal?.aborted)fail('SF61_CAPTURED_HANDOVER_ABORTED',
    'The transfer stopped. Continue the same original upload or download identifier.');
}
function route(path) {
  need(typeof path==='string'&&path.length<=16384&&!/[\x00-\x20#]/.test(path),
    'INVALID_PARAMS','Choose a relative native handover API route.');
  const suffix=path.startsWith('/')?path.slice(1):path,name=suffix.split('?')[0];
  need(/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/.test(name),
    'INVALID_PARAMS','Choose a relative native handover API route.');
  return PREFIX+suffix;
}
const query=(path,fields)=>path+'?'+new URLSearchParams(Object.entries(fields).map(([key,value])=>[key,String(value)]));
function selection(value) {
  sf61Exact(value,['id','expectedSha256','expectedBytes'],['id','expectedSha256','expectedBytes']);
  return {id:uuid(value.id),expectedSha256:hash(value.expectedSha256),expectedBytes:count(value.expectedBytes,1)};
}
function identity(info) {
  return {productId:info.productId,product:info.product,directory:info.directory,projectsDirectory:info.projectsDirectory};
}
function checkedInfo(value,projectsDirectory,expectedProductId) {
  need(sf61Plain(value)&&value.schema===INFO_SCHEMA&&HASH.test(value.productId??'')&&
    typeof value.product==='string'&&value.product.trim()&&value.product.length<=160&&
    value.directory===absolute(value.directory)&&value.projectsDirectory===projectsDirectory&&
    ['OPEN','DRAINING'].includes(value.state)&&Array.isArray(value.activeJobs)&&value.activeJobs.every(id=>UUID.test(id)),
    'SF61_CAPTURED_HANDOVER_IDENTITY','Open the original captured product and its declared API projects.');
  if(expectedProductId!==undefined)need(value.productId===expectedProductId,
    'SF61_CAPTURED_HANDOVER_IDENTITY','The selected original captured product changed.');
  need(value.state==='OPEN','SF61_CAPTURED_HANDOVER_STOPPING','The original product is finishing accepted operations.');
  return Object.freeze({schema:value.schema,product:value.product,productId:value.productId,directory:value.directory,
    projectsDirectory:value.projectsDirectory,state:value.state,activeJobs:Object.freeze([...value.activeJobs])});
}
async function cancel(response) {try{await response.body?.cancel();}catch{}}
function responseIdentity(response,productId) {
  need(response.headers.get('x-captured-product-id')===productId,'SF61_CAPTURED_HANDOVER_IDENTITY',
    'The response belongs to a different captured product. Reopen the original configured workspace.');
}
async function jsonResponse(response,productId,method) {
  try {
    if(productId!==undefined)responseIdentity(response,productId);
    return JSON.parse(decode(await readSf61Response(response,MAX_JSON_RESPONSE)));
  } catch(error) {
    await cancel(response);
    if(method==='POST'&&error&&typeof error==='object')error.outcomeUnknown=true;
    throw error;
  }
}
function uploadStatus(value,metadata) {
  need(sf61Plain(value)&&value.id===metadata.id&&value.name===metadata.name&&
    value.totalBytes===metadata.bytes&&Number.isSafeInteger(value.receivedBytes)&&
    value.receivedBytes>=0&&value.receivedBytes<=metadata.bytes&&value.chunkBytes===CHUNK&&
    ['UPLOADING','READY_TO_FINISH','COMPLETE'].includes(value.state),
    'SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED','The original receiving upload identity or byte count changed.');
  if(value.pendingChunk!==undefined) {
    const p=value.pendingChunk;
    need(sf61Plain(p)&&Number.isSafeInteger(p.offset)&&p.offset>=0&&Number.isSafeInteger(p.bytes)&&p.bytes>0&&
      p.bytes<=CHUNK&&Number.isSafeInteger(p.offset+p.bytes)&&p.offset+p.bytes<=metadata.bytes&&
      p.offset<=value.receivedBytes&&value.receivedBytes<=p.offset+p.bytes&&HASH.test(p.sha256??'')&&
      value.state!=='COMPLETE',
      'SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED','Resume the exact original retained pending chunk.');
  }
  if(value.state==='COMPLETE')need(value.receivedBytes===metadata.bytes&&value.sha256===metadata.expectedSha256&&
    typeof value.path==='string'&&value.path===absolute(value.path),
    'SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED','The finished original upload has another complete file identity.');
  if(value.state==='READY_TO_FINISH')need(value.receivedBytes===metadata.bytes,
    'SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED','The receiving file has not reached its complete original length.');
  return value;
}
/** Every retry reopens the same immutable upload metadata before reading its retained prefix. */
async function pumpUpload(adapter,metadata,read,options) {
  interrupted(options);
  uploadStatus(await adapter.initialize(metadata),metadata);
  let current=uploadStatus(await adapter.inspect(metadata.id),metadata);
  while(current.state!=='COMPLETE'&&current.receivedBytes<metadata.bytes) {
    interrupted(options);
    const pending=current.pendingChunk;
    const offset=pending?.offset??current.receivedBytes;
    const length=pending?.bytes??Math.min(CHUNK,metadata.bytes-offset);
    const body=await read(offset,length);
    need(Buffer.isBuffer(body)&&body.length===length,'SF61_CAPTURED_HANDOVER_SOURCE_CHANGED',
      'The selected original file returned another byte range.');
    interrupted(options);
    const sha256=sf61Hash(body);
    if(pending)need(sha256===pending.sha256,'SF61_CAPTURED_HANDOVER_SOURCE_CHANGED',
      'The selected source differs from the original interrupted upload chunk.');
    const next=uploadStatus(await adapter.append({id:metadata.id,offset,bytes:body,sha256}),metadata);
    need(next.receivedBytes>=current.receivedBytes&&next.receivedBytes>=offset+length,
      'SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED','The original upload did not retain this complete chunk.');
    need(next.receivedBytes>current.receivedBytes||next.state==='COMPLETE'||
      pending&&!next.pendingChunk,'SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED','The original upload did not advance.');
    current=next;
  }
  interrupted(options);
  const complete=uploadStatus(await adapter.finish(metadata.id),metadata);
  need(complete.state==='COMPLETE','SF61_CAPTURED_HANDOVER_UPLOAD_CHANGED',
    'Reopen the original upload and finish its complete retained file.');
  return copy(complete);
}
class CapturedHandoverClient {
  #transport; #info; #pending=new Set(); #handles=new Set(); #stopping=false; #closing;
  constructor(transport,info) {this.#transport=transport;this.#info=info;}
  get info() {return this.#info;}
  #begin() {
    if(this.#stopping)fail('SF61_CAPTURED_HANDOVER_CLOSED','This client is finishing its accepted work. Open a new pinned client.');
    let finish;
    const pending=new Promise(resolve=>{finish=resolve;});
    this.#pending.add(pending);
    return ()=>{this.#pending.delete(pending);finish();};
  }
  #work(work) {
    const finish=this.#begin();
    return Promise.resolve().then(work).finally(finish);
  }
  async #json(path,body,options={}) {
    options=requestOptions(options);interrupted(options);
    const text=body===undefined?undefined:JSON.stringify(body),method=body===undefined?'GET':'POST';
    if(body!==undefined)need(typeof text==='string'&&Buffer.byteLength(text)<=MAX_JSON_REQUEST,
      'INVALID_PARAMS','Send a complete native handover request of at most 1 MiB.');
    return this.#transport.request(route(path),{...options,method,body:text,
      headers:{'x-captured-product-id':this.#info.productId,...(text===undefined?{}:{'Content-Type':'application/json'})}},
      response=>jsonResponse(response,this.#info.productId,method));
  }
  json(path,body,options={}) {
    route(path);const input=body===undefined?undefined:JSON.parse(JSON.stringify(body)),settings=requestOptions(options);
    return this.#work(()=>this.#json(path,input,settings));
  }
  async #archive(value,options) {
    const selected=selection(value);
    const job=await this.#json(query('job',{id:selected.id}),undefined,options),saved=job?.result?.archive;
    need(job?.id===selected.id&&job.command==='PUBLISH'&&job.state==='COMPLETE'&&sf61Plain(saved)&&
      saved.bytes===selected.expectedBytes&&saved.sha256===selected.expectedSha256&&
      HASH.test(job.result.handoverId??'')&&HASH.test(job.result.manifestSha256??'')&&
      saved.handoverId===job.result.handoverId&&saved.manifestSha256===job.result.manifestSha256,
      'SF61_CAPTURED_HANDOVER_ARCHIVE_CHANGED','Choose the exact complete published handover and its original archive SHA-256 and length.');
    return Object.freeze({id:selected.id,handoverId:job.result.handoverId,manifestSha256:job.result.manifestSha256,
      bytes:saved.bytes,sha256:saved.sha256,name:'captured-'+job.result.handoverId+'.sfhandover'});
  }
  archive(value,options={}) {
    const selected=selection(value),settings=requestOptions(options);
    return this.#work(()=>this.#archive(selected,settings));
  }
  async #range(archive,offset,limit,options) {
    count(offset);count(limit,1);
    need(limit<=CHUNK&&offset<archive.bytes,'INVALID_PARAMS','Select one original file range of at most 1 MiB.');
    interrupted(options);
    const end=offset+Math.min(limit,archive.bytes-offset)-1,length=end-offset+1;
    const path=query('archive',{id:archive.id,sha256:archive.sha256,bytes:archive.bytes});
    return this.#transport.request(route(path),{...options,headers:{
      'x-captured-product-id':this.#info.productId,Range:'bytes='+offset+'-'+end,'If-Range':'"'+archive.sha256+'"',
    }},async response=>{
      try {
        responseIdentity(response,this.#info.productId);
        need(response.status===206&&response.headers.get('content-range')==='bytes '+offset+'-'+end+'/'+archive.bytes&&
          response.headers.get('etag')==='"'+archive.sha256+'"'&&response.headers.get('content-length')===String(length)&&
          response.headers.get('accept-ranges')==='bytes'&&
          response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()==='application/octet-stream',
          'SF61_CAPTURED_HANDOVER_RANGE_CHANGED','The original archive response does not match the selected exact byte range.');
        const body=await readSf61Response(response,length);
        need(body.length===length,'SF61_CAPTURED_HANDOVER_RANGE_CHANGED','The original archive range ended before its declared length.');
        return body;
      }catch(error){await cancel(response);throw error;}
    });
  }
  readArchive(value,options={}) {
    sf61Exact(value,['id','expectedSha256','expectedBytes','offset','limit'],['id','expectedSha256','expectedBytes','offset','limit']);
    const selected=selection({id:value.id,expectedSha256:value.expectedSha256,expectedBytes:value.expectedBytes}),
      offset=count(value.offset),limit=count(value.limit,1),settings=requestOptions(options);
    return this.#work(async()=>{
      const archive=await this.#archive(selected,settings);
      return this.#range(archive,offset,limit,settings);
    });
  }
  #remoteUpload(options) {
    return {
      initialize:metadata=>this.#json('uploads/init',metadata,options),
      inspect:id=>this.#json(query('uploads/status',{id}),undefined,options),
      append:({id,offset,bytes,sha256})=>this.#transport.request(route(query('uploads/chunk',{id,offset,sha256})),
        {...options,method:'POST',body:bytes,headers:{
          'x-captured-product-id':this.#info.productId,'Content-Type':'application/octet-stream',
        }},response=>jsonResponse(response,this.#info.productId,'POST')),
      finish:id=>this.#json('uploads/finish',{id},options),
    };
  }
  transferTo(target,value,options={}) {
    need(target instanceof CapturedHandoverClient,'INVALID_PARAMS','Select another original pinned captured handover client.');
    sf61Exact(value,['id','expectedSha256','expectedBytes','uploadId'],['id','expectedSha256','expectedBytes','uploadId']);
    const selected=selection({id:value.id,expectedSha256:value.expectedSha256,expectedBytes:value.expectedBytes}),
      uploadId=uuid(value.uploadId),settings=requestOptions(options);
    // Both clients accept the whole transfer synchronously. Stop may then drain
    // all of its internal reads/writes without refusing a later accepted chunk.
    const releaseSource=this.#begin();let releaseTarget;
    try{if(target!==this)releaseTarget=target.#begin();}
    catch(error){releaseSource();throw error;}
    return Promise.resolve().then(async()=>{
      const archive=await this.#archive(selected,settings);
      const upload=await pumpUpload(target.#remoteUpload(settings),
        {id:uploadId,name:archive.name,bytes:archive.bytes,expectedSha256:archive.sha256},
        (offset,length)=>this.#range(archive,offset,length,settings),settings);
      return {source:{...identity(this.#info),archive},destination:{...identity(target.#info),upload}};
    }).finally(()=>{releaseTarget?.();releaseSource();});
  }
  async #withFile(held,work) {
    this.#handles.add(held);
    let result,failed=false,originalError;
    try{result=await work(held);}catch(error){failed=true;originalError=error;}
    try{await held.close();this.#handles.delete(held);}
    catch(error){
      const issue=new AggregateError(failed?[originalError,error]:[error],
        'The original file handle is still owned by this client. Retry close() on this same client.');
      issue.code='SF61_CAPTURED_HANDOVER_CLOSE_PENDING';
      if(originalError?.outcomeUnknown)issue.outcomeUnknown=true;
      issue.close=()=>this.close();throw issue;
    }
    if(failed)throw originalError;
    return result;
  }
  uploadFile(value,options={}) {
    sf61Exact(value,['path','expectedSha256','expectedBytes','uploadId'],['path','expectedSha256','expectedBytes','uploadId']);
    const selected={path:absolute(value.path),expectedSha256:hash(value.expectedSha256),expectedBytes:count(value.expectedBytes,1)},
      uploadId=uuid(value.uploadId),settings=requestOptions(options);
    return this.#work(async()=>{
      interrupted(settings);
      const held=await openCapturedHandoverArchive(selected);
      return this.#withFile(held,async original=>{
        const source={path:original.path,bytes:original.bytes,sha256:original.sha256};
        const upload=await pumpUpload(this.#remoteUpload(settings),
          {id:uploadId,name:'captured-'+source.sha256+'.sfhandover',bytes:source.bytes,expectedSha256:source.sha256},
          async(offset,length)=>{await original.assertHeld();const result=await readHandoverRange(original,offset,length);
            await original.assertHeld();return result;},settings);
        await original.assertHeld();
        return {source,destination:{...identity(this.#info),upload}};
      });
    });
  }
  downloadFile(value,options={}) {
    sf61Exact(value,['id','expectedSha256','expectedBytes','directory','downloadId'],['id','expectedSha256','expectedBytes','directory']);
    const root=absolute(value.directory),id=uuid(value.downloadId??value.id),settings=requestOptions(options),
      selected=selection({id:value.id,expectedSha256:value.expectedSha256,expectedBytes:value.expectedBytes});
    return this.#work(async()=>{
      const archive=await this.#archive(selected,settings);
      const local={
        initialize:metadata=>initializeCapturedHandoverUpload({root,...metadata}),
        inspect:id=>inspectCapturedHandoverUpload({root,id}),
        append:chunk=>appendCapturedHandoverUpload({root,...chunk}),
        finish:id=>finishCapturedHandoverUpload({root,id}),
      };
      const download=await pumpUpload(local,{id,name:archive.name,bytes:archive.bytes,expectedSha256:archive.sha256},
        (offset,length)=>this.#range(archive,offset,length,settings),settings);
      return {source:{...identity(this.#info),archive},download};
    });
  }
  close() {
    if(this.#closing)return this.#closing;
    this.#stopping=true;
    const closing=(async()=>{
      while(this.#pending.size)await Promise.allSettled([...this.#pending]);
      const errors=[];
      for(const held of [...this.#handles]){
        try{await held.close();this.#handles.delete(held);}catch(error){errors.push(error);}
      }
      if(errors.length){
        const error=new AggregateError(errors,'The client retains original file handles. Retry close() on this same client.');
        error.code='SF61_CAPTURED_HANDOVER_CLOSE_PENDING';error.close=()=>this.close();throw error;
      }
    })();
    this.#closing=closing;
    void closing.catch(()=>{if(this.#closing===closing)this.#closing=undefined;});
    return closing;
  }
}
/** Resolve the configured native URL once; later file/env changes never redirect accepted work. */
export async function openCapturedHandoverClient(definition,{environment=process.env,expectedProductId}={}) {
  need(sf61Plain(definition)&&typeof definition.projectsDirectory==='string'&&
    definition.projectsDirectory===absolute(definition.projectsDirectory)&&
    (definition.consoleUrlFile===undefined)!==(definition.consoleUrlEnv===undefined),
    'INVALID_PARAMS','Select an original parsed HAR workspace with its projects directory and one console URL reference.');
  if(expectedProductId!==undefined)hash(expectedProductId);
  const declared={projectsDirectory:definition.projectsDirectory,...(definition.consoleUrlFile===undefined
    ?{consoleUrlEnv:definition.consoleUrlEnv}:{consoleUrlFile:definition.consoleUrlFile})};
  const selected=await new Sf61WorkspaceClient(declared,{environment:{...environment}}).connection();
  const transport=new Sf61WorkspaceClient({consoleUrlEnv:PINNED_URL},
    {environment:{[PINNED_URL]:selected.origin+'/#'+selected.token}});
  const info=await transport.request(PREFIX+'info',{headers:expectedProductId===undefined?{}:{'x-captured-product-id':expectedProductId}},
    async response=>{
      try{
        const value=checkedInfo(await jsonResponse(response,expectedProductId,'GET'),
          declared.projectsDirectory,expectedProductId);
        responseIdentity(response,value.productId);
        return value;
      }catch(error){await cancel(response);throw error;}
    });
  return new CapturedHandoverClient(transport,info);
}
