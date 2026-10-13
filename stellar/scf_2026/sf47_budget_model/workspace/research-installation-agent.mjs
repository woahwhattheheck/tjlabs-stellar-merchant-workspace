// SPDX-License-Identifier: MIT
// Exact Research source custody over the original Grant service.
import {createHash,randomUUID} from 'node:crypto';
import {open,link,unlink,realpath,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,join,isAbsolute,resolve} from 'node:path';
export const RESEARCH_INSTALLATION_SCHEMA='stellar-forge.research-installation-source-desk.v1';
export const RESEARCH_INSTALLATION_LIMITS=Object.freeze({'project':480*1024*1024,'issued-package':256*1024*1024,'customer-return':256*1024*1024});
export const RESEARCH_INSTALLATION_MAX_ARCHIVE=2*1024*1024*1024;
export const RESEARCH_INSTALLATION_INPUT_KINDS=Object.freeze({
  'research-project':'project','research-issued-package':'issued-package','research-customer-return':'customer-return'});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=message=>Object.assign(new Error(message),{code:'GRANT_RESEARCH_INSTALLATION_INPUT'});
const need=(ok,message)=>{if(!ok)throw fail(message);};
const exact=(v,keys,required=keys)=>need(plain(v)&&Object.keys(v).every(k=>keys.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'Keep the complete declared Research Installation fields.');
const hash=b=>createHash('sha256').update(b).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
const shapes={caseId:/^operation-[a-f0-9]{32}$/,draftId:/^source-desk-[a-f0-9]{32}$/,
  requestId:/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/,fileId:/^research-[a-f0-9]{64}$/,
  preparationId:/^preparation-[a-f0-9]{64}$/,installationId:/^installation-[a-f0-9]{32}$/,
  sourceId:/^source-[a-f0-9]{32}$/,sha256:/^[a-f0-9]{64}$/};
const identity=(v,k)=>{need(typeof v==='string'&&shapes[k].test(v),'Keep the original '+k+'.');return v;};
const text=(v,label,max,required=true)=>{need(typeof v==='string'&&Array.from(v).length<=max&&!v.includes('\0')&&(!required||v.trim().length>0),'Keep the complete '+label+'.');return v;};
const integer=(v,min=0,max=10000000)=>{need(Number.isSafeInteger(v)&&v>=min&&v<=max,'Keep the original whole count or revision.');return v;};
const query=(route,v)=>route+'?'+new URLSearchParams(v).toString();
export function researchInstallationInputLimit(kind){return RESEARCH_INSTALLATION_LIMITS[RESEARCH_INSTALLATION_INPUT_KINDS[kind]]??null;}
export function researchInstallationUploadLimit(target,contentType,body){
  if(contentType!=='application/octet-stream'||!Buffer.isBuffer(body)||
    !/^\/api\/operations\/operation-[a-f0-9]{32}\/installation-sources\/source-desk-[a-f0-9]{32}\/research\/import$/.test(target.pathname))return null;
  return RESEARCH_INSTALLATION_LIMITS[target.searchParams.get('kind')]??null;
}
export function planResearchInstallationOperation(action,input){
  need(plain(input),'Use complete Research input.');
  identity(input.caseId,'caseId');identity(input.draftId,'draftId');
  const base='/api/operations/'+input.caseId+'/installation-sources/'+input.draftId+'/research';
  let route=base,options={mutation:false,timeoutMs:1830000,maxResponseBytes:64*1024*1024};
  const ids=['caseId','draftId'];
  if(action==='import'){
    exact(input,[...ids,'requestId','actor','kind','name','bytes','sha256','sourceUrl','observedAt']);
    identity(input.requestId,'requestId');identity(input.sha256,'sha256');text(input.actor,'operator',300);
    need(Object.hasOwn(RESEARCH_INSTALLATION_LIMITS,input.kind),'Select project, issued-package or customer-return.');
    text(input.name,'plain filename',200);need(!/[/\\\x00-\x1f\x7f]/.test(input.name)&&!['.','..'].includes(input.name),'Keep a plain original filename.');
    text(input.sourceUrl,'original source URL',4000,false);text(input.observedAt,'source observation',200);
    need(Buffer.isBuffer(input.bytes)||input.bytes instanceof Uint8Array,'Keep all original source bytes.');
    const bytes=Buffer.from(input.bytes);need(bytes.length>0&&bytes.length<=RESEARCH_INSTALLATION_LIMITS[input.kind]&&hash(bytes)===input.sha256,'The full source differs from its original SHA256 or per-kind capacity.');
    const {bytes:_bytes,...selected}=input;input={...clone(selected),bytes};
    route=query(base+'/import',{requestId:input.requestId,actor:input.actor,kind:input.kind,name:input.name,
      bytes:String(bytes.length),sha256:input.sha256,sourceUrl:input.sourceUrl,observedAt:input.observedAt});
    options={...options,body:bytes,contentType:'application/octet-stream',mutation:true,originalRequestId:input.requestId};
  }else if(action==='request'||action==='resume'){
    exact(input,[...ids,'requestId','actor']);identity(input.requestId,'requestId');text(input.actor,'original operator',300);input=clone(input);
    route=base+'/requests/'+input.requestId;
    if(action==='request')route=query(route,{actor:input.actor});
    else{route+='/resume';options={...options,body:{actor:input.actor},mutation:true,originalRequestId:input.requestId};}
  }else if(action==='original-request'){
    exact(input,[...ids,'requestId']);text(input.requestId,'original historical request',100);
    need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.requestId),'Keep the original Source Desk request identity.');
    input=clone(input);route=base+'/original-requests/'+encodeURIComponent(input.requestId);
  }else if(action==='inspect'){
    exact(input,[...ids,'fileId','expectedSha256']);identity(input.fileId,'fileId');identity(input.expectedSha256,'sha256');input=clone(input);
    route=base+'/inspect';options={...options,body:{fileId:input.fileId,expectedSha256:input.expectedSha256}};
  }else if(action==='template'){
    exact(input,[...ids,'body']);
    exact(input.body,['expectedVersion','sourceId','expectedSourceSha256','packetSourceId','expectedPacketSha256','workshareCaseId','installationId','expectedRevision','document'],
      ['expectedVersion','sourceId','expectedSourceSha256','workshareCaseId','installationId','expectedRevision']);
    const b=clone(input.body);integer(b.expectedVersion,1);identity(b.sourceId,'sourceId');identity(b.expectedSourceSha256,'sha256');
    if(b.packetSourceId!==undefined&&b.packetSourceId!==null)identity(b.packetSourceId,'sourceId');
    if(b.expectedPacketSha256!==undefined&&b.expectedPacketSha256!==null)identity(b.expectedPacketSha256,'sha256');
    need((b.packetSourceId==null)===(b.expectedPacketSha256==null),'Keep the original packet source and hash together.');
    text(b.workshareCaseId,'original Workshare case',500);integer(b.expectedRevision,0,500);
    if(b.installationId!==null)identity(b.installationId,'installationId');
    need(b.installationId===null?b.expectedRevision===0:b.expectedRevision>0,'Retain the original Installation revision.');
    if(b.document!==undefined)need(plain(b.document),'Retain the whole editable Installation document.');
    input={caseId:input.caseId,draftId:input.draftId,body:b};route=base+'/template';options={...options,body:b};
  }else if(action==='file'||action==='file-describe'){
    exact(input,[...ids,'fileId','expectedSha256']);identity(input.fileId,'fileId');identity(input.expectedSha256,'sha256');input=clone(input);
    route=query(base+'/files/'+input.fileId,{expectedSha256:input.expectedSha256,...(action==='file-describe'?{describe:'1'}:{})});
  }else if(action==='archive'||action==='archive-describe'){
    exact(input,[...ids,'preparationId','installationId','revision','expectedSha256'],
      [...ids,'preparationId','installationId','revision',...(action==='archive'?['expectedSha256']:[])]);
    identity(input.preparationId,'preparationId');identity(input.installationId,'installationId');integer(input.revision,1,500);
    if(input.expectedSha256!==undefined)identity(input.expectedSha256,'sha256');input=clone(input);
    route=query(base+'/preparations/'+input.preparationId+'/archive',{installationId:input.installationId,revision:String(input.revision),
      ...(input.expectedSha256?{expectedSha256:input.expectedSha256}:{}),...(action==='archive-describe'?{describe:'1'}:{})});
  }else throw fail('Choose a declared Research Installation operation.');
  return {action,input,route,options};
}
export async function performResearchInstallationOperation(plan,send){
  need(!['file','archive'].includes(plan.action),'Use downloadResearchInstallationFile for complete original binary files.');
  const result=await send(plan.route,plan.options);
  if(['import','request','resume'].includes(plan.action)){
    const v=result.value;
    need(v?.schema===RESEARCH_INSTALLATION_SCHEMA&&v.caseId===plan.input.caseId&&v.draftId===plan.input.draftId&&
      v.requestId===plan.input.requestId&&v.actor===plan.input.actor,'The result belongs to another original upload.');
    if(v.status==='COMPLETE'){
      const f=v.file;need(f&&shapes.fileId.test(f.id)&&f.sha256===v.request.sha256&&f.bytes===v.request.bytes,'Keep the original retained file descriptor.');
      if(plan.action==='import')for(const k of ['actor','kind','name','sha256','sourceUrl','observedAt'])
        need(v.request[k]===plan.input[k],'The completed original upload selection changed.');
      if(plan.action==='import')need(f.bytes===plan.input.bytes.length,'The original full upload byte count changed.');
    }
  }
  return result;
}
async function originalFileIdentity(filename,expected){
  const fd=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await fd.stat({bigint:true});need(before.isFile()&&before.size===BigInt(expected.bytes)&&!(before.mode&0o077n)&&(!process.getuid||before.uid===BigInt(process.getuid())),'The complete retained file must keep its exact size and private ownership.');
    const digest=createHash('sha256'),buffer=Buffer.alloc(1024*1024);let offset=0;
    while(offset<expected.bytes){const r=await fd.read(buffer,0,Math.min(buffer.length,expected.bytes-offset),offset);need(r.bytesRead>0,'The original file ended early.');digest.update(buffer.subarray(0,r.bytesRead));offset+=r.bytesRead;}
    const after=await fd.stat({bigint:true});need(['dev','ino','size','mtimeNs','ctimeNs'].every(k=>before[k]===after[k])&&digest.digest('hex')===expected.sha256,'The retained original file changed.');
  }finally{await fd.close();}
}
export async function receiveResearchInstallationFile(plan,send,filename){
  need(['file','archive'].includes(plan.action),'Choose a complete original file or archive.');
  need(typeof filename==='string'&&isAbsolute(filename)&&resolve(filename)===filename,'Use an absolute selected output filename.');
  const parent=dirname(filename),stat=await lstat(parent);
  need(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(parent)===parent&&!(stat.mode&0o077)&&
    (!process.getuid||stat.uid===process.getuid()),'Receive complete files in an existing private owned directory.');
  const description=await send(plan.route+'&describe=1',{mutation:false,timeoutMs:1830000,maxResponseBytes:1024*1024});
  const descriptor=description.value,maximum=plan.action==='archive'?RESEARCH_INSTALLATION_MAX_ARCHIVE:RESEARCH_INSTALLATION_LIMITS[descriptor?.kind];
  need(plain(descriptor)&&maximum&&Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0&&descriptor.bytes<=maximum&&
    descriptor.sha256===plan.input.expectedSha256,'The described complete file differs from the original selection.');
  if(plan.action==='file')need(descriptor.id===plan.input.fileId,'The original file ID changed.');
  const metadata={path:filename,bytes:descriptor.bytes,sha256:descriptor.sha256,name:descriptor.name??'Research_Installation.zip',
    contentType:plan.action==='archive'?'application/zip':'application/octet-stream'};
  try{await originalFileIdentity(filename,descriptor);return {file:metadata,descriptor,source:description.source,status:200,reused:true};}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=join(parent,'.research-receive-'+randomUUID()),fd=await open(temporary,'wx',0o600);
  let received=0;const digest=createHash('sha256');
  try{
    const response=await send(plan.route,{mutation:false,timeoutMs:1830000,maxResponseBytes:descriptor.bytes,
      responseSink:async chunk=>{received+=chunk.length;need(received<=descriptor.bytes,'The full download exceeds its exact descriptor.');digest.update(chunk);let offset=0;while(offset<chunk.length){const written=await fd.write(chunk,offset,chunk.length-offset);need(written.bytesWritten>0,'The original download could not be retained.');offset+=written.bytesWritten;}}});
    need(received===descriptor.bytes&&digest.digest('hex')===descriptor.sha256&&response.sha256===descriptor.sha256,'The original download differs from its full byte identity.');
    await fd.sync();await fd.close();
    try{await link(temporary,filename);}catch(error){if(error.code!=='EEXIST')throw error;await originalFileIdentity(filename,descriptor);}
    const directory=await open(parent,constants.O_RDONLY|(constants.O_DIRECTORY??0));try{await directory.sync();}finally{await directory.close();}
    return {file:{...metadata,contentType:response.mediaType},descriptor,source:response.source,status:response.status,reused:false};
  }finally{await fd.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
}
