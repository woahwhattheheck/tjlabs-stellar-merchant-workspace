// MIT. Exact original ALFRED responses and recoverable keyless acquisition.
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import { privateDirectory,atomicJson,readPrivateJson,withPrivateLock } from '../../routescan/quota.mjs';
import { canonical,clone,need,normalizeSelection,MAX_CAPTURE_BYTES } from '../model.mjs';
import { ALFRED_CAPTURE,ALFRED_SOURCE,fredAlfredRequest,readFredAlfredCsv,readFredAlfredMetadata,
  inspectFredAlfredCapture,fredAlfredCaptureIdentity } from './model.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>hash(canonical(value));
const STATE='stellar-forge.alfred-acquisition.v1';
const MAX_RESPONSE_BYTES=16*1024*1024;
const HEADERS=['content-type','date','etag','last-modified','content-length','retry-after'];
const optional=async(path,limit=MAX_CAPTURE_BYTES*2)=>{try{return await readPrivateJson(path,limit);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
export function validateFredAlfredCapture(capture){
  need(capture?.schema===ALFRED_CAPTURE&&capture.captureSha256===digest(fredAlfredCaptureIdentity(capture)),'The complete retained ALFRED source identity changed.');
  for(const record of capture.source?.series??[]){
    for(const source of [record.response,record.metadata?.source].filter(Boolean))
      need(hash(Buffer.from(source.body,'utf8'))===source.sha256,'An original ALFRED response body changed.');
  }
  return inspectFredAlfredCapture(capture);
}
export function sealFredAlfredCapture(selectionInput,records){
  const selection=normalizeSelection(selectionInput);
  need(Array.isArray(records),'Retain the complete ordered original ALFRED source records.');
  const capture={schema:ALFRED_CAPTURE,selection,source:{schema:ALFRED_SOURCE,series:clone(records)}};
  capture.captureSha256=digest(fredAlfredCaptureIdentity(capture));validateFredAlfredCapture(capture);return capture;
}
export function createFredAlfredFileResponse({body,url,receivedAt}){
  need(typeof body==='string','An original UTF-8 ALFRED file is required.');
  return {kind:'file',url,finalUrl:null,status:null,receivedAt,headers:{},body,bytes:Buffer.byteLength(body),sha256:hash(Buffer.from(body,'utf8'))};
}
export function adoptFredAlfredMetadata(capture,metadata){
  validateFredAlfredCapture(capture);need(Array.isArray(metadata),'Supply the complete desired metadata-edition inventory.');
  const byId=new Map();
  for(const item of metadata){
    const id=item?.series?.value;need(capture.selection.series.includes(id)&&!byId.has(id),'Metadata must name one selected original series once.');
    readFredAlfredMetadata(item,{series:id,vintage:capture.selection.asOf});byId.set(id,item);
  }
  return sealFredAlfredCapture(capture.selection,capture.source.series.map(record=>({...record,metadata:byId.get(record.request.series)??record.metadata??null})));
}
export async function readFredAlfredCapture(directory){
  directory=resolve(directory);const capture=await readPrivateJson(join(directory,'capture.json'),MAX_CAPTURE_BYTES*2);
  const model=validateFredAlfredCapture(capture);return {directory,capture,model,reused:true};
}
export async function storeFredAlfredCapture(directory,capture){
  directory=await privateDirectory(resolve(directory));const model=validateFredAlfredCapture(capture);
  return withPrivateLock(directory,'capture.lock',async()=>{
    const existing=await optional(join(directory,'capture.json'));
    if(existing){validateFredAlfredCapture(existing);need(existing.captureSha256===capture.captureSha256,'This source directory already retains another complete historical edition.');}
    else await atomicJson(directory,'capture.json',capture,{exclusive:true});
    return {directory,capture:existing??capture,model,reused:Boolean(existing)};
  });
}
function normalizeMetadata(metadata,selection){
  need(Array.isArray(metadata),'Metadata editions must be an array.');
  const result=[];
  for(const item of metadata){
    const id=item?.series?.value;need(selection.series.includes(id)&&!result.some(entry=>entry.series.value===id),'Metadata must name each selected series at most once.');
    readFredAlfredMetadata(item,{series:id,vintage:selection.asOf});need(hash(Buffer.from(item.source.body,'utf8'))===item.source.sha256,'Historical metadata source bytes changed.');result.push(clone(item));
  }
  return result.sort((a,b)=>a.series.value<b.series.value?-1:a.series.value>b.series.value?1:0);
}
function checkpoint(state){
  return {schema:STATE,selection:clone(state.selection),requestFingerprint:state.requestFingerprint,status:state.status,
    completedSeries:state.records.map(record=>record.request.series),responseCount:state.records.length,nextRequest:state.nextRequest??null,
    lastError:state.lastError??null,nextAllowedAt:state.nextAllowedAt??null,attempts:clone(state.attempts??[]),startedAt:state.startedAt,updatedAt:state.updatedAt,captureSha256:state.captureSha256??null};
}
export async function inspectFredAlfredAcquisition({directory}){
  directory=resolve(directory);const state=await optional(join(directory,'progress.json'));
  need(state?.schema===STATE,'No retained original ALFRED acquisition exists in this directory.');
  return {directory,...checkpoint(state)};
}
function abort(signal){if(signal?.aborted)throw signal.reason??Object.assign(new Error('Original ALFRED acquisition interrupted.'),{name:'AbortError'});}
async function responseBytes(response,signal){
  const chunks=[];let bytes=0;
  const length=response.headers.get('content-length');
  if(length!==null)need(/^\d+$/.test(length)&&Number(length)<=MAX_RESPONSE_BYTES,'The original response exceeds 16 MiB.');
  if(response.body?.getReader){
    const reader=response.body.getReader();
    try{for(;;){abort(signal);const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;
      need(bytes<=MAX_RESPONSE_BYTES,'The original response exceeds 16 MiB.');chunks.push(Buffer.from(part.value));}}
    catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  }else{
    const value=Buffer.from(await response.arrayBuffer());need(value.length<=MAX_RESPONSE_BYTES,'The original response exceeds 16 MiB.');chunks.push(value);bytes=value.length;
  }
  return Buffer.concat(chunks,bytes);
}
function safeError(error){
  return {name:String(error?.name??'Error'),code:String(error?.code??'ALFRED_SOURCE_FAILURE'),
    message:String(error?.message??'The original ALFRED request did not complete.').slice(0,2000),status:Number.isInteger(error?.status)?error.status:null,
    retryAfter:typeof error?.retryAfter==='string'?error.retryAfter:null};
}
function nextAllowedAt(response){
  const value=response.headers?.['retry-after'];if(!value)return null;
  const received=Date.parse(response.receivedAt);
  const when=/^\d+$/.test(value)?received+Number(value)*1000:Date.parse(value);
  return Number.isFinite(when)&&Math.abs(when)<=8.64e15?new Date(when).toISOString():null;
}
function retainAttempt(state,path,attempt,request){
  need(/^attempt-\d{6,}\.json$/.test(path)&&canonical(attempt?.request)===canonical(request)&&
    Number.isInteger(attempt.response?.status)&&attempt.response.status>=100&&attempt.response.status<=599&&
    typeof attempt.response.body==='string'&&hash(attempt.response.body)===attempt.response.sha256&&
    Number.isFinite(Date.parse(attempt.response.receivedAt)),'The complete retained original HTTP attempt changed.');
  state.attempts??=[];
  const response=attempt.response,entry={series:request.series,path,status:response.status,receivedAt:response.receivedAt,sha256:response.sha256};
  const existing=state.attempts.find(item=>item.path===path);
  if(existing)need(canonical(existing)===canonical(entry),'The original HTTP attempt inventory changed.');
  else state.attempts.push(entry);
  state.nextAllowedAt=nextAllowedAt(response);state.activeAttempt=null;
  return response;
}
function respectSourceRetry(state){
  if(state.nextAllowedAt)need(Number.isFinite(Date.parse(state.nextAllowedAt))&&Date.now()>=Date.parse(state.nextAllowedAt),
    'The original source requested retry after '+state.nextAllowedAt+'.','ALFRED_RETRY_LATER',429);
}
export async function captureFredAlfred({directory,selection:input,metadata=[],fetchImpl=globalThis.fetch,signal,onProgress}){
  const selection=normalizeSelection(input),editions=normalizeMetadata(metadata,selection),requestFingerprint=digest({selection,metadata:editions});
  need(typeof fetchImpl==='function','An HTTP fetch implementation is required.');
  directory=await privateDirectory(resolve(directory));
  return withPrivateLock(directory,'capture.lock',async()=>{
    const retained=await optional(join(directory,'capture.json'));
    if(retained){const model=validateFredAlfredCapture(retained);
      need(canonical(retained.selection)===canonical(selection),'This complete source directory belongs to another original selection.');
      need(canonical(retained.source.series.map(record=>record.metadata??null))===canonical(selection.series.map(id=>editions.find(item=>item.series.value===id)??null)),
        'This completed source has different metadata; adopt the new edition into a new immutable source directory.');
      return {directory,capture:retained,model,reused:true};
    }
    let state=await optional(join(directory,'progress.json'));
    if(state)need(state.schema===STATE&&state.requestFingerprint===requestFingerprint,'Continue the same original selection and metadata in this acquisition directory.');
    else state={schema:STATE,selection,metadata:editions,requestFingerprint,records:[],status:'pending',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString(),nextRequest:null,lastError:null,nextAllowedAt:null,attempts:[],nextAttempt:1,activeAttempt:null};
    need(Array.isArray(state.records)&&state.records.length<=selection.series.length,'The retained acquisition progress is invalid.');
    for(let index=0;index<state.records.length;index++){
      const record=state.records[index];need(record.request.series===selection.series[index]&&hash(record.response.body)===record.response.sha256,'Retained acquisition response bytes or order changed.');
      readFredAlfredCsv(record,selection);
    }
    const save=async()=>{state.updatedAt=new Date().toISOString();await atomicJson(directory,'progress.json',state);};
    try{
      for(let index=state.records.length;index<selection.series.length;index++){
        abort(signal);respectSourceRetry(state);const id=selection.series[index],request=fredAlfredRequest(selection,id);
        state.status='acquiring';state.nextRequest=request;state.lastError=null;await save();
        let retainedResponse=await optional(join(directory,'response-'+id+'.json'));
        if(!retainedResponse){
          const candidate=state.activeAttempt?.series===id?state.activeAttempt:
            [...(state.attempts??[])].reverse().find(attempt=>attempt.series===id&&attempt.status===200);
          if(candidate){
            need(/^attempt-\d{6,}\.json$/.test(candidate.path),'Retain the original local HTTP attempt path.');
            const attempt=await optional(join(directory,candidate.path));
            if(attempt){
              const response=retainAttempt(state,candidate.path,attempt,request);
              await save();
              if(response.status===200){
                retainedResponse=attempt;await atomicJson(directory,'response-'+id+'.json',attempt,{exclusive:true});
              }
            }
          }
        }
        let original;
        if(retainedResponse){
          need(canonical(retainedResponse.request)===canonical(request)&&retainedResponse.response?.status===200&&
            hash(retainedResponse.response.body)===retainedResponse.response.sha256,'The retained original response or request changed.');
          original=retainedResponse.response;
        }else{
          respectSourceRetry(state);
          const sequence=state.nextAttempt??((state.attempts??[]).length+1);
          need(Number.isSafeInteger(sequence)&&sequence>=1,'The original attempt sequence changed.');
          const path='attempt-'+String(sequence).padStart(6,'0')+'.json';
          state.activeAttempt={series:id,path};state.nextAttempt=sequence+1;await save();
          const response=await fetchImpl(request.url,{method:'GET',redirect:'error',signal,headers:{Accept:'text/csv,text/plain;q=0.9'}});
          const bytes=await responseBytes(response,signal),headers={};
          for(const key of HEADERS){const value=response.headers.get(key);if(value!==null)headers[key]=value;}
          const receivedAt=new Date().toISOString(),sha256=hash(bytes);
          let body;try{body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{need(false,'The original ALFRED response is not UTF-8.');}
          need(Buffer.byteLength(body)===bytes.length&&hash(Buffer.from(body,'utf8'))===sha256,'The original UTF-8 source bytes must round-trip exactly.');
          original={kind:'http',url:request.url,finalUrl:response.url||request.url,status:response.status,receivedAt,headers,body,bytes:bytes.length,sha256};
          await atomicJson(directory,path,{request,response:original},{exclusive:true});
          retainAttempt(state,path,{request,response:original},request);
          const retryAfter=original.headers['retry-after']??null;
          await save();
          if(response.status!==200)throw Object.assign(new Error('ALFRED returned HTTP '+response.status+'; the complete original response is retained.'),{
            code:response.status===429?'ALFRED_RATE_LIMIT':'ALFRED_HTTP',status:response.status,retryAfter});
          await atomicJson(directory,'response-'+id+'.json',{request,response:original},{exclusive:true});
        }
        const record={request,response:original,metadata:editions.find(item=>item.series.value===id)??null};
        readFredAlfredCsv(record,selection);state.records.push(record);state.nextRequest=null;await save();
        if(onProgress)await onProgress(checkpoint(state));abort(signal);
      }
      const capture=sealFredAlfredCapture(selection,state.records),model=validateFredAlfredCapture(capture);
      await atomicJson(directory,'capture.json',capture,{exclusive:true});state.status='complete';state.captureSha256=capture.captureSha256;state.nextRequest=null;await save();
      return {directory,capture,model,reused:false};
    }catch(error){state.status=signal?.aborted?'interrupted':'failed';state.lastError=safeError(error);await save();throw error;}
  });
}
