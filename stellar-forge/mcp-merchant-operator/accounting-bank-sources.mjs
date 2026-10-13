// MIT. Immutable Bank source preparations under the original accounting owner and lease.
import {constants} from 'node:fs';
import {open,mkdir,lstat,realpath,link,unlink,readdir} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {BANK_SOURCE_SCHEMA,BANK_SOURCE_MAX_BYTES,BANK_SOURCE_INPUT_TOTAL,BANK_SOURCE_REQUEST_BYTES,
 hashBytes,jsonBytes,canonicalHash,clone,need,exact,uuid,sha,integer,basename,key,validateBankSourceRequest}
 from './accounting-bank-sources-contract.mjs';
import {runBankSourceTransform,bankSourceView} from './accounting-bank-sources-core.mjs';
export {bankSourcesDefinitions,bankSourcesFileSelectors} from './catalog/accounting-bank-sources.mjs';
const PREFIX='merchant_accounting_bank_sources_';
const MAX_FILES=4100,MAX_OUTPUT_BYTES=768000000;
const flags=constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0);
const parse=b=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));
const equal=(a,b)=>canonicalHash(a)===canonicalHash(b);
const filePin=(name,bytes,role)=>({name,bytes:bytes.length,sha256:hashBytes(bytes),role});
async function directory(path,create=false){
 if(create)await mkdir(path,{mode:0o700}).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const st=await lstat(path);need(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid()&&await realpath(path)===path,'Keep source preparations in their original owned private directory.','CUSTODY');return path;
}
async function read(path,maximum=BANK_SOURCE_MAX_BYTES){
 const h=await open(path,flags);try{const a=await h.stat({bigint:true});need(a.isFile()&&a.size<=BigInt(maximum),'Select a complete regular retained file within its limit.','CUSTODY');
  const bytes=await h.readFile(),b=await h.stat({bigint:true});need(bytes.length===Number(a.size)&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs,'The original retained file changed during reading.','CUSTODY');return bytes;
 }finally{await h.close();}
}
async function optional(path,maximum){try{return await read(path,maximum);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function syncDirectory(path){const h=await open(path,flags);try{await h.sync();}finally{await h.close();}}
// Only explicit prepare/execute recovery calls this under the original workspace owner.
// A published file and its interrupted .writing-UUID link must share the same inode.
// Unknown partial files and all independent files are preserved.
async function settlePublicationLinks(path,pin){
 const first=await lstat(path,{bigint:true});
 if(first.nlink<=1n)return;
 need(first.isFile()&&!first.isSymbolicLink()&&first.uid===BigInt(process.getuid())&&(first.mode&0o077n)===0n,'Retain only the original private publication.','CUSTODY');
 await verify(path,pin);
 const current=await lstat(path,{bigint:true});
 need(first.dev===current.dev&&first.ino===current.ino&&first.size===current.size&&first.mtimeNs===current.mtimeNs&&first.ctimeNs===current.ctimeNs,'The selected publication changed during recovery.','CUSTODY');
 const parent=dirname(path),prefix=path.slice(parent.length+1)+'.writing-';let changed=false;
 for(const name of await readdir(parent)){
  if(!name.startsWith(prefix)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(name.slice(prefix.length)))continue;
  const temporary=join(parent,name);let candidate;try{candidate=await lstat(temporary,{bigint:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(!candidate.isFile()||candidate.isSymbolicLink()||candidate.dev!==current.dev||candidate.ino!==current.ino)continue;
  const selected=await lstat(path,{bigint:true});
  need(selected.dev===current.dev&&selected.ino===current.ino&&selected.size===current.size&&selected.mtimeNs===current.mtimeNs,'Preserve a changed original publication.','CUSTODY');
  await unlink(temporary);changed=true;
 }
 if(changed)await syncDirectory(parent);
}
async function settleReceiptLinks(path,receipt){for(const pin of receipt.files)await settlePublicationLinks(join(path,pin.name),pin);}
async function retain(path,bytes){
 const before=await optional(path,Math.max(bytes.length,1));if(before){need(before.equals(bytes),'A retained source preparation file differs. Preserve both selections.','CUSTODY');await settlePublicationLinks(path,filePin(path.slice(dirname(path).length+1),bytes,'output'));return;}
 const tmp=path+'.writing-'+randomUUID();let h,owned=false;
 try{h=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);owned=true;await h.writeFile(bytes);await h.sync();await h.close();h=null;
  try{await link(tmp,path);}catch(e){if(e.code!=='EEXIST')throw e;const actual=await read(path,Math.max(bytes.length,1));need(actual.equals(bytes),'Another retained source preparation differs.','CUSTODY');}
  await syncDirectory(resolve(path,'..'));
 }finally{if(h)await h.close();if(owned)await unlink(tmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
async function verify(path,pin){const bytes=await read(path,pin.bytes);need(bytes.length===pin.bytes&&hashBytes(bytes)===pin.sha256,'The complete original retained file differs: '+pin.name,'CUSTODY');return bytes;}
function checkedPin(p){exact(p,['name','bytes','sha256','role'],['name','bytes','sha256','role']);basename(p.name);integer(p.bytes,0,BANK_SOURCE_MAX_BYTES);sha(p.sha256);need(['request','input','output','result'].includes(p.role),'Retain the original file role.');return p;}
async function sourceAuthority(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),files=[],seen=new Set();
 async function visit(path){
  path=resolve(path);const name=relative(root,path);need(name&&!name.startsWith('..')&&!name.startsWith('/'),'Keep the original installed source inside its selected tree.','SOURCE');
  if(seen.has(name))return;seen.add(name);need(seen.size<=256,'The original source closure exceeds its declared bound.','SOURCE');
  const bytes=await read(path,16000000);files.push({path:name,bytes:bytes.length,sha256:hashBytes(bytes)});
  const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  for(const m of source.matchAll(/^(?:import\s+(?:[\w$]+\s*,?\s*)?(?:\{[^}]*\}|\*\s+as\s+[\w$]+)?\s*from|export\s+(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?)\s*from)\s*['"]([^'"]+)['"]/gm)){if(m[1].startsWith('.'))await visit(resolve(dirname(path),m[1]));}
  for(const m of source.matchAll(/^import\s*['"]([^'"]+)['"]/gm))if(m[1].startsWith('.'))await visit(resolve(dirname(path),m[1]));
 }
 await visit(fileURLToPath(import.meta.url));files.sort((a,b)=>a.path.localeCompare(b.path));return{files,sha256:canonicalHash(files)};
}
/** No independent writer, account or server: every request runs in workspace.serial. */
export class MerchantBankSources{
 constructor(workspace,{binding,readSource,configuredSources=[]}={}){
  need(workspace&&typeof workspace.serial==='function'&&typeof workspace.directory==='string'&&typeof binding==='function'&&typeof readSource==='function','Borrow the existing native accounting owner.');
  this.workspace=workspace;this.binding=binding;this.readSource=readSource;this.configuredSources=[...configuredSources].map(key).sort();
  this.root=join(resolve(workspace.directory),'bank-source-preparations');
 }
 async init(){sha(this.binding().workspaceId);this.source=await sourceAuthority();return this;}
 current(){return this.binding().workspaceId;}
 async rootReady(create=false){
  try{await directory(this.root,create);return true;}catch(e){if(!create&&e.code==='ENOENT')return false;throw e;}
 }
 async selected(id,create=false){
  uuid(id);if(!await this.rootReady(create))return null;const path=join(this.root,this.current(),id);
  try{await directory(join(this.root,this.current()),create);await directory(path,create);return path;}
  catch(e){if(!create&&e.code==='ENOENT')return null;throw e;}
 }
 async intent(path){
  const raw=await optional(join(path,'intent.json'),BANK_SOURCE_REQUEST_BYTES+2000000);if(!raw)return null;
  const value=parse(raw),request=validateBankSourceRequest(value.request);
  need(value.schema===BANK_SOURCE_SCHEMA&&value.workspaceId===this.current()&&value.preparationId===request.requestId&&value.workspaceId===request.workspaceId&&value.requestSha256===canonicalHash(request)&&value.createdAt===new Date(value.createdAt).toISOString(),'The retained request belongs to a different original source selection.','CUSTODY');
  need(Array.isArray(value.sourceFiles)&&value.sourceSha256===canonicalHash(value.sourceFiles),'Retain the exact original operating source authority.','CUSTODY');
  need(Array.isArray(value.inputs)&&value.inputs.length===request.inputs.length,'Retain every original input pin.','CUSTODY');
  for(let i=0;i<request.inputs.length;i++){const p=request.inputs[i],f=value.inputs[i];need(equal(f,{key:p.key,name:p.name,bytes:p.bytes,sha256:p.sha256,file:'input-'+p.key+'.bin'}),'The input custody selection changed.','CUSTODY');}
  return value;
 }
 preparedReceipt(intent,state,files,extra={}){
  return{schema:BANK_SOURCE_SCHEMA,workspaceId:intent.workspaceId,preparationId:intent.preparationId,requestSha256:intent.requestSha256,sourceSha256:intent.sourceSha256,
   kind:intent.request.kind,actor:intent.request.actor,createdAt:intent.createdAt,state,inputs:clone(intent.inputs),files,summary:null,viewType:null,...extra};
 }
 async receipt(path,{verifyFiles=true}={}){
  const intent=await this.intent(path);if(!intent)return null;
  const requestRaw=jsonBytes(intent.request),requestPin=filePin('request.json',requestRaw,'request'),files=[];
  const intentRaw=await read(join(path,'intent.json'),BANK_SOURCE_REQUEST_BYTES+2000000);files.push(filePin('intent.json',intentRaw,'request'));
  const actualRequest=await optional(join(path,'request.json'),BANK_SOURCE_REQUEST_BYTES);
  if(actualRequest){need(actualRequest.equals(requestRaw),'The retained original request changed.','CUSTODY');files.push(requestPin);}
  let completeInputs=!!actualRequest;
  for(const input of intent.inputs){const pin={name:input.file,bytes:input.bytes,sha256:input.sha256,role:'input'};
   const actual=await optional(join(path,pin.name),pin.bytes);if(!actual){completeInputs=false;continue;}
   need(actual.length===pin.bytes&&hashBytes(actual)===pin.sha256,'An original input copy changed.','CUSTODY');files.push(pin);
  }
  const failures=(await readdir(path)).filter(n=>/^failure-[a-f0-9-]{36}\.json$/.test(n)).sort();let lastFailure=null;
  for(const name of failures){const raw=await read(join(path,name),10000),failure=parse(raw);files.push(filePin(name,raw,'output'));if(!lastFailure||failure.at>lastFailure.at)lastFailure=failure;}
  const complete=await optional(join(path,'result.json'),8000000);
  if(complete){
   need(completeInputs,'A completed preparation lost its original request or input.','CUSTODY');
   const result=parse(complete);need(result.schema===BANK_SOURCE_SCHEMA&&result.state==='COMPLETE'&&result.workspaceId===intent.workspaceId&&result.preparationId===intent.preparationId&&result.requestSha256===intent.requestSha256&&result.sourceSha256===intent.sourceSha256&&result.kind===intent.request.kind&&result.actor===intent.request.actor&&result.createdAt===intent.createdAt&&equal(result.inputs,intent.inputs),'The saved result belongs to another retained operation.','CUSTODY');
   need(Array.isArray(result.files)&&result.files.length<=MAX_FILES,'Retain the complete output inventory.','CUSTODY');
   const names=new Set();for(const p of result.files){checkedPin(p);need(!names.has(p.name)&&p.role!=='result','Retain each original result member once.','CUSTODY');names.add(p.name);if(verifyFiles)await verify(join(path,p.name),p);}
   for(const pin of files)need(result.files.some(p=>equal(p,pin)),'The result omitted an original input.','CUSTODY');
   return{...result,files:[...result.files,filePin('result.json',complete,'result')]};
  }
  return this.preparedReceipt(intent,completeInputs?'PREPARED':'RETAINING',files,lastFailure?{lastFailure}:{});
 }
 async publicReceipt(id,options){
  const path=await this.selected(id);if(!path)return{workspaceId:this.current(),preparationId:id,state:'NOT_FOUND'};
  const receipt=await this.receipt(path,options);need(receipt,'The existing operation directory has no original intent. Preserve it for custody review.','CUSTODY');return receipt;
 }
 async prepare(request){
  request=validateBankSourceRequest(request);need(request.workspaceId===this.current(),'Select this original accounting workspace identity.','WORKSPACE');
  const path=await this.selected(request.requestId,true),existing=await this.intent(path);
  if(existing)need(existing.requestSha256===canonicalHash(request)&&equal(existing.request,request),'This request ID already retains another original preparation.','REQUEST_CONFLICT');
  else{
   const names=await readdir(path);need(names.every(n=>/^intent\.json\.writing-[a-f0-9-]{36}$/.test(n)),'An unbound original operation contains existing files. Preserve them.','CUSTODY');
   const intent={schema:BANK_SOURCE_SCHEMA,workspaceId:request.workspaceId,preparationId:request.requestId,requestSha256:canonicalHash(request),
    createdAt:new Date().toISOString(),sourceSha256:this.source.sha256,sourceFiles:this.source.files,request,inputs:request.inputs.map(p=>({key:p.key,name:p.name,bytes:p.bytes,sha256:p.sha256,file:'input-'+p.key+'.bin'}))};
   await retain(join(path,'intent.json'),jsonBytes(intent));
  }
  const intent=await this.intent(path);
  await settlePublicationLinks(join(path,'intent.json'),filePin('intent.json',jsonBytes(intent),'request'));
  if(await optional(join(path,'result.json'),8000000)){const completed=await this.receipt(path);await settleReceiptLinks(path,completed);return completed;}
  need(intent.sourceSha256===this.source.sha256,'This unfinished preparation requires its exact retained original source edition. Preserve the request and reopen that installed edition.','SOURCE_CHANGED');
  await retain(join(path,'request.json'),jsonBytes(intent.request));
  for(const selected of intent.request.inputs){
   const target=join(path,'input-'+selected.key+'.bin'),current=await optional(target,selected.bytes);
   if(current){need(current.length===selected.bytes&&hashBytes(current)===selected.sha256,'The retained input changed.','CUSTODY');await settlePublicationLinks(target,{name:'input-'+selected.key+'.bin',bytes:selected.bytes,sha256:selected.sha256});continue;}
   let bytes;
   if(selected.sourceAlias!==undefined)bytes=Buffer.from(await this.readSource(selected.sourceAlias,BANK_SOURCE_MAX_BYTES));
   else{
    need(selected.preparationId!==request.requestId,'A preparation cannot read its own unfinished input.','INPUT');
    const parent=await this.selected(selected.preparationId);need(parent,'Select an original retained source preparation.','NOT_FOUND');
    const receipt=await this.receipt(parent,{verifyFiles:false});need(receipt?.state==='COMPLETE','The selected source preparation must be complete.','NOT_READY');
    const pin=receipt.files.find(f=>f.name===selected.file);need(pin&&pin.bytes===selected.bytes&&pin.sha256===selected.sha256,'The selected retained file differs from the original pin.','INPUT_CHANGED');bytes=await verify(join(parent,pin.name),pin);
   }
   need(bytes.length===selected.bytes&&hashBytes(bytes)===selected.sha256,'The configured source differs from the reviewed complete byte/SHA pin: '+selected.key,'INPUT_CHANGED');await retain(target,bytes);
  }
  return this.receipt(path);
 }
 async execute(id,expected){
  uuid(id);sha(expected);const path=await this.selected(id);need(path,'Retain the complete source request first.','NOT_FOUND');
  const before=await this.receipt(path);need(before&&before.requestSha256===expected,'Select the exact retained request SHA.','REQUEST_CONFLICT');
  await settleReceiptLinks(path,before);
  if(before.state==='COMPLETE')return before;need(before.state==='PREPARED','Resume original input retention before execution.','NOT_READY');
  const intent=await this.intent(path),inputs=new Map();
  need(intent.sourceSha256===this.source.sha256,'Resume unfinished execution through its exact original installed source edition.','SOURCE_CHANGED');
  for(const p of intent.inputs)inputs.set(p.key,await verify(join(path,p.file),{name:p.file,bytes:p.bytes,sha256:p.sha256}));
  let result;
  try{
   const generated=await runBankSourceTransform(intent.request,inputs,intent.createdAt);let total=0;
   need(generated.files.size+before.files.length+1<=MAX_FILES,'This complete preparation exceeds the retained file inventory limit.','CAPACITY');
   for(const [name,bytes]of generated.files){basename(name);total+=bytes.length;need(!before.files.some(p=>p.name===name)&&name!=='result.json'&&bytes.length<=BANK_SOURCE_MAX_BYTES&&total<=MAX_OUTPUT_BYTES,'The complete generated outputs exceed the 192 MB file or 768 MB aggregate budget.','CAPACITY');}
   const files=[...before.files];for(const[name,bytes]of generated.files){await retain(join(path,name),bytes);files.push(filePin(name,bytes,'output'));}
   result=this.preparedReceipt(intent,'COMPLETE',files,{summary:generated.summary,viewType:generated.viewType});
  }catch(error){
   const failure={code:String(error.code??'SOURCE_ERROR'),message:String(error.message??error).slice(0,4000),at:new Date().toISOString()};
   try{await retain(join(path,'failure-'+randomUUID()+'.json'),jsonBytes(failure));}catch(recordError){error.custodyError={code:recordError.code??'ERROR',message:String(recordError.message)};}
   // The immutable intent remains prepared; a later identical call reuses its complete inputs.
   throw error;
  }
  // Publication can succeed before a sync/readback error. Its immutable result must
  // never acquire a later failure member that was absent from its frozen inventory.
  await retain(join(path,'result.json'),jsonBytes(result));return this.receipt(path);
 }
 async view(args){
  const path=await this.selected(args.preparationId);need(path,'Select a retained preparation.','NOT_FOUND');const result=await this.receipt(path,{verifyFiles:false});
  need(result?.state==='COMPLETE','Execute this retained preparation before reading its outputs.','NOT_READY');
  let type=result.viewType,name=type==='collection'?'collection.json':type==='library'?'library.json':'review.json';
  if(args.section&&args.section!=='items'){need(type==='inspection'&&args.itemId,'Choose an original inspected item before reading its full report.');uuid(args.itemId);name='report-'+args.itemId+'.json';type='report';}
  const pin=result.files.find(p=>p.name===name);need(pin,'This original source has no parsed report; review its retained problem.','NO_REPORT');
  const value=parse(await verify(join(path,name),pin)),view=bankSourceView(type,value,args);
  return{workspaceId:this.current(),preparationId:result.preparationId,requestSha256:result.requestSha256,outputSha256:pin.sha256,view};
 }
 async file(args){
  return this.workspace.serial(async()=>{
   const path=await this.selected(args.bankSourcePreparationId);need(path,'Select a retained preparation.','NOT_FOUND');const result=await this.receipt(path,{verifyFiles:false});
   const pin=result?.files.find(p=>p.name===args.file);need(pin,'Choose one complete original file from its receipt.','FILE');basename(pin.name);
   const handle=await open(join(path,pin.name),flags);let transferred=false;
   try{const st=await handle.stat();need(st.isFile()&&st.size===pin.bytes,'The retained complete file changed.','CUSTODY');
    const original={readonlyFileHandle:handle,bytes:pin.bytes,sha256:pin.sha256,name:pin.name,type:pin.name.endsWith('.json')?'application/json':'application/octet-stream'};transferred=true;return original;
   }finally{if(!transferred)await handle.close();}
  });
 }
 async call(operation,args){
  return this.workspace.serial(async()=>{
   let result;switch(operation.slice(PREFIX.length)){
    case 'status':result={workspaceId:this.current(),configuredSources:this.configuredSources,sourceSha256:this.source.sha256,limits:{inputBytes:BANK_SOURCE_INPUT_TOTAL,inputFileBytes:BANK_SOURCE_MAX_BYTES,requestBytes:BANK_SOURCE_REQUEST_BYTES,outputBytes:MAX_OUTPUT_BYTES,outputFiles:MAX_FILES}};break;
    case 'source':{key(args.sourceAlias);basename(args.name);const bytes=Buffer.from(await this.readSource(args.sourceAlias,BANK_SOURCE_MAX_BYTES));need(bytes.length>0&&bytes.length<=BANK_SOURCE_MAX_BYTES,'Select a complete nonempty configured input.');result={workspaceId:this.current(),sourceAlias:args.sourceAlias,name:args.name,bytes:bytes.length,sha256:hashBytes(bytes)};break;}
    case 'prepare':result=await this.prepare(args.request);break;
    case 'execute':result=await this.execute(args.preparationId,args.expectedRequestSha256);break;
    case 'request':result=await this.publicReceipt(args.preparationId);break;
    case 'view':result=await this.view(args);break;
    case 'list':{
     const offset=integer(args.offset??0),limit=integer(args.limit??25,1,100);let ids=[];
     if(await this.rootReady()){try{await directory(join(this.root,this.current()));ids=(await readdir(join(this.root,this.current()),{withFileTypes:true})).filter(d=>d.isDirectory()&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(d.name)).map(d=>d.name).sort();}catch(e){if(e.code!=='ENOENT')throw e;}}
     const items=[];for(const id of ids.slice(offset,offset+limit)){const row=await this.publicReceipt(id,{verifyFiles:false});if(jsonBytes([...items,row]).length>4000000){need(items.length,'Download this original preparation receipt through its request identity.','VIEW_SIZE');break;}items.push({workspace:args.workspace,...row});}
     result={workspaceId:this.current(),inventorySha256:hashBytes(jsonBytes(ids)),page:{offset,limit,total:ids.length,items}};break;
    }
    default:need(false,'Choose a declared source preparation operation.');
   }
   return{workspace:args.workspace,...result};
  });
 }
}
