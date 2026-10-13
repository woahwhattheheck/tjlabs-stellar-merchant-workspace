// SPDX-License-Identifier: MIT
/** Original standalone Installation preparation through named private host declarations. */
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import {resolve,dirname,isAbsolute,join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {exact,identifier,line,plain,failure} from './config.mjs';
import {RetainedFileReads,MAX_RETAINED_CHUNK_BYTES} from './retained-file-reads.mjs';

const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const PREFIX='merchant_ckan_dcat_installation_';
const INPUT_KINDS=['archive','case','seed','bindings','selection','prior-preparation','saved-installation','following-review'];
const MAX_ARCHIVE=128*1024*1024,MAX_JSON=8*1024*1024,MAX_METADATA=128*1024*1024,MAX_REPLY=65536;
const need=(ok,code,message)=>{if(!ok)throw failure(code,message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const id=value=>{need(typeof value==='string'&&UUID.test(value),'INVALID_PARAMS','Use the same original request UUID.');return value;};
const sha=value=>{need(typeof value==='string'&&HASH.test(value),'INVALID_PARAMS','Use the exact full-file SHA-256 or immutable file ID.');return value;};
const count=(value,fallback,maximum)=>{value??=fallback;need(Number.isSafeInteger(value)&&value>=0&&value<=maximum,'INVALID_PARAMS','Use the declared nonnegative page range.');return value;};
function page(input){const offset=count(input.offset,0,Number.MAX_SAFE_INTEGER),limit=count(input.limit,25,100);need(limit>0,'INVALID_PARAMS','Select a page limit from1 through100.');return{offset,limit};}
function hostPath(value,base){
 need(typeof value==='string'&&value&&!value.includes('\0'),'CONFIGURATION_ERROR','Declare the original private host path.');
 return isAbsolute(value)?resolve(value):resolve(base,value);
}
async function canonicalFuture(path){
 let ancestor=path,tail=[];
 for(;;){
  try{return join(await realpath(ancestor),...tail.reverse());}
  catch(error){if(error.code!=='ENOENT')throw error;const parent=dirname(ancestor);if(parent===ancestor)throw error;tail.push(ancestor.slice(parent.length+(parent.endsWith('/')?0:1)));ancestor=parent;}
 }
}
const contains=(parent,child)=>{const rel=relative(parent,child);return rel===''||!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../');};

export async function readDcatInstallationConfiguration(raw,{base,workspaceDirectories=[]}={}){
 if(raw===undefined)return Object.create(null);
 need(plain(raw)&&Object.keys(raw).length<=32,'CONFIGURATION_ERROR','Declare at most32 named Installation preparation roots.');
 const result=Object.create(null),roots=[];
 for(const [alias,item]of Object.entries(raw)){
  identifier(alias,'Installation preparation alias');exact(item,['directory','label','inputs'],['directory']);
  const directory=hostPath(item.directory,base),canonical=await canonicalFuture(directory);
  need(canonical===directory,'CONFIGURATION_ERROR','Use a canonical preparation directory without symbolic-link ancestors.');
  need(!workspaceDirectories.some(workspace=>contains(workspace,canonical)||contains(canonical,workspace))&&
    !roots.some(root=>contains(root,canonical)||contains(canonical,root)),
    'CONFIGURATION_ERROR','Keep each preparation root separate from catalogue projects and other preparation roots.');
  roots.push(canonical);
  need(item.inputs===undefined||plain(item.inputs)&&Object.keys(item.inputs).length<=64,
    'CONFIGURATION_ERROR','Declare at most64 original Installation input aliases.');
  const inputs=Object.create(null);
  for(const [alias,input]of Object.entries(item.inputs??{})){
   identifier(alias,'Installation input alias');exact(input,['file','kind','label'],['file','kind']);
   need(INPUT_KINDS.includes(input.kind),'CONFIGURATION_ERROR','Choose archive, case, seed, bindings or selection.');
   inputs[alias]={file:hostPath(input.file,base),kind:input.kind,label:line(input.label??alias,'Installation input label')};
  }
  result[alias]={directory:canonical,label:line(item.label??alias,'Installation label'),inputs};
 }
 return result;
}
function metadata(value){
 const bytes=Buffer.from(JSON.stringify(value)+'\n');
 need(bytes.length<=MAX_METADATA,'DCAT_INSTALLATION_METADATA_LIMIT','Read the complete retained source-report attachment for this larger inventory.');
 return{bytes,sha256:hash(bytes)};
}
function metadataSummary(installation,requestId,value){
 const selected=metadata(value);
 if(selected.bytes.length<=MAX_REPLY)return{installation,...value};
 return{installation,requestId,type:value.type,status:value.status??'COMPLETE',availability:'DOWNLOAD_REQUIRED',
  metadata:{name:'installation-request-'+requestId+'.json',bytes:selected.bytes.length,sha256:selected.sha256,
    read:{requestId,expectedSha256:selected.sha256}},
  message:'The complete original request/result exceeds one tool response. Read every SHA-pinned metadata chunk and listed attachment.'};
}
function rowsPage(rows,input){
 const {offset,limit}=page(input),selected=[];let size=0,next=offset;
 for(const value of rows.slice(offset,offset+limit)){
  const bytes=Buffer.byteLength(JSON.stringify(value));
  if(selected.length&&size+bytes>MAX_REPLY)break;
  if(bytes>MAX_REPLY){
   selected.push({requestId:value.requestId,type:value.type,status:value.status,availability:'DOWNLOAD_REQUIRED',
    message:'Select this original request with get and read its complete metadata.'});
  }else{selected.push(value);size+=bytes;}
  next++;
 }
 return{rows:selected,page:{offset,limit,total:rows.length,nextOffset:next<rows.length?next:null}};
}
export class MerchantDcatInstallations{
 #definitions;#privateFile;#entries=new Map();#opening=new Map();#closing=false;#closed;
 #reads=new RetainedFileReads({errorPrefix:'DCAT_INSTALLATION_FILE'});
 constructor(definitions,{privateFile}={}){this.#definitions=definitions??{};this.#privateFile=privateFile;}
 get summary(){return{installations:Object.entries(this.#definitions).map(([installation,value])=>{
  const current=this.#entries.get(installation);return{installation,label:value.label,open:Boolean(current),
   opening:this.#opening.has(installation),closing:Boolean(current?.closing),instanceId:current?.instanceId??null,
   inputAliases:Object.keys(value.inputs)};
 }),...this.#reads.summary};}
 #definition(alias){identifier(alias,'Installation preparation alias');const value=this.#definitions[alias];
  need(value,'DCAT_INSTALLATION_NOT_CONFIGURED','Select one host-declared Installation alias.');return value;}
 #entry(alias){this.#definition(alias);const entry=this.#entries.get(alias);need(entry&&!entry.closing,
  'DCAT_INSTALLATION_NOT_OPEN','Open this original preparation alias and retain its instance ID.');return entry;}
 #scope(alias){return'dcat-installation:'+alias+':'+this.#definition(alias).directory;}
 async #open(alias){
  const definition=this.#definition(alias);
  if(this.#entries.has(alias))return{installation:alias,instanceId:this.#entry(alias).instanceId,state:'OPEN'};
  if(this.#opening.has(alias))return this.#opening.get(alias);
  const pending=(async()=>{
   const {createDcatInstallationService}=await import('../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/dcat-installation/service.mjs');
   const service=await createDcatInstallationService({directory:definition.directory});
   if(this.#closing){await service.close();throw failure('DCAT_INSTALLATION_CLOSING','The original owner is closing.');}
   const entry={service,instanceId:randomUUID(),pending:new Set(),closing:null};this.#entries.set(alias,entry);
   return{installation:alias,instanceId:entry.instanceId,state:'OPEN'};
  })();this.#opening.set(alias,pending);
  try{return await pending;}finally{this.#opening.delete(alias);}
 }
 async #closeEntry(alias,entry){
  if(!entry.closing)entry.closing=(async()=>{
   await Promise.allSettled([...entry.pending]);await this.#reads.closeScope(this.#scope(alias));
   await entry.service.close();this.#entries.delete(alias);
   return{installation:alias,instanceId:entry.instanceId,state:'CLOSED'};
  })().catch(error=>{entry.closing=null;throw error;});
  return entry.closing;
 }
 async #selectedFile(entry,input){
  if(input.kind==='source'){
   id(input.inspectionId);
   need(typeof input.path==='string'&&input.path.length>0&&input.path.length<=4096,
    'INVALID_PARAMS','Select one exact path from the original whole archive inventory.');
   const file=await entry.service.sourceFile({inspectionId:input.inspectionId,path:input.path});
   const selected={path:file.path??file.file,name:file.downloadName??input.path.split('/').at(-1),
    bytes:file.bytes,sha256:file.sha256,mediaType:file.mediaType??'application/octet-stream'};
   need(typeof selected.path==='string'&&Number.isSafeInteger(selected.bytes)&&selected.bytes>=0&&HASH.test(selected.sha256??''),
    'DCAT_INSTALLATION_FILE_CHANGED','The original member reader must return its complete file identity.');
   return selected;
  }
  need(input.kind===undefined||input.kind==='retained','INVALID_PARAMS','Select retained or source.');
  const value=await entry.service.file(sha(input.fileId));return{path:value.path,...value.descriptor};
 }
 async #execute(entry,installation,name,input){
  const service=entry.service;
  const completed=async action=>{await action;return metadataSummary(installation,input.requestId,await service.get(input.requestId));};
  switch(name.slice(PREFIX.length)){
   case 'inputs':{
    const rows=[];
    for(const [input,definition]of Object.entries(this.#definition(installation).inputs)){
     try{const file=await this.#privateFile(definition.file,definition.kind==='archive'?MAX_ARCHIVE:MAX_JSON);
      rows.push({input,kind:definition.kind,label:definition.label,...file,available:true});}
     catch(error){rows.push({input,kind:definition.kind,label:definition.label,available:false,error:{code:error.code??'INPUT_UNAVAILABLE'}});}
    }return{installation,...rowsPage(rows,input)};
   }
   case 'import':{
    id(input.requestId);sha(input.expectedSha256);identifier(input.input,'Installation input alias');
    const selected=this.#definition(installation).inputs[input.input];
    need(selected,'DCAT_INSTALLATION_INPUT_NOT_CONFIGURED','Use a host-declared original input alias.');
    const original=await this.#privateFile(selected.file,selected.kind==='archive'?MAX_ARCHIVE:MAX_JSON);
    need(original.sha256===input.expectedSha256,'DCAT_INSTALLATION_INPUT_CHANGED','Inspect the original alias again before import.');
    return completed(service.importFile({requestId:input.requestId,
     path:selected.file,kind:selected.kind,expectedSha256:input.expectedSha256}));
   }
   case 'inspect':id(input.requestId);sha(input.archiveId);
    return completed(service.inspect(input));
   case 'template':id(input.requestId);id(input.inspectionId);sha(input.caseId);sha(input.seedId);
    return completed(service.template(input));
   case 'prepare':{
    id(input.requestId);id(input.inspectionId);for(const key of ['caseId','seedId','bindingsId','selectionId'])sha(input[key]);
    need(typeof input.selectionSourceId==='string'&&input.selectionSourceId.length>0&&input.selectionSourceId.length<=200,
     'INVALID_PARAMS','Use the selected scope file’s original Operations source ID.');
    return completed(service.prepare(input));
   }
   case 'following_template':
   case 'following_prepare':{
    id(input.requestId);id(input.beforeInspectionId);id(input.afterInspectionId);
    for(const key of ['priorPreparationId','installationId','caseId'])sha(input[key]);
    need(typeof input.afterArchiveSourceId==='string'&&input.afterArchiveSourceId.length>0&&input.afterArchiveSourceId.length<=200,
     'INVALID_PARAMS','Select the later archive source from the original case.');
    if(name.endsWith('_following_template'))return completed(service.followingTemplate(input));
    sha(input.reviewId);need(typeof input.reviewSourceId==='string'&&input.reviewSourceId.length>0&&input.reviewSourceId.length<=200,
     'INVALID_PARAMS','Select the actual complete reviewed case source.');
    return completed(service.followingPrepare(input));
   }
   case 'requests':{
    const selection=page(input),result=await service.list(selection);
    const bounded=rowsPage(result.rows,{offset:0,limit:selection.limit});
    const consumed=bounded.page.nextOffset??result.rows.length;
    return{installation,rows:bounded.rows,page:{...selection,total:result.total,
     nextOffset:consumed<result.rows.length?selection.offset+consumed:result.nextOffset}};
   }
   case 'get':return metadataSummary(installation,id(input.requestId),await service.get(input.requestId));
   case 'metadata_read':{
    const requestId=id(input.requestId);sha(input.expectedSha256);
    const result=await this.#reads.read({scope:this.#scope(installation),key:'request:'+requestId,
     kind:'dcat-installation-request',directory:this.#definition(installation).directory,
     expectedSha256:input.expectedSha256,readId:input.readId,offset:input.offset,limit:input.limit,
     load:async()=>({name:'installation-request-'+requestId+'.json',type:'application/json',
      bytes:metadata(await service.get(requestId)).bytes})});
    return{installation,requestId,...result};
   }
   case 'files':{
    const value=await service.get(id(input.requestId));
    return{installation,requestId:input.requestId,status:value.status,...rowsPage(value.files??[],input)};
   }
   case 'file':{
    const {path,...file}=await this.#selectedFile(entry,input);
    return{installation,file,read:{...input,expectedSha256:file.sha256}};
   }
   case 'file_read':{
    sha(input.expectedSha256);
    const key=input.kind==='source'?'source:'+id(input.inspectionId)+':'+input.path:'retained:'+sha(input.fileId);
    const result=await this.#reads.read({scope:this.#scope(installation),key,kind:'dcat-installation-file',
     directory:this.#definition(installation).directory,expectedSha256:input.expectedSha256,
     readId:input.readId,offset:input.offset,limit:input.limit,load:async()=>{
      const selected=await this.#selectedFile(entry,input);
      need(selected.sha256===input.expectedSha256,'DCAT_INSTALLATION_FILE_CHANGED','Select the same complete original file hash.');
      let handle=await open(selected.path,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{
       const stat=await handle.stat();need(stat.isFile(),'DCAT_INSTALLATION_FILE_CHANGED','Use the retained original regular file.');
       const result={readonlyFileHandle:handle,name:selected.name,bytes:selected.bytes,sha256:selected.sha256,
        type:selected.mediaType??'application/octet-stream'};handle=null;return result;
      }finally{await handle?.close();}
     }});
    return{installation,...result};
   }
   case 'file_release':await this.#reads.release(this.#scope(installation),id(input.readId));
    return{installation,readId:input.readId,state:'RELEASED'};
   default:throw failure('TOOL_NOT_FOUND','Unknown Installation preparation operation.');
  }
 }
 async call(name,args={}){
  need(!this.#closing,'DCAT_INSTALLATION_CLOSING','The original preparation owner is draining.');
  if(name===PREFIX+'aliases')return this.summary;
  const {installation,...input}=args;
  if(name===PREFIX+'open')return this.#open(installation);
  const entry=this.#entry(installation);
  if(name===PREFIX+'close'){
   need(entry.instanceId===id(input.instanceId),'DCAT_INSTALLATION_INSTANCE_CHANGED','Close only this inspected owned instance.');
   return this.#closeEntry(installation,entry);
  }
  const pending=Promise.resolve().then(()=>this.#execute(entry,installation,name,input));entry.pending.add(pending);
  try{return await pending;}finally{entry.pending.delete(pending);}
 }
 close(){
  if(!this.#closed){this.#closing=true;this.#closed=(async()=>{
   await Promise.allSettled([...this.#opening.values()]);
   const outcomes=await Promise.allSettled([...this.#entries].map(([alias,entry])=>this.#closeEntry(alias,entry)));
   await this.#reads.close();
   if(outcomes.some(value=>value.status==='rejected'))throw failure('DCAT_INSTALLATION_CLOSE_INCOMPLETE',
    'A preparation owner or retained original file is still draining; keep its same directory and retry close.');
  })().catch(error=>{this.#closed=null;throw error;});}
  return this.#closed;
 }
}
