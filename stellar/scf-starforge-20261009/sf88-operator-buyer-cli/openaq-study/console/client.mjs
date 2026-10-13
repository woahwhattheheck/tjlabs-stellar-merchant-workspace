// SPDX-License-Identifier: MIT
// A borrowed, instance-bound connection. Closing it never stops Applications.
import {createHash} from 'node:crypto';
import * as F from '../files.mjs';
import {readCustomerConnection,verifyCustomerConnection,customerJSON,privateOrigin} from './managed.mjs';
export async function openOpenAQCustomer({connectionFile,consoleId,configurationSha256,sourceSha256}={}){
 const binding=await readCustomerConnection(connectionFile);
 F.need(binding.consoleId===F.uuid(consoleId)&&binding.configurationSha256===F.hash(configurationSha256)&&
  (sourceSha256===undefined||binding.sourceIdentity.sha256===F.hash(sourceSha256)),'OPENAQ_CUSTOMER_BINDING_CHANGED');
 await verifyCustomerConnection(binding);
 return new OpenAQCustomer(binding);
}
export class OpenAQCustomer{
 #binding;#pending=new Set();#controllers=new Set();#closed=false;#closing=null;
 constructor(binding){this.#binding=structuredClone(binding);}
 get identity(){const b=this.#binding;return Object.freeze({consoleId:b.consoleId,instanceId:b.instanceId,
  configurationSha256:b.configurationSha256,sourceSha256:b.sourceIdentity.sha256});}
 async #work(work,signal){
  F.need(!this.#closed,'OPENAQ_CUSTOMER_CLIENT_CLOSED');F.signal(signal);
  const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
  signal?.addEventListener('abort',abort,{once:true});this.#controllers.add(controller);
  const promise=Promise.resolve().then(()=>work(controller.signal));this.#pending.add(promise);
  try{return await promise;}finally{controller.abort();this.#pending.delete(promise);this.#controllers.delete(controller);signal?.removeEventListener('abort',abort);}
 }
 #get(path,options={}){return this.#work(signal=>customerJSON(this.#binding,path,{signal}),options.signal);}
 #post(path,body,options={}){return this.#work(signal=>customerJSON(this.#binding,path,{method:'POST',body,signal}),options.signal);}
 view(options){return this.#get('/api/state',options);}
 review(selection,options){return this.#post('/api/review',selection,options);}
 submit(id,action,input={},options){return this.#post('/api/actions',{id:F.uuid(id),action,input},options);}
 job(id,options){return this.#get('/api/jobs/'+F.uuid(id),options);}
 prepare(id,review,options){return this.submit(id,'prepare',{selection:review.selection,reviewSha256:review.reviewSha256},options);}
 resumePreparation(id,review,options){return this.submit(id,'resumePreparation',{selection:review.selection,reviewSha256:review.reviewSha256},options);}
 run(id,input,options){return this.submit(id,'run',input,options);}
 recover(id,requestSha256,options){return this.submit(id,'recover',{requestSha256:F.hash(requestSha256)},options);}
 account(id,requestSha256,{finalize=false,...options}={}){F.need(typeof finalize==='boolean','OPENAQ_CUSTOMER_FINALIZE_INVALID');
  return this.submit(id,finalize?'finalize':'account',{requestSha256:F.hash(requestSha256)},options);}
 deliver(id,requestSha256,options){return this.submit(id,'deliver',{requestSha256:F.hash(requestSha256)},options);}
 export(id,{requestSha256,exportId},options){return this.submit(id,'export',{requestSha256:F.hash(requestSha256),exportId:F.id(exportId)},options);}
 receive(id,{receivingId,manifestSha256},options){return this.submit(id,'receive',{receivingId:F.id(receivingId),manifestSha256:F.hash(manifestSha256)},options);}
 reopen(id,options){return this.submit(id,'reopen',{},options);}
 decide(input,options){return this.#post('/api/approval',input,options);}
 cancel(id,options){return this.#post('/api/cancel',{id:F.uuid(id)},options);}
 rows({limit=100,...options}={}){return this.#get('/api/rows?limit='+encodeURIComponent(limit),options);}
 async wait(id,{signal,intervalMs=1000}={}){
  F.need(Number.isSafeInteger(intervalMs)&&intervalMs>=250&&intervalMs<=10000,'OPENAQ_CUSTOMER_POLL_INTERVAL_INVALID');
  while(true){
   F.signal(signal);const job=await this.job(id,{signal});
   if(job.state==='COMPLETE'||job.state==='ERROR')return job;
   await this.#work(own=>new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(Object.assign(new Error('OPERATOR_ABORTED'),{code:'OPERATOR_ABORTED'}));};
    const timer=setTimeout(()=>{own.removeEventListener('abort',abort);resolve();},intervalMs);
    own.addEventListener('abort',abort,{once:true});
   }),signal);
  }
 }
 /** Exact original file bytes. No path can be selected outside the host's manifest. */
 download({kind,name,sha256,bytes,limit=32*1024*1024,signal}={}){
  F.member(name);F.hash(sha256);
  F.need(['source','delivery'].includes(kind)&&Number.isSafeInteger(bytes)&&bytes>=0&&Number.isSafeInteger(limit)&&
   limit>=0&&limit<=256*1024*1024&&bytes<=limit,'OPENAQ_CUSTOMER_DOWNLOAD_LIMIT');
  return this.#work(async own=>{
   const b=this.#binding,url=privateOrigin(b.origin)+'/api/files?'+new URLSearchParams({kind,name});
   const response=await fetch(url,{headers:{authorization:'Bearer '+b.token},redirect:'manual',signal:own});
   F.need(response.ok&&response.headers.get('x-openaq-customer-instance')===b.instanceId&&
    response.headers.get('x-content-sha256')===sha256&&Number(response.headers.get('content-length'))===bytes,
   'OPENAQ_CUSTOMER_DOWNLOAD_CHANGED');
   const parts=[],hash=createHash('sha256');let count=0;
   try{
    for await(const part of response.body){count+=part.length;F.need(count<=bytes&&count<=limit,'OPENAQ_CUSTOMER_DOWNLOAD_LIMIT');
     parts.push(Buffer.from(part));hash.update(part);}
    F.need(count===bytes&&hash.digest('hex')===sha256,'OPENAQ_CUSTOMER_DOWNLOAD_CHANGED');
    return Buffer.concat(parts);
   }finally{if(!response.bodyUsed)await response.body?.cancel().catch(()=>{});}
  },signal);
 }
 close(){
  if(this.#closing)return this.#closing;this.#closed=true;
  for(const controller of this.#controllers)controller.abort();
  return this.#closing=Promise.allSettled([...this.#pending]).then(()=>{});
 }
}
