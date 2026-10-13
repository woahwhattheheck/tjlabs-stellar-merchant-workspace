// MIT. Original authenticated Research routes for complete reviewed dossier returns.
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {need} from '../../node/store.mjs';
import {PORTABLE_LIMIT} from '../portable.mjs';

export const DOSSIER_RETURN_SOURCE_LIMIT=PORTABLE_LIMIT;
export const DOSSIER_RETURN_REQUEST_LIMIT=16*1024*1024;
export const DOSSIER_RETURN_CONTROL_LIMIT=1024*1024;
export const DOSSIER_RETURN_ERROR_STATUS=Object.freeze({
  RETURN_SOURCE_NOT_FOUND:404,RETURN_REVIEW_NOT_FOUND:404,RETURN_DRAFT_NOT_FOUND:404,
  RETURN_ITEM_NOT_FOUND:404,RETURN_DRAFT_CONFLICT:409,RETURN_COMPARISON_MISMATCH:409,
  RETURN_REQUEST_CONFLICT:409,RETURN_DECISION_REQUIRED:422,RETURN_DECISION_INVALID:422,
  RETURN_NO_COMMON_ANCESTOR:422,RETURN_SOURCE_TOO_LARGE:413,RETURN_SOURCE_INVALID:400,
  RETURN_SOURCE_CHANGED:500,RETURN_EXPORT_DESCRIPTOR_INVALID:500,RETURN_EXPORTED_BYTES_CHANGED:500,
});
const numbers=new Set(['expectedRevision','offset','limit','bytes']);
function query(url,allowed){
  const out={};
  for(const[key,value]of url.searchParams){
    if(['projection','sourceProjection'].includes(key))continue;
    need(allowed.includes(key)&&!Object.hasOwn(out,key),'RETURN_QUERY_INVALID');
    if(numbers.has(key)){need(/^(0|[1-9][0-9]{0,11})$/.test(value)&&Number.isSafeInteger(Number(value)),'RETURN_QUERY_INVALID');out[key]=Number(value);}
    else out[key]=value;
  }
  return out;
}
function descriptor(value){
  need(value&&typeof value.filename==='string'&&value.filename.length>0&&value.filename.length<=512&&
    !/[\u0000-\u001f\u007f/\\]/.test(value.filename)&&typeof value.contentType==='string'&&
    !/[\r\n]/.test(value.contentType)&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&
    value.bytes<=PORTABLE_LIMIT&&/^[a-f0-9]{64}$/.test(value.sha256),'RETURN_EXPORT_DESCRIPTOR_INVALID');
  need((Buffer.isBuffer(value.body))!==(value.stream!==undefined)&&
    (value.stream===undefined||typeof value.stream[Symbol.asyncIterator]==='function'),'RETURN_EXPORT_DESCRIPTOR_INVALID');
  return value;
}
async function sendFile(res,headers,result,{requireIdentity=false}={}){
  let file,content;
  try{
  file=descriptor(result);const identity=file.identity;
  need(!requireIdentity||identity,'RETURN_EXPORT_DESCRIPTOR_INVALID');
  if(identity){
    need(/^drv_[a-f0-9]{64}$/.test(identity.reviewId)&&/^drs_[a-f0-9]{64}$/.test(identity.sourceId)&&
      /^[a-f0-9]{64}$/.test(identity.comparisonSha256)&&
      (identity.returnId===null||/^drr_[a-f0-9]{64}$/.test(identity.returnId))&&
      (identity.revisionSha256===null||/^[a-f0-9]{64}$/.test(identity.revisionSha256)),'RETURN_EXPORT_DESCRIPTOR_INVALID');
  }
  if(file.body)need(file.body.length===file.bytes&&createHash('sha256').update(file.body).digest('hex')===file.sha256,
    'RETURN_EXPORTED_BYTES_CHANGED');
  content=Readable.from((async function*(){
    const hash=createHash('sha256');let count=0;
    const chunks=file.body?[file.body]:file.stream;
    for await(const chunk of chunks){
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
      count+=bytes.length;need(count<=file.bytes,'RETURN_EXPORTED_BYTES_CHANGED');hash.update(bytes);yield bytes;
    }
    need(count===file.bytes&&hash.digest('hex')===file.sha256,'RETURN_EXPORTED_BYTES_CHANGED');
  })());
    res.writeHead(200,{...headers,'Content-Type':file.contentType,'Content-Length':file.bytes,
      'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(file.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),
      'X-Content-SHA256':file.sha256,...(identity?{
        'X-Research-Return-Review-Id':identity.reviewId,'X-Research-Return-Source-Id':identity.sourceId,
        'X-Research-Return-Comparison-SHA256':identity.comparisonSha256,
        ...(identity.returnId?{'X-Research-Return-Id':identity.returnId}:{}),
        ...(identity.revisionSha256?{'X-Research-Return-Revision-SHA256':identity.revisionSha256}:{})}:{}),
      ...(file.itemId?{'X-Research-Return-Item-Id':file.itemId,'X-Research-Return-Side':file.side}:{})});
    await pipeline(content,res);
  }finally{content?.destroy();if(result?.stream?.destroy)result.stream.destroy();}
}
export async function handleDossierReturnRoute({store,dossierId,action,req,res,url,headers,readBody,send}){
  if(action!=='returns'&&!action.startsWith('returns/'))return false;
  const selected=action.slice('returns'.length).replace(/^\//,'');
  let result;
  if(req.method==='POST'&&selected==='sources'){
    const input=query(url,['filename','sha256','bytes']);
    need(typeof input.filename==='string'&&input.filename.length>0&&input.filename.length<=512&&
      !/[\u0000-\u001f\u007f/\\]/.test(input.filename),'RETURN_SOURCE_FILENAME_INVALID');
    need(/^[a-f0-9]{64}$/.test(input.sha256),'RETURN_SOURCE_INVALID');
    const contentType=(req.headers['content-type']??'').split(';')[0].trim().toLowerCase();
    need(['application/json','application/gzip','application/x-gzip','application/octet-stream'].includes(contentType),'PORTABLE_BODY_REQUIRED');
    const declared=req.headers['content-length'];
    if(declared!==undefined)need(/^[0-9]+$/.test(declared)&&Number.isSafeInteger(Number(declared))&&
      Number(declared)<=DOSSIER_RETURN_SOURCE_LIMIT,'RETURN_SOURCE_TOO_LARGE');
    if(input.bytes!==undefined)need(input.bytes<=DOSSIER_RETURN_SOURCE_LIMIT&&
      (declared===undefined||input.bytes===Number(declared)),'RETURN_SOURCE_TOO_LARGE');
    let count=0,complete=false;
    const stream=Readable.from((async function*(){
      for await(const chunk of req){count+=chunk.length;need(count<=DOSSIER_RETURN_SOURCE_LIMIT,'RETURN_SOURCE_TOO_LARGE');yield chunk;}
      need((declared===undefined||count===Number(declared))&&(input.bytes===undefined||count===input.bytes),'RETURN_SOURCE_INVALID');
      complete=true;
    })());
    try{
      result=await store.receiveDossierReturnSource(dossierId,{input:stream,filename:input.filename,contentType,expectedSha256:input.sha256});
      need(complete&&result?.source?.sha256===input.sha256&&result.source.bytes===count&&
        result.source.id==='drs_'+input.sha256,'RETURN_SOURCE_CHANGED');
    }finally{stream.destroy();}
  }else if(req.method==='GET'&&selected===''){
    result=await store.dossierReturns(dossierId,query(url,['reviewId','requestId','offset','limit']));
  }else if(req.method==='GET'&&selected==='value'){
    const selectedValue=query(url,['reviewId','itemId','side']);
    const value=await store.dossierReturnValue(dossierId,selectedValue);
    if(value?.identity?.reviewId!==selectedValue.reviewId){
      value?.stream?.destroy?.();need(false,'RETURN_VALUE_CHANGED');
    }
    await sendFile(res,headers,{...value,itemId:selectedValue.itemId,side:selectedValue.side},{requireIdentity:true});return true;
  }else if(req.method==='GET'&&selected==='export'){
    await sendFile(res,headers,await store.exportDossierReturn(dossierId,query(url,['reviewId','returnId','format'])),{requireIdentity:true});return true;
  }else if(req.method==='GET'&&selected==='draft'){
    result=await store.dossierReturnDraft(dossierId,query(url,['reviewId']));
  }else if(req.method==='POST'&&['preview','choices','reviews','draft'].includes(selected)){
    query(url,[]);
    const input=await readBody(req,selected==='preview'?DOSSIER_RETURN_CONTROL_LIMIT:DOSSIER_RETURN_REQUEST_LIMIT);
    result=await store[{preview:'previewDossierReturn',choices:'previewDossierReturnChoices',
      reviews:'reviewDossierReturn',draft:'saveDossierReturnDraft'}[selected]](dossierId,input);
  }else{
    send(req.method==='GET'||req.method==='POST'?404:405,{error:'RETURN_ROUTE_NOT_FOUND'});return true;
  }
  const revision=result?.return?.revision??result?.current?.revision;
  if(Number.isSafeInteger(revision))res.setHeader('X-Research-Dossier-Revision',String(revision));
  send(200,result);return true;
}
