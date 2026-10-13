// MIT. Authenticated merchant access to the original Invoice & Settlement operator.
import { constants } from 'node:fs';
import { mkdir,open,realpath } from 'node:fs/promises';
import { basename,dirname,isAbsolute,join,resolve } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { definitions,INVOICE_NATIVE_METHODS } from './catalog/invoice-settlement-workspace.mjs';
import { exact,failure,identifier,line,plain,privateSupportDirectory } from './host-files.mjs';
import { RetainedFileReads } from './retained-file-reads.mjs';
import { openInvoiceSettlementOperator,loadInvoiceSettlementConfiguration } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/operator.mjs';
import { files as nativeFiles } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/common.mjs';
export const INVOICE_WORKSPACE_CONNECTION_SCHEMA='stellar-forge.invoice-workspace-connection.v1';
const INPUT_LIMIT=64*1024*1024,HASH=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const byName=new Map(definitions.map(x=>[x[0],x]));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,message)=>{if(!value)throw failure('INVOICE_ARGUMENT',message);};
function pathFor(value, base) {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw failure('CONFIGURATION_ERROR', 'Declare a nonempty original host path.');
  return isAbsolute(value) ? resolve(value) : resolve(base, value);
}
function integer(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const result = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(result) || result < 0 || result > maximum) throw failure('INVALID_PARAMS', 'Use an integer within the declared limits.');
  return result;
}
function parse(bytes) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('INVOICE_INVALID_JSON', 'The selected original file must contain complete UTF-8 JSON.'); }
}
function validate(value, schema, path) {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (!types.some(type => type === actual || type === 'integer' && Number.isSafeInteger(value)))
    throw failure('INVALID_PARAMS', path + ' has the wrong value type.');
  if (schema.enum && !schema.enum.includes(value)) throw failure('INVALID_PARAMS', path + ' must use one of the declared choices.');
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)))
    throw failure('INVALID_PARAMS', path + ' is outside the declared limits.');
  if (typeof value === 'string' && (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)
      || schema.pattern && !new RegExp(schema.pattern).test(value)))
    throw failure('INVALID_PARAMS', path + ' has an invalid length or format.');
  if (Array.isArray(value)) {
    if (value.length > (schema.maxItems ?? Infinity) || value.length < (schema.minItems ?? 0)
        || schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length)
      throw failure('INVALID_PARAMS', path + ' must use a complete valid selection without duplicate members.');
    if (schema.items) for (let index = 0; index < value.length; index++) validate(value[index], schema.items, path + '[' + index + ']');
  }
  if (plain(value) && plain(schema.additionalProperties))
    for (const [key, item] of Object.entries(value)) validate(item, schema.additionalProperties, path + '.' + key);
}
async function originalFile(path, { consume = false, maximum = INPUT_LIMIT } = {}) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(maximum)) throw failure('INVOICE_INPUT_INVALID', 'Use a regular original source within the native size limit.');
    const hash = createHash('sha256'), blocks = [], buffer = Buffer.alloc(65536);
    let position = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) break;
      position += bytesRead;
      if (position > maximum) throw failure('INVOICE_INPUT_TOO_LARGE', 'The original source exceeds its native size limit.');
      const block = buffer.subarray(0, bytesRead); hash.update(block);
      if (consume) blocks.push(Buffer.from(block));
    }
    const after = await handle.stat({ bigint: true });
    if (BigInt(position) !== after.size || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key]))
      throw failure('INVOICE_INPUT_CHANGED', 'The original file changed while being read; inspect its current source identity.');
    return { bytes: position, sha256: hash.digest('hex'), ...(consume ? { content: Buffer.concat(blocks, position) } : {}) };
  } catch (issue) {
    if (['ENOENT', 'EACCES', 'EPERM', 'ELOOP', 'ENOTDIR'].includes(issue.code))
      throw failure('INVOICE_INPUT_UNAVAILABLE', 'The selected host-declared original file is unavailable. Check that same alias on the host.');
    throw issue;
  } finally { await handle?.close(); }
}


