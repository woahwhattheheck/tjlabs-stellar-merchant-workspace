// MIT. Connected operations against the original live CIIM desk; no second database writer.
import {constants} from 'node:fs';
import {open,realpath,link,unlink} from 'node:fs/promises';
import {dirname,resolve,join,basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {privateDirectory,readPrivate,atomicJson,acquireWorkspace,syncDirectory} from '../../postgres/publisher/files.mjs';
import {CIIM_DESK_OPERATIONS,describeDeskOperations} from './client.mjs';
import {LIMITS,fault} from './portable.mjs';

const STARTUP='tjl.ciim.desk-startup.v1',MAX_JSON=64*1024*1024,MAX_REQUEST=16*1024*1024;
const hash=body=>createHash('sha256').update(body).digest('hex');
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const need=(value,code,message,status=400,details)=>{if(!value)throw fault(code,message,status,details);};
const has=(value,key)=>Object.hasOwn(value,key);
function absolute(path,label){
  need(typeof path==='string'&&path!=="/"&&resolve(path)===path,'CONNECTED_PATH','Use the absolute original '+label+' path.');
  return path;
}
function decode(body,label){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
  catch{throw fault('CONNECTED_JSON',label+' is not complete UTF-8 JSON.');}
}
function clean(value,label){
  let wire;
  try{wire=JSON.stringify(value);}catch{throw fault('CONNECTED_ARGUMENTS',label+' must contain JSON values.');}
  need(typeof wire==='string','CONNECTED_ARGUMENTS',label+' must contain JSON values.');
  const copy=JSON.parse(wire);
  need(isDeepStrictEqual(copy,value),'CONNECTED_ARGUMENTS',label+' must contain JSON values without implicit conversion.');
  return {value:copy,wire};
}
const errorView=error=>({code:error.code??'CONNECTED_ERROR',message:String(error.message),status:error.status??null,
  ...(error.details?{details:error.details}:{})});
const sameStat=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function optionalJson(path,maximum=MAX_JSON){
  try{return decode(await readPrivate(path,maximum),basename(path));}
  catch(error){if(error.code==='ENOENT')return null;throw error;}
}
async function exclusive(path,body){
  let file;
  try{file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
  catch(error){if(error.code!=='EEXIST')throw error;const old=await readPrivate(path,Math.max(body.length,4096));
    need(old.equals(body),'CONNECTED_ORIGINAL_CHANGED','Preserve the original retained request or file.',409);return;}
  try{await file.writeFile(body);await file.sync();}finally{await file.close();}
  await syncDirectory(dirname(path));
}
async function inspectFile(file,{maximum=LIMITS.archiveBytes}={}){
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat({bigint:true});
    need(before.isFile()&&before.size<=BigInt(maximum),'CONNECTED_FILE_LIMIT','The original regular file exceeds its supported size.',413);
    const h=createHash('sha256');let bytes=0;
    for await(const chunk of handle.createReadStream({autoClose:false})){bytes+=chunk.length;h.update(chunk);
      need(bytes<=maximum,'CONNECTED_FILE_LIMIT','The original file grew during reading.',413);}
    need(sameStat(before,await handle.stat({bigint:true}))&&BigInt(bytes)===before.size,
      'CONNECTED_FILE_CHANGED','The original file changed during reading.',409);
    return {bytes,sha256:h.digest('hex')};
  }finally{await handle.close();}
}
function parameters(input,allowed){
  need(input&&typeof input==='object'&&!Array.isArray(input),'CONNECTED_ARGUMENTS','Use one argument object.');
  const values=new URLSearchParams();
  for(const [key,value] of Object.entries(input)){
    need(allowed.includes(key)&&['string','number'].includes(typeof value)&&
      (typeof value!=='number'||Number.isSafeInteger(value)),'CONNECTED_ARGUMENTS','Use declared original operation arguments.');
    values.set(key,String(value));
  }
  return values;
}
async function responseJson(response,maximum=MAX_JSON){
  need(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'CONNECTED_RESPONSE',
    'The original listener did not return a JSON operation response.',502);
  const declared=response.headers.get('content-length');
  if(declared!==null)need(/^\d+$/.test(declared)&&Number(declared)<=maximum,'CONNECTED_RESPONSE_LIMIT','The complete response exceeds its supported size.',413);
  const parts=[];let bytes=0;
  for await(const part of response.body){bytes+=part.length;
    need(bytes<=maximum,'CONNECTED_RESPONSE_LIMIT','The complete response exceeds its supported size.',413);parts.push(part);}
  if(declared!==null)need(bytes===Number(declared),'CONNECTED_RESPONSE_INCOMPLETE','The complete original response did not arrive.',502);
  const value=decode(Buffer.concat(parts),'The original response');
  if(!response.ok){
    const problem=value?.error;
    need(problem&&typeof problem.code==='string'&&typeof problem.message==='string','CONNECTED_RESPONSE',
      'The original listener returned an unrecognized error response.',502);
    const error=fault(problem.code,problem.message,response.status,problem.details);
    error.connectedHttpStatus=response.status;error.connectedServerResponse=true;throw error;
  }
  return value;
}
function privateSummary(value){
  return {workspace:value.workspace,workspaceId:value.workspaceId,markerSha256:value.markerSha256,
    connectionFile:value.connectionFile,origin:new URL(value.url).origin,pid:value.pid};
}

async function retainedConnectedRequest(operations,pending){
  need(pending?.schema==='tjl.ciim.connected-pending.v1'&&hex(pending.key)&&typeof pending.operationId==='string'&&
    pending.key===hash(pending.operationId),'CONNECTED_PENDING_CHANGED','The original pending request record is invalid.',409);
  const directory=join(operations,pending.key);
  await privateDirectory(directory);
  const meta=await optionalJson(join(directory,'identity.json'),65536);
  const body=await readPrivate(join(directory,'request.json'),MAX_REQUEST),request=decode(body,'The retained original request');
  need(meta?.schema==='tjl.ciim.connected-request.v1'&&meta.operationId===pending.operationId&&meta.requestSha256===hash(body)&&
    pending.requestSha256===meta.requestSha256&&pending.type===meta.type&&request.operationId===meta.operationId&&request.type===meta.type,
    'CONNECTED_PENDING_CHANGED','The retained pending request differs from its original body.',409);
  return {directory,key:pending.key,meta,body,request};
}

/** Read original request custody during server restart without opening the model or contacting HTTP. */
export async function inspectConnectedPending({connectionFile,journalDirectory,expectedWorkspaceId,expectedMarkerSha256}={}){
  connectionFile=absolute(connectionFile,'connection');
  need(basename(connectionFile)==='desk-connection.json','CONNECTED_CONNECTION_FILE','Select the original desk-connection.json.');
  const workspace=dirname(connectionFile);
  await privateDirectory(workspace);
  journalDirectory=absolute(journalDirectory??join(workspace,'connected-client'),'request journal');
  try{await privateDirectory(journalDirectory);}
  catch(error){if(error.code==='ENOENT')return {pending:null,journalDirectory,source:'retained_request_journal'};throw error;}
  const context=await optionalJson(join(journalDirectory,'connection.json'),65536);
  const pendingFile=join(journalDirectory,'pending.json'),saved=await optionalJson(pendingFile,65536);
  if(context)need(context.schema==='tjl.ciim.connected-client.v1'&&context.connectionFile===connectionFile&&context.workspace===workspace,
    'CONNECTED_JOURNAL_CHANGED','Use this request journal with its original physical receiving desk.',409);
  if(expectedWorkspaceId!==undefined)need(context?.workspaceId===expectedWorkspaceId,
    'CONNECTED_WORKSPACE_CHANGED','The retained request journal belongs to a different workspace identity.',409);
  if(expectedMarkerSha256!==undefined)need(hex(expectedMarkerSha256)&&context?.markerSha256===expectedMarkerSha256,
    'CONNECTED_MARKER_CHANGED','The retained request journal has a different original marker.',409);
  if(!saved)return {pending:null,journalDirectory,source:'retained_request_journal'};
  need(context,'CONNECTED_JOURNAL_CHANGED','The original pending request has no retained connection identity.',409);
  const original=await retainedConnectedRequest(join(journalDirectory,'operations'),saved);
  need(original.meta.binding?.workspace===workspace&&original.meta.binding?.connectionFile===connectionFile,
    'CONNECTED_REQUEST_TARGET_CHANGED','The original pending request belongs to another receiving desk.',409);
  need(isDeepStrictEqual(saved,await optionalJson(pendingFile,65536)),'CONNECTED_PENDING_CHANGED',
    'The pending request changed during this read. Read its current retained state again.',409);
  return {pending:{...saved,request:original.request,requestFile:join(original.directory,'request.json'),
    binding:original.meta.binding},journalDirectory,source:'retained_request_journal'};
}

/**
 * A private connection file is written by the existing live server. This client
 * reads it and verifies /api/launch on each operation. It never opens desk.sqlite.
 * Writes retain one original request before POST and recover that same body/UUID.
 */
export async function openConnectedCiimDesk({connectionFile,journalDirectory,timeoutMs=600000,
  expectedWorkspaceId,expectedMarkerSha256}={}){
  connectionFile=absolute(connectionFile,'connection');
  need(await realpath(connectionFile)===connectionFile,'CONNECTED_PATH','Use the original regular connection file.');
  const workspace=dirname(connectionFile);
  need(basename(connectionFile)==='desk-connection.json','CONNECTED_CONNECTION_FILE','Select the original desk-connection.json.');
  need(Number.isSafeInteger(timeoutMs)&&timeoutMs>=1000&&timeoutMs<=900000,'CONNECTED_TIMEOUT','Choose a timeout between1000 and900000 milliseconds.');
  if(expectedMarkerSha256!==undefined)need(hex(expectedMarkerSha256),'CONNECTED_BINDING','Use the complete original marker SHA256.');
  journalDirectory=absolute(journalDirectory??join(workspace,'connected-client'),'request journal');
  await privateDirectory(journalDirectory,true);
  const operations=join(journalDirectory,'operations');await privateDirectory(operations,true);
  const contextFile=join(journalDirectory,'connection.json'),pendingFile=join(journalDirectory,'pending.json');
  let closing=false,closePromise;const active=new Set();
  let currentContext;
  async function readConnection({allowRestore=false}={}){
    const value=decode(await readPrivate(connectionFile,65536),'The private connection');
    // The maintained server spreads its startup schema into the connection record.
    need(value&&[STARTUP,'tjl.ciim.desk-connection.v1'].includes(value.schema)&&value.status==='CIIM_DESK_READY'&&
      value.workspace===workspace&&value.connectionFile===connectionFile&&typeof value.workspaceId==='string'&&value.workspaceId&&
      hex(value.markerSha256)&&Number.isSafeInteger(value.pid)&&value.pid>0&&value.sessionHeader==='x-ciim-session',
      'CONNECTED_BINDING','The original connection record is incomplete or changed.',409);
    const markerBytes=await readPrivate(join(workspace,'desk.json'),65536),marker=decode(markerBytes,'The original desk marker');
    need(marker.schema==='tjl.ciim.receiving-desk.v1'&&marker.workspaceId===value.workspaceId&&hash(markerBytes)===value.markerSha256,
      'CONNECTED_MARKER_CHANGED','The connection differs from the actual receiving desk marker.',409);
    if(!allowRestore){
      need(!expectedWorkspaceId||expectedWorkspaceId===value.workspaceId,'CONNECTED_WORKSPACE_CHANGED','The selected original workspace identity changed.',409);
      need(!expectedMarkerSha256||expectedMarkerSha256===value.markerSha256,'CONNECTED_MARKER_CHANGED','The selected original marker changed.',409);
      if(currentContext)need(currentContext.workspaceId===value.workspaceId&&currentContext.markerSha256===value.markerSha256,
        'CONNECTED_WORKSPACE_CHANGED','Recover the original pending restore before operating the received workspace.',409);
    }
    let url;try{url=new URL(value.url);}catch{throw fault('CONNECTED_URL','The original private listener URL is invalid.');}
    need(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!url.username&&!url.password&&!url.search&&url.pathname==='/'&&
      hex(url.hash.slice(1))&&Number(url.port)>=1&&Number(url.port)<=65535,
      'CONNECTED_URL','Use the original private loopback listener.',409);
    return {...value,origin:url.origin,token:url.hash.slice(1)};
  }
  async function handshake({allowRestore=false}={}){
    const binding=await readConnection({allowRestore});
    const response=await fetch(binding.origin+'/api/launch',{redirect:'error',
      headers:{'X-CIIM-Session':binding.token},signal:AbortSignal.timeout(timeoutMs)});
    const live=await responseJson(response,65536);
    const expected={schema:STARTUP,status:binding.status,workspaceId:binding.workspaceId,workspace:binding.workspace,
      markerSha256:binding.markerSha256,pid:binding.pid,url:binding.url,connectionFile:binding.connectionFile};
    need(isDeepStrictEqual(live,expected),'CONNECTED_LIVE_BINDING_CHANGED','The live listener differs from its original private connection.',409);
    return binding;
  }
  async function retainContext(binding){
    const body={schema:'tjl.ciim.connected-client.v1',connectionFile,workspace,
      workspaceId:binding.workspaceId,markerSha256:binding.markerSha256};
    await atomicJson(journalDirectory,'connection.json',body);currentContext=body;
  }
  const releaseInitialization=await acquireWorkspace(journalDirectory);
  try{
    currentContext=await optionalJson(contextFile,65536);
    if(currentContext)need(currentContext.schema==='tjl.ciim.connected-client.v1'&&currentContext.connectionFile===connectionFile&&currentContext.workspace===workspace,
      'CONNECTED_JOURNAL_CHANGED','Use this request journal with its original private connection.',409);
    const initialPending=await optionalJson(pendingFile,65536);
    const initial=await handshake({allowRestore:Boolean(initialPending?.type==='workspace.restore')});
    if(!currentContext)await retainContext(initial);
  }finally{await releaseInitialization();}
  const types=new Set(CIIM_DESK_OPERATIONS.filter(value=>!value.name.startsWith('desk.')).map(value=>value.name));
  function run(work){
    need(!closing,'CONNECTED_CLOSED','The connected client is closed.',409);
    const promise=Promise.resolve().then(work);active.add(promise);promise.then(()=>active.delete(promise),()=>active.delete(promise));return promise;
  }
  async function readApi(path,query){
    const binding=await handshake();
    const response=await fetch(binding.origin+path+(query?'?'+query:''),{redirect:'error',
      headers:{'X-CIIM-Session':binding.token},signal:AbortSignal.timeout(timeoutMs)});
    return responseJson(response);
  }
  async function originalRequest(request,binding){
    const original=clean(request,'The original write request');
    need(request&&typeof request==='object'&&!Array.isArray(request)&&types.has(request.type)&&
      typeof request.operationId==='string'&&request.operationId.length>=1&&request.operationId.length<=128&&
      Number.isSafeInteger(request.expectedRevision)&&request.expectedRevision>=0&&typeof request.actor==='string'&&request.actor,
      'CONNECTED_REQUEST','Supply the original declared action, operationId, revision and actor.');
    const body=Buffer.from(original.wire);
    need(body.length<=MAX_REQUEST,'CONNECTED_REQUEST_LIMIT','The original write request exceeds16MiB.',413);
    const key=hash(request.operationId),directory=join(operations,key);await privateDirectory(directory,true);
    const path=join(directory,'request.json'),metaPath=join(directory,'identity.json');
    let retained=await optionalJson(metaPath,65536);
    if(retained){
      const wire=await readPrivate(path,MAX_REQUEST),saved=decode(wire,'The retained original request');
      need(retained.operationId===request.operationId&&retained.requestSha256===hash(wire)&&isDeepStrictEqual(saved,original.value),
        'CONNECTED_OPERATION_REUSED','This operation ID already has a different original request.',409);
      return {directory,key,meta:retained,body:wire,request:saved};
    }
    await exclusive(path,body);
    retained={schema:'tjl.ciim.connected-request.v1',operationId:request.operationId,type:request.type,
      requestSha256:hash(body),savedAt:new Date().toISOString(),binding:privateSummary(binding)};
    await exclusive(metaPath,Buffer.from(JSON.stringify(retained)+'\n'));
    return {directory,key,meta:retained,body,request:original.value};
  }
  const loadRequest=pending=>retainedConnectedRequest(operations,pending);
  async function clearPending(operationId){
    const pending=await optionalJson(pendingFile,65536);
    need(pending?.operationId===operationId,'CONNECTED_PENDING_CHANGED','The pending request changed during completion.',409);
    await unlink(pendingFile);await syncDirectory(journalDirectory);
  }
  async function sendOriginal(original){
    const restoring=original.request.type==='workspace.restore';
    const binding=await handshake({allowRestore:restoring});
    need(binding.workspace===original.meta.binding.workspace&&binding.connectionFile===original.meta.binding.connectionFile&&
      (restoring||binding.workspaceId===original.meta.binding.workspaceId&&binding.markerSha256===original.meta.binding.markerSha256),
      'CONNECTED_REQUEST_TARGET_CHANGED','The original request belongs to a different receiving desk.',409);
    const attemptId=randomUUID(),attempt={id:attemptId,operationId:original.request.operationId,requestSha256:original.meta.requestSha256,
      at:new Date().toISOString(),binding:privateSummary(binding),outcome:'awaiting_response'};
    await atomicJson(original.directory,'attempt-'+attemptId+'.json',attempt);
    try{
      const response=await fetch(binding.origin+'/api/act',{method:'POST',redirect:'error',
        headers:{'X-CIIM-Session':binding.token,'Content-Type':'application/json','Content-Length':String(original.body.length)},
        body:original.body,signal:AbortSignal.timeout(timeoutMs)});
      const result=await responseJson(response);
      need(result?.operationId===original.request.operationId&&result.type===original.request.type&&Number.isSafeInteger(result.revision)&&
        result.state?.workspaceId&&(restoring||result.state.workspaceId===binding.workspaceId),
        'CONNECTED_RECEIPT_CHANGED','The listener response does not match the original operation.',502);
      await atomicJson(original.directory,'receipt.json',result);
      if(restoring){
        const accepted=await handshake({allowRestore:true});
        need(accepted.workspaceId===result.state.workspaceId,'CONNECTED_RESTORE_CHANGED','The restored live desk differs from its original receipt.',409);
        await retainContext(accepted);
        expectedWorkspaceId=accepted.workspaceId;expectedMarkerSha256=accepted.markerSha256;
      }
      attempt.outcome='received';attempt.revision=result.revision;attempt.replayed=result.replayed;
      await atomicJson(original.directory,'attempt-'+attemptId+'.json',attempt);
      await clearPending(original.request.operationId);
      return result;
    }catch(error){
      // Authentication and managed-listener failures precede the original operation ledger.
      // They cannot settle an earlier response loss, so the same request stays pending.
      const rejected=error.connectedServerResponse&&[400,404,409].includes(error.connectedHttpStatus)&&
        error.code!=='MANAGED_WORKSPACE_BINDING';
      attempt.outcome=rejected?'rejected':'response_uncertain';attempt.error=errorView(error);
      await atomicJson(original.directory,'attempt-'+attemptId+'.json',attempt);
      if(rejected)await clearPending(original.request.operationId);
      if(rejected)throw error;
      throw fault('CONNECTED_RESPONSE_UNCERTAIN','The original request remains saved. Recover its unchanged operation ID.',
        503,{operationId:original.request.operationId,pendingFile,cause:errorView(error)});
    }
  }
  async function act(request){
    const release=await acquireWorkspace(journalDirectory);
    try{
      const pending=await optionalJson(pendingFile,65536);
      let original;
      if(pending){
        original=await loadRequest(pending);
        need(isDeepStrictEqual(clean(request,'The original request').value,original.request),
          'CONNECTED_PENDING_OPERATION','Recover the existing original request before recording another decision.',409,
          {operationId:pending.operationId,pendingFile});
      }else{
        const binding=await handshake();original=await originalRequest(request,binding);
        await atomicJson(journalDirectory,'pending.json',{schema:'tjl.ciim.connected-pending.v1',
          key:original.key,operationId:original.request.operationId,type:original.request.type,
          requestSha256:original.meta.requestSha256,savedAt:new Date().toISOString()});
      }
      return await sendOriginal(original);
    }finally{await release();}
  }
  async function recover(){
    const release=await acquireWorkspace(journalDirectory);
    try{
      const pending=await optionalJson(pendingFile,65536);
      need(pending,'CONNECTED_NO_PENDING','There is no original pending operation to recover.',404);
      return await sendOriginal(await loadRequest(pending));
    }finally{await release();}
  }

  async function pending(){
    const saved=await optionalJson(pendingFile,65536);
    if(!saved)return {pending:null,journalDirectory};
    const original=await loadRequest(saved);
    return {pending:{...saved,request:original.request,requestFile:join(original.directory,'request.json'),
      binding:original.meta.binding},journalDirectory};
  }
  async function prepareImport({archiveFile,filename,sha256,bytes}={}){
    archiveFile=absolute(archiveFile,'original archive');
    need(await realpath(archiveFile)===archiveFile,'CONNECTED_SOURCE_LINK','Select the original regular archive.');
    filename=filename??basename(archiveFile);
    need(typeof filename==='string'&&filename.length>0&&filename.length<=512&&!filename.includes('\0')&&
      encodeURIComponent(filename).length<=2048,'CONNECTED_FILENAME','Supply the original archive filename.');
    if(sha256!==undefined)need(hex(sha256),'CONNECTED_SOURCE_HASH','Supply the complete original archive SHA256.');
    if(bytes!==undefined)need(Number.isSafeInteger(bytes)&&bytes>0&&bytes<=LIMITS.archiveBytes,
      'CONNECTED_FILE_LIMIT','Supply the exact original archive byte count.',413);
    const binding=await handshake(),source=await open(archiveFile,constants.O_RDONLY|constants.O_NOFOLLOW);
    let stream;
    try{
      const before=await source.stat({bigint:true});
      need(before.isFile()&&before.size>0n&&before.size<=BigInt(LIMITS.archiveBytes),
        'CONNECTED_FILE_LIMIT','Select a complete regular archive within the receiving limit.',413);
      const digest=createHash('sha256');let count=0;
      for await(const chunk of source.createReadStream({autoClose:false,start:0,highWaterMark:65536})){
        count+=chunk.length;need(count<=LIMITS.archiveBytes,'CONNECTED_FILE_LIMIT','The original archive grew while hashing.',413);
        digest.update(chunk);
      }
      const actual=digest.digest('hex');
      need(BigInt(count)===before.size&&sameStat(before,await source.stat({bigint:true})),
        'CONNECTED_FILE_CHANGED','The original archive changed while hashing.',409);
      need((sha256===undefined||sha256===actual)&&(bytes===undefined||bytes===count),
        'CONNECTED_ORIGINAL_CHANGED','The archive differs from its supplied original identity.',409);
      stream=source.createReadStream({autoClose:false,start:0,end:count-1,highWaterMark:65536});
      const response=await fetch(binding.origin+'/api/import',{method:'POST',redirect:'error',duplex:'half',
        headers:{'X-CIIM-Session':binding.token,'Content-Type':'application/zip','Content-Length':String(count),
          'X-CIIM-Filename':encodeURIComponent(filename),'X-CIIM-SHA256':actual},
        body:stream,signal:AbortSignal.timeout(timeoutMs)});
      const result=await responseJson(response);
      need(sameStat(before,await source.stat({bigint:true})),'CONNECTED_FILE_CHANGED',
        'The original archive changed during transfer. Inspect the retained candidate before receiving it.',409);
      // Reusing identical bytes keeps the first retained original filename.
      need(result?.sha256===actual&&result?.bytes===count&&hex(result?.candidateId),
        'CONNECTED_IMPORT_CHANGED','The retained candidate differs from the complete original archive.',502);
      return result;
    }finally{stream?.destroy();await source.close();}
  }
  async function download(path,{out,query,maximum=LIMITS.expandedBytes,expectedSha256,requireHash=true,kind}={}){
    out=absolute(out,'output');
    need(await realpath(dirname(out))===dirname(out),'CONNECTED_OUTPUT_LINK','Use the original output directory.');
    if(expectedSha256!==undefined)need(hex(expectedSha256),'CONNECTED_OUTPUT_HASH','Supply a complete expected SHA256.');
    const binding=await handshake();
    const response=await fetch(binding.origin+path+(query?'?'+query:''),{redirect:'error',
      headers:{'X-CIIM-Session':binding.token,'Accept-Encoding':'identity'},signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)return responseJson(response);
    const declared=response.headers.get('content-length'),serverHash=response.headers.get('x-content-sha256');
    const encoding=response.headers.get('content-encoding');
    need(!encoding||encoding==='identity','CONNECTED_OUTPUT_ENCODING','The original output must retain its exact body encoding.',502);
    need(declared!==null&&/^\d+$/.test(declared)&&Number.isSafeInteger(Number(declared))&&Number(declared)<=maximum,
      'CONNECTED_OUTPUT_LIMIT','The complete output size is missing or exceeds its receiving limit.',413);
    need(!requireHash||hex(serverHash),'CONNECTED_OUTPUT_HASH','The original output hash is missing.',502);
    if(serverHash!==null)need(hex(serverHash),'CONNECTED_OUTPUT_HASH','The original output hash is invalid.',502);
    if(expectedSha256!==undefined&&serverHash!==null)need(expectedSha256===serverHash,
      'CONNECTED_OUTPUT_CHANGED','The selected output differs from the expected original identity.',409);
    const mime=response.headers.get('content-type')??'application/octet-stream';
    const disposition=response.headers.get('content-disposition')??'';
    let filename=basename(out);
    const encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition),quoted=/filename="([^"]*)"/i.exec(disposition);
    if(encoded){try{filename=decodeURIComponent(encoded[1]);}catch{throw fault('CONNECTED_OUTPUT_FILENAME','The original output filename is invalid.',502);}}
    else if(quoted)filename=quoted[1];
    need(filename.length>0&&!filename.includes('\0'),'CONNECTED_OUTPUT_FILENAME','The original output filename is invalid.',502);
    const temporary=join(dirname(out),'.ciim-connected-'+randomUUID()+'.pending');
    let file,completed=false;
    try{
      file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
      const digest=createHash('sha256');let count=0;
      for await(const chunk of response.body){
        count+=chunk.length;need(count<=maximum&&count<=Number(declared),
          'CONNECTED_OUTPUT_LIMIT','The streamed output exceeded its original declared size.',413);
        digest.update(chunk);await file.writeFile(chunk);
      }
      const sha256=digest.digest('hex');
      need(count===Number(declared)&&(serverHash===null||sha256===serverHash)&&
        (expectedSha256===undefined||sha256===expectedSha256),
        'CONNECTED_OUTPUT_CHANGED','The complete output differs from its original byte count or SHA256.',409);
      await file.sync();await file.close();file=null;
      let reused=false;
      try{await link(temporary,out);}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        need(await realpath(out)===out,'CONNECTED_OUTPUT_EXISTS','The existing output is a link.',409);
        const existing=await inspectFile(out,{maximum});
        need(existing.bytes===count&&existing.sha256===sha256,'CONNECTED_OUTPUT_EXISTS',
          'The chosen output already contains different bytes. Select a new output path.',409);
        reused=true;
      }
      await syncDirectory(dirname(out));completed=true;
      return {file:out,filename,mime,bytes:count,sha256,kind,reused};
    }finally{
      await file?.close();
      await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
      if(!completed)await response.body?.cancel().catch(()=>{});
    }
  }
  async function close(){
    if(closePromise)return closePromise;
    closing=true;
    closePromise=(async()=>{await Promise.allSettled([...active]);})();
    return closePromise;
  }
  return Object.freeze({
    describeOperations:()=>describeConnectedDeskOperations(),
    connection:()=>run(async()=>({...privateSummary(await handshake()),journalDirectory})),
    describe:()=>run(()=>readApi('/api/describe')),
    state:()=>run(()=>readApi('/api/state')),
    view:query=>run(()=>readApi('/api/view',parameters(query,
      ['view','editionId','comparisonId','offset','limit','status','query']))),
    record:query=>run(()=>readApi('/api/record',parameters(query,['editionId','recordId']))),
    prepareImport:args=>run(()=>prepareImport(args)),
    act:request=>run(()=>act(request)),
    recover:()=>run(()=>recover()),
    pending:()=>run(()=>pending()),
    exportWorkspace:({out}={})=>run(()=>download('/api/export/workspace',{out,kind:'workspace'})),
    exportHandback:({handbackId,out}={})=>run(()=>download('/api/export/handback',
      {out,kind:'handback',query:parameters({handbackId},['handbackId'])})),
    attachment:({out,...query}={})=>run(()=>download('/api/attachment',
      {out,kind:query.kind,maximum:LIMITS.memberBytes,query:parameters(query,['editionId','kind','id'])})),
    guide:({out,sha256}={})=>run(()=>download('/operator-guide.md',
      {out,kind:'operator-guide',maximum:LIMITS.manifestBytes,requireHash:false,expectedSha256:sha256})),
    close,
  });
}

