// SPDX-License-Identifier: MIT
// Returned-comparison adoption on the original authenticated Research listener.
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {PORTABLE_LIMIT} from '../portable.mjs';
import {ADOPTION_REQUEST_LIMIT} from './adoption-contracts.mjs';

export const COMPARISON_ADOPTION_REQUEST_LIMIT=ADOPTION_REQUEST_LIMIT;
export function comparisonAdoptionErrorStatus(code){
  if(['ADOPTION_FILE_DESCRIPTOR','ADOPTION_FILE_CHANGED','ADOPTION_RESPONSE_INVALID'].includes(code))return 500;
  if(typeof code==='string'&&code.startsWith('ADOPTION_'))return code.endsWith('_NOT_FOUND')?404:400;
  return undefined;
}
const need=(ok,code,details={})=>{if(!ok)throw Object.assign(new Error(code),{code,details});};
const selected=new Set(['comparison/adoptions','comparison/adoption','comparison/adoption/source','comparison/adoption/preview','comparison/adoption/reviews','comparison/adoption/file','comparison/adoption/export']);
function query(url,allowed){
  const result={},seen=new Set();
  for(const [key,value]of url.searchParams){
    need(!seen.has(key),'ADOPTION_QUERY_INVALID');seen.add(key);
    if(key==='projection'||key==='sourceProjection')continue;
    need(allowed.includes(key),'ADOPTION_QUERY_INVALID');
    if(['revision','offset','limit'].includes(key)){
      need(/^(0|[1-9][0-9]{0,11})$/.test(value)&&Number.isSafeInteger(Number(value)),'ADOPTION_QUERY_INVALID');
      result[key]=Number(value);need(key==='offset'||result[key]>0,'ADOPTION_QUERY_INVALID');
    }else result[key]=value;
  }
  return result;
}
async function sendOriginalFile(res,headers,value){
  let stream;
  try{
    need(value&&Number.isSafeInteger(value.revision)&&value.revision>0&&Number.isSafeInteger(value.bytes)&&value.bytes>=0&&value.bytes<=PORTABLE_LIMIT&&
      /^[a-f0-9]{64}$/.test(value.sha256)&&typeof value.filename==='string'&&value.filename.length>0&&value.filename.length<=512&&
      !/[\u0000-\u001f\u007f/\\]/.test(value.filename)&&typeof value.contentType==='string'&&value.contentType.length<=256&&!/[\r\n]/.test(value.contentType),
      'ADOPTION_FILE_DESCRIPTOR');
    const body=Buffer.isBuffer(value.body)?value.body:null;
    need(Boolean(body)!==Boolean(value.stream)&&(!value.stream||typeof value.stream[Symbol.asyncIterator]==='function'),'ADOPTION_FILE_DESCRIPTOR');
    if(body)need(body.length===value.bytes&&createHash('sha256').update(body).digest('hex')===value.sha256,'ADOPTION_FILE_CHANGED');
    stream=Readable.from((async function*(){
      let count=0;const hash=createHash('sha256');
      for await(const chunk of body?[body]:value.stream){
        const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
        count+=buffer.length;need(count<=value.bytes,'ADOPTION_FILE_CHANGED');hash.update(buffer);yield buffer;
      }
      need(count===value.bytes&&hash.digest('hex')===value.sha256,'ADOPTION_FILE_CHANGED');
    })());
    res.writeHead(200,{...headers,'Content-Type':value.contentType,'Content-Length':value.bytes,
      'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(value.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase()),
      'X-Content-SHA256':value.sha256,'X-Research-Dossier-Revision':String(value.revision)});
    await pipeline(stream,res);
  }finally{stream?.destroy();value?.stream?.destroy?.();}
}
export async function handleComparisonAdoptionRoute({store,dossierId,action,req,res,url,headers,readBody,send,setHeader}){
  if(!selected.has(action))return false;
  let result;
  if(req.method==='GET'){
    if(action==='comparison/adoptions')result=await store.comparisonAdoptions(dossierId,query(url,['revision','offset','limit']));
    else if(action==='comparison/adoption/source')result=await store.comparisonAdoptionSource(dossierId,query(url,['sourceId','revision','caseVersionId','section','offset','limit']));
    else if(action==='comparison/adoption')result=await store.comparisonAdoption(dossierId,query(url,['planId','requestId','revision']));
    else if(action==='comparison/adoption/file'){
      await sendOriginalFile(res,headers,await store.comparisonAdoptionFile(dossierId,query(url,['sourceId','runId','artifactId','revision'])));return true;
    }else if(action==='comparison/adoption/export'){
      await sendOriginalFile(res,headers,await store.exportComparisonAdoption(dossierId,query(url,['planId','revision','format'])));return true;
    }
  }else if(req.method==='POST'&&['comparison/adoption/preview','comparison/adoption/reviews'].includes(action)){
    query(url,[]);const input=await readBody(req,COMPARISON_ADOPTION_REQUEST_LIMIT);
    result=await store[action.endsWith('/preview')?'previewComparisonAdoption':'reviewComparisonAdoption'](dossierId,input);
  }
  if(result===undefined){send(405,{error:'ADOPTION_METHOD_NOT_ALLOWED'});return true;}
  need(result&&Number.isSafeInteger(result.revision)&&result.revision>0&&result.dossierId===dossierId,'ADOPTION_RESPONSE_INVALID');
  setHeader('X-Research-Dossier-Revision',String(result.revision));send(200,result);return true;
}
