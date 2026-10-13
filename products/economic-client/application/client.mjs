// SPDX-License-Identifier: MIT
import { readFile, lstat } from 'node:fs/promises';
export async function readConnection(path){
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)||(process.getuid&&info.uid!==process.getuid()))
  throw new Error('Use the private original operator connection file');
 const value=JSON.parse(await readFile(path,'utf8'));
 if(value.schema!=='tjl.economic-client-connection.v1')throw new Error('Unknown operator connection');
 return value;
}
export function createClient({baseUrl,token,fetchImpl=globalThis.fetch,timeoutMs=600000}){
 const origin=new URL(baseUrl);
 if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||
 origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Use the original loopback operator origin');
 if(typeof token!=='string'||!token||/[\r\n]/.test(token))throw new Error('Use the original operator capability');
 async function request(path,{body,raw=false,binary=false}={}){
  const response=await fetchImpl(origin.origin+path,{method:body===undefined?'GET':'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':binary?'application/gzip':'application/json'})},
   body:body===undefined?undefined:binary?body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  const blocks=[];let length=0;
  for await(const block of response.body){length+=block.length;if(length>512*1024*1024)throw new Error('Complete operator response exceeds 512 MiB');blocks.push(Buffer.from(block));}
  const content=Buffer.concat(blocks,length);
  if(!response.ok){let detail=content.toString('utf8');try{detail=JSON.parse(detail).error;}catch{}throw Object.assign(new Error(detail),{status:response.status});}
  return raw?{body:content,content_type:response.headers.get('content-type')}:JSON.parse(content.toString('utf8'));
 }
 return Object.freeze({
  state:()=>request('/api/state'),
  action:(action,input={},operation_id)=>request('/api/action',{body:{action,input,...(operation_id?{operation_id}:{})}}),
  reviewFile:(id,name)=>request('/api/review-file?id='+encodeURIComponent(id)+'&name='+encodeURIComponent(name),{raw:true}),
  reviewReturnFile:id=>request('/api/review-return?id='+encodeURIComponent(id),{raw:true}),
  receiveReview:(body,operationId)=>request('/api/review-return?operation_id='+encodeURIComponent(operationId),{body,binary:true}),
  exportProject:()=>request('/api/project',{raw:true}),
  importProject:body=>request('/api/project',{body,binary:true}),
  reportFile:(id,name)=>request('/api/file?id='+encodeURIComponent(id)+'&name='+encodeURIComponent(name),{raw:true}),
  companionFile:(id,name)=>request('/api/companion-file?id='+encodeURIComponent(id)+'&name='+encodeURIComponent(name),{raw:true}),
 });
}
