// MIT. Original host-configured workspaces and exact full-file transfer.
import {open,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {BlendClient,readBlendConfiguration,digestFile,ensure} from './client.mjs';
import {blendTools,BLEND_READ_ACTIONS} from './mcp-tools.mjs';
export {blendTools,readBlendConfiguration};
const definitions=new Map(blendTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function validate(value,schema){
 if(schema.type==='string')ensure(typeof value==='string'&&value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??1000000)&&(!schema.pattern||new RegExp(schema.pattern).test(value)),'Invalid tool text field.');
 if(schema.type==='integer')ensure(Number.isSafeInteger(value)&&value>=(schema.minimum??0)&&value<=(schema.maximum??Number.MAX_SAFE_INTEGER),'Invalid tool integer.');
 if(schema.type==='object')ensure(plain(value),'Expected an input object.');
 if(schema.enum)ensure(schema.enum.includes(value),'Unsupported tool option.');
}
export class MerchantDataBlends {
 #config;#clients=new Map();#files=new Map();#tasks=new Set();#closed=false;
 constructor(config){this.#config=config.dataBlends;}
 get summary(){return {configured:Boolean(this.#config),workspaces:Object.keys(this.#config?.workspaces??{}),attachedClients:this.#clients.size};}
 #entry(alias){ensure(Object.hasOwn(this.#config?.workspaces??{},alias),'Choose a configured workspace.');return this.#config.workspaces[alias];}
 #client(alias){const entry=this.#entry(alias);if(!this.#clients.has(alias))this.#clients.set(alias,new BlendClient(entry));return this.#clients.get(alias);}
 async #input(entry,alias,sha){const input=entry.inputs[alias];ensure(input&&input.sha256===sha,'Choose the exact configured input digest.');const actual=await digestFile(input.path);ensure(actual.sha256===sha,'Configured input changed.');return input;}
 async #readFile(alias,request,sha256,offset=0,limit=65536){
  const key=alias+':'+request;let resource=this.#files.get(key);
  if(!resource){
   const client=this.#client(alias),operation=await client.invoke('operation',{request}),record=operation.result;
   ensure(operation.state==='complete'&&record?.filename&&record.sha256===sha256,'Choose a complete export with its original digest.');
   const {path}=await client.invoke('export.path',{request});const actual=await digestFile(path);ensure(actual.sha256===sha256&&actual.bytes===record.bytes,'Retained export changed.');
   const file=await open(path,'r'),info=await file.stat();if(info.dev!==actual.dev||info.ino!==actual.ino||info.mtimeMs!==actual.mtimeMs||info.ctimeMs!==actual.ctimeMs){await file.close();throw Error('Retained export changed while opening.');}resource={file,info,record};this.#files.set(key,resource);
  }
  ensure(resource.record.sha256===sha256&&offset<=resource.record.bytes,'Export digest or offset changed.');
  const before=await resource.file.stat();ensure(before.size===resource.info.size&&before.mtimeMs===resource.info.mtimeMs&&before.ctimeMs===resource.info.ctimeMs,'Retained export changed.');
  const buffer=Buffer.alloc(Math.min(limit,resource.record.bytes-offset));let used=0;
  while(used<buffer.length){const got=await resource.file.read(buffer,used,buffer.length-used,offset+used);ensure(got.bytesRead>0,'Complete export read stopped.');used+=got.bytesRead;}
  const after=await resource.file.stat();ensure(after.size===before.size&&after.mtimeMs===before.mtimeMs&&after.ctimeMs===before.ctimeMs,'Retained export changed during reading.');
  return {request,sha256,totalBytes:resource.record.bytes,offset,bytes:used,contentBase64:buffer.toString('base64'),nextOffset:offset+used<resource.record.bytes?offset+used:null};
 }
 async #call(name,args){
  if(name==='merchant_blends_workspaces')return {workspaces:Object.entries(this.#config?.workspaces??{}).map(([workspace,e])=>({workspace,label:e.label??workspace,inputs:Object.entries(e.inputs).map(([input,v])=>({input,label:v.label??input,sha256:v.sha256}))}))};
  const entry=this.#entry(args.workspace),client=this.#client(args.workspace);
  if(name==='merchant_blends_read'){ensure(BLEND_READ_ACTIONS.includes(args.action),'Unsupported read action.');return client.invoke(args.action,args.input??{});}
  if(name==='merchant_blends_import'){const input=await this.#input(entry,args.input,args.sha256);return client.importCSV(input.path,args.label,{request:args.request,expectedSha256:args.sha256,delimiter:args.delimiter??',',nullToken:args.nullToken??null});}
  if(name==='merchant_blends_recipe')return client.saveRecipe(args.spec,{request:args.request,recipe:args.recipe??null,expectedVersion:args.expectedVersion??0});
  if(name==='merchant_blends_run')return client.run(args.recipe,args.version,{request:args.request});
  if(name==='merchant_blends_review')return client.review(args.edition,{decision:args.decision,note:args.note??'',reviewer:args.reviewer,expectedRevision:args.expectedRevision,request:args.request});
  if(name==='merchant_blends_export')return client.export(args.edition,{kind:args.kind,nullToken:args.nullToken??'\\N',request:args.request});
  if(name==='merchant_blends_backup')return client.backup({request:args.request});
  if(name==='merchant_blends_resume')return client.resume(args.request);
  if(name==='merchant_blends_receive'){const input=await this.#input(entry,args.input,args.sha256);return client.invoke('receive',{file:input.path,directory:join(entry.receiveRoot,args.name),expected_sha256:args.sha256});}
  if(name==='merchant_blends_file_read')return this.#readFile(args.workspace,args.request,args.sha256,args.offset??0,args.limit??65536);
  throw Error('Unknown data-blending tool.');
 }
 call(name,args={}){
  const definition=definitions.get(name);ensure(!this.#closed&&definition&&plain(args)&&Object.keys(args).every(k=>Object.hasOwn(definition.properties,k))&&definition.required.every(k=>Object.hasOwn(args,k)),'Invalid data-blending tool request.');
  for(const [key,value]of Object.entries(args))validate(value,definition.properties[key]);
  const task=Promise.resolve().then(()=>this.#call(name,args));this.#tasks.add(task);task.finally(()=>this.#tasks.delete(task)).catch(()=>{});return task;
 }
 async close(){this.#closed=true;await Promise.allSettled([...this.#tasks]);await Promise.all([...this.#files.values()].map(r=>r.file.close()));await Promise.all([...this.#clients.values()].map(c=>c.close()));this.#files.clear();this.#clients.clear();}
}