/** The original action catalogue, with explicit destinations for streamed reads. */
export function describeConnectedDeskOperations(){
  const original=describeDeskOperations();
  const operations=original.operations.map(operation=>{
    const item=structuredClone(operation);
    if(['desk.export_workspace','desk.export_handback','desk.attachment'].includes(item.name)){
      item.inputSchema.properties.out={type:'string',minLength:1,maxLength:4096,
        description:'Absolute output filename. Complete bytes are streamed privately and verified before publication.'};
      item.inputSchema.required=[...item.inputSchema.required,'out'];
    }
    return item;
  });
  return {...original,schema:'tjl.ciim.connected-desk-operations.v1',operations,
    connection:'Use the actual private desk-connection.json emitted by the live original receiving server.',
    requests:'Every write is retained privately before POST. Recover the identical original operationId and body after a lost response.',
    exports:'Stream complete original exports or attachments into the supplied absolute output filename; verify byte count and SHA256.',
    limits:{...LIMITS,downloadBytes:LIMITS.expandedBytes,jsonResponseBytes:MAX_JSON,writeRequestBytes:MAX_REQUEST}};
}
export async function executeConnectedDeskOperation(client,{name,arguments:args={}}={}){
  need(args&&typeof args==='object'&&!Array.isArray(args),'CONNECTED_ARGUMENTS','Use one declared operation argument object.');
  const entry=CIIM_DESK_OPERATIONS.find(value=>value.name===name);
  need(entry,'OPERATION_NOT_FOUND','Choose a declared receiving desk operation.',404);
  if(!name.startsWith('desk.')){
    need(args.type===name,'OPERATION_TYPE','The selected operation and original request type differ.');
    return client.act(args);
  }
  const allowed={ 'desk.describe':[], 'desk.state':[], 'desk.view':['view','editionId','comparisonId','offset','limit','status','query'],
    'desk.record':['editionId','recordId'],'desk.prepare_import':['archiveFile','filename','sha256','bytes'],
    'desk.export_workspace':['out'],'desk.export_handback':['handbackId','out'],
    'desk.attachment':['editionId','kind','id','out'] };
  need(Object.keys(args).every(key=>allowed[name].includes(key)),'CONNECTED_ARGUMENTS','Use the declared original operation arguments.');
  if(name==='desk.describe')return client.describe();
  if(name==='desk.state')return client.state();
  if(name==='desk.view')return client.view(args);
  if(name==='desk.record')return client.record(args);
  if(name==='desk.prepare_import')return client.prepareImport(args);
  if(name==='desk.export_workspace')return client.exportWorkspace(args);
  if(name==='desk.export_handback')return client.exportHandback(args);
  return client.attachment(args);
}