export async function readInvoiceWorkspaceConfiguration(path){
 path=resolve(path);
 const raw=parse((await originalFile(path,{consume:true,maximum:1048576})).content);
 exact(raw,['schema','workspaces'],['schema','workspaces']);
 need(raw.schema===INVOICE_WORKSPACE_CONNECTION_SCHEMA&&plain(raw.workspaces)&&Object.keys(raw.workspaces).length>0&&Object.keys(raw.workspaces).length<=32,'Declare1–32 original workspace aliases.');
 const base=dirname(path),seen=new Set(),workspaces=Object.create(null);
 for(const[alias,item]of Object.entries(raw.workspaces)){
  identifier(alias);exact(item,['directory','label','connectionsFile','profileFile','expectedWorkspaceId','inputs'],['directory']);
  const directory=pathFor(item.directory,base);await privateSupportDirectory(directory);
  need(await realpath(directory)===directory&&!seen.has(directory),'Use one canonical private directory per workspace.');seen.add(directory);
  if(item.expectedWorkspaceId!==undefined)need(UUID.test(item.expectedWorkspaceId),'Use the original native workspace UUID.');
  const inputs=Object.create(null);need(item.inputs===undefined||plain(item.inputs)&&Object.keys(item.inputs).length<=100,'Declare at most100 original inputs.');
  for(const[name,value]of Object.entries(item.inputs??{})){
   identifier(name);exact(value,['file','label'],['file']);
   inputs[name]={file:pathFor(value.file,base),label:line(value.label??name)};
  }
  workspaces[alias]={directory,label:line(item.label??alias),inputs,
   ...(item.connectionsFile?{connectionsFile:pathFor(item.connectionsFile,base)}:{}),
   ...(item.profileFile?{profileFile:pathFor(item.profileFile,base)}:{}),
   ...(item.expectedWorkspaceId?{expectedWorkspaceId:item.expectedWorkspaceId}:{})};
 }
 return {schema:raw.schema,workspaces};
}
export class MerchantInvoiceWorkspaces{
 #config;#entries=new Map();#opening=new Map();#tasks=new Set();#closing=false;#close;
 #reads=new RetainedFileReads({errorPrefix:'INVOICE_FILE'});
 constructor(config){this.#config=config;}
 get summary(){return {configured:Boolean(this.#config.invoiceWorkspaces),...this.#reads.summary,
  workspaces:Object.entries(this.#config.invoiceWorkspaces?.workspaces??{}).map(([workspace,x])=>({
   workspace,label:x.label,open:this.#entries.has(workspace),opening:this.#opening.has(workspace),
   instanceId:this.#entries.get(workspace)?.instanceId??null,inputAliases:Object.keys(x.inputs)}))};}
 #definition(alias){identifier(alias);const x=this.#config.invoiceWorkspaces?.workspaces[alias];need(x,'Choose a declared original invoice workspace alias.');return x;}
 #entry(alias){this.#definition(alias);const e=this.#entries.get(alias);need(e&&!e.closing,'Open this original workspace before using it.');return e;}
 #scope(e){return 'invoice:'+e.alias+':'+e.definition.directory;}
 async #state(e){const value=await e.operator.describe();return {workspace:e.alias,instanceId:e.instanceId,
  native:{id:value.workspaceId,revision:value.revision},value};}
 async #open(alias){
  const definition=this.#definition(alias);
  if(this.#entries.has(alias))return this.#state(this.#entry(alias));
  if(this.#opening.has(alias))return this.#opening.get(alias);
  const work=(async()=>{
   let operator;
   try{
    const privateConfig=await loadInvoiceSettlementConfiguration({workspaceDirectory:definition.directory,
      connectionsFile:definition.connectionsFile,profileFile:definition.profileFile});
    operator=await openInvoiceSettlementOperator({workspaceDirectory:definition.directory,...privateConfig,
      expectedWorkspaceId:definition.expectedWorkspaceId});
    need(!this.#closing,'The provider is closing.');
    const exportsDirectory=join(this.#config.exportsDirectory,'invoice',alias);
    await mkdir(exportsDirectory,{recursive:true,mode:0o700});await privateSupportDirectory(exportsDirectory);
    need(await realpath(exportsDirectory)===exportsDirectory,'Keep the original export root canonical.');
    const entry={alias,definition,operator,exportsDirectory,instanceId:randomUUID(),tasks:new Set(),closing:null};
    this.#entries.set(alias,entry);
    try{return await this.#state(entry);}catch(error){this.#entries.delete(alias);throw error;}
   }catch(error){await operator?.close();throw error;}
  })();
  this.#opening.set(alias,work);try{return await work;}finally{this.#opening.delete(alias);}
 }
 async #closeEntry(e){
  if(!e.closing)e.closing=(async()=>{
   await Promise.allSettled([...e.tasks]);
   const outcomes=await Promise.allSettled([this.#reads.closeScope(this.#scope(e)),e.operator.close()]);
   if(outcomes.some(x=>x.status==='rejected'))throw failure('INVOICE_CLOSE_INCOMPLETE','An original operator or file reader did not drain.');
   if(this.#entries.get(e.alias)===e)this.#entries.delete(e.alias);
   return {workspace:e.alias,instanceId:e.instanceId,state:'CLOSED'};
  })().catch(error=>{e.closing=null;throw error;});
  return e.closing;
 }
 async #files(e,publicationId){
  need(UUID.test(publicationId),'Select an original export UUID.');
  const {record,inspection}=await e.operator.exported({exportId:publicationId});
  need(typeof record.directory==='string'&&dirname(record.directory)===e.exportsDirectory&&UUID.test(basename(record.directory)),
   'This package is outside the configured private export root.');
  const {manifest,bytes,manifestSha256}=inspection;
  need(manifest.id===publicationId,'The original export identity changed.');
  const descriptors=[{file:'manifest.json',bytes:bytes.length,sha256:manifestSha256,mime:'application/json'},
   ...manifest.files.map(x=>({file:x.path,bytes:x.bytes,sha256:x.sha256,mime:x.contentType??'application/octet-stream'}))];
  return {directory:record.directory,response:{workspace:e.alias,
   publication:{id:publicationId,kind:'invoice-settlement-export',format:manifest.kind,
    workspaceId:manifest.workspaceId,sourceRevision:manifest.workspaceRevision,manifestSha256},
   files:descriptors}};
 }
 async #execute(e,name,input){
  const workspace=e.alias;
  if(name==='merchant_invoice_status')return this.#state(e);
  if(name==='merchant_invoice_methods')return {workspace,methods:e.operator.methods().filter(x=>INVOICE_NATIVE_METHODS.some(y=>x.method===y.method))};
  if(name==='merchant_invoice_read'||name==='merchant_invoice_change'){
   const declaration=INVOICE_NATIVE_METHODS.find(x=>x.method===input.method);
   need(declaration&&declaration.mutates===(name==='merchant_invoice_change'),'Select the matching original read/change method.');
   // File-system routing is solely host-owned. These methods have no client path override.
   need(!['destination','sourceDirectory','directory','connections','applicationDirectory'].some(x=>Object.hasOwn(input.args,x)),
    'Native host paths are not customer arguments.');
   const value=await e.operator.invoke({method:input.method,args:input.args});
   return {workspace,...(await this.#identity(e)),value};
  }
  if(name==='merchant_invoice_inputs'){
   if(!input.input)return {workspace,inputs:Object.entries(e.definition.inputs).map(([input,x])=>({input,label:x.label}))};
   const selected=e.definition.inputs[input.input];need(selected,'Select a configured original input.');
   return {workspace,input:input.input,label:selected.label,...await originalFile(selected.file)};
  }
  if(name==='merchant_invoice_import'){
   const selected=e.definition.inputs[input.input];need(selected,'Select a configured original input.');
   need(!['bodyBase64','destination','sourceDirectory','directory'].some(x=>Object.hasOwn(input.args,x)),'Original source bytes come from the selected host alias.');
   const original=await originalFile(selected.file,{consume:true});
   need(original.sha256===input.expectedSha256,'The selected complete source differs from its reviewed SHA256.');
   const value=await e.operator.invoke({method:'source.import',args:{...input.args,bodyBase64:original.content.toString('base64')}});
   return {workspace,...await this.#identity(e),input:input.input,inputIdentity:{bytes:original.bytes,sha256:original.sha256},value};
  }
  if(name==='merchant_invoice_export'){
   need(input.kind==='report'?Boolean(input.reportId):input.reportId===undefined,'Select a report ID only for a report export.');
   const args={requestId:input.requestId,expectedRevision:input.expectedRevision,destination:join(e.exportsDirectory,input.requestId),
    ...(input.reportId?{reportId:input.reportId}:{}),...(input.includeApplication===undefined?{}:{includeApplication:input.includeApplication})};
   const value=await e.operator.invoke({method:input.kind==='workspace'?'workspace.export':'report.export',args});
   const selected=await this.#files(e,value.exportId);
   return {...selected.response,...await this.#identity(e),value};
  }
  if(name==='merchant_invoice_files')return (await this.#files(e,input.publicationId)).response;
  if(name==='merchant_invoice_file_release'){await this.#reads.release(this.#scope(e),input.readId);return {workspace,readId:input.readId,released:true};}
  if(name==='merchant_invoice_file_read'){
   const selected=await this.#files(e,input.publicationId),item=selected.response.files.find(x=>x.file===input.file);
   need(item&&item.sha256===input.expectedSha256,'Select the exact listed original file and SHA256.');
   const result=await this.#reads.read({scope:this.#scope(e),key:input.publicationId+':'+item.file,
    kind:'invoice-settlement-export',directory:e.exportsDirectory,expectedSha256:item.sha256,
    readId:input.readId,offset:input.offset,limit:input.limit,
    load:async()=>{
     // The native safe reader checks every path component and complete declared bytes.
     const path=await nativeFiles.filePath(selected.directory,item.file);
     return {name:basename(item.file),type:item.mime,bytes:item.bytes,sha256:item.sha256,
      readonlyFileHandle:await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0))};
    }});
   return {workspace,...result};
  }
  throw failure('TOOL_NOT_FOUND','Select an original Invoice & Settlement tool.');
 }
 async #identity(e){const x=await e.operator.describe();return {native:{id:x.workspaceId,revision:x.revision}};}
 async call(name,args={}){
  need(!this.#closing,'This provider is draining.');const declaration=byName.get(name);
  need(declaration,'Select an original Invoice & Settlement tool.');exact(args,Object.keys(declaration[2]),declaration[3]);
  for(const[key,value]of Object.entries(args))validate(value,declaration[2][key],key);
  const task=(async()=>{
   if(name==='merchant_invoice_workspaces')return this.summary;
   if(name==='merchant_invoice_open')return this.#open(args.workspace);
   const entry=this.#entry(args.workspace);
   if(name==='merchant_invoice_close'){need(entry.instanceId===args.instanceId,'Close only the observed original operator instance.');return this.#closeEntry(entry);}
   const pending=Promise.resolve().then(()=>this.#execute(entry,name,args));entry.tasks.add(pending);
   try{return await pending;}catch(error){throw Object.assign(new Error(entry.operator.publicError(error).message??'Original invoice operation failed.'),entry.operator.publicError(error));}
   finally{entry.tasks.delete(pending);}
  })();this.#tasks.add(task);try{return await task;}finally{this.#tasks.delete(task);}
 }
 close(){
  this.#closing=true;
  if(!this.#close)this.#close=(async()=>{
   await Promise.allSettled([...this.#tasks,...this.#opening.values()]);
   const outcomes=await Promise.allSettled([...this.#entries.values()].map(e=>this.#closeEntry(e)));
   await this.#reads.close();
   if(outcomes.some(x=>x.status==='rejected'))throw failure('INVOICE_CLOSE_INCOMPLETE','Retry shutdown of the original operator.');
  })().catch(error=>{this.#close=null;throw error;});
  return this.#close;
 }
}
