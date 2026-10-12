// MIT. Host-declared aliases use the same retained native workspace and writers.
import {mkdir,readFile,open,rename,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {NetCDFWorkspaceClient,readNetCDFConfiguration,readConfiguredInput,digestFile,need,plain} from './client.mjs';
import {netCDFTools,NETCDF_QUERY_ACTIONS} from './mcp-tools.mjs';
export {netCDFTools,readNetCDFConfiguration};

const definitions=new Map(netCDFTools((name,description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
function validate(value,schema){
  if(schema.type==='string')need(typeof value==='string'&&value.length<=(schema.maxLength??1000000)&&(!schema.pattern||new RegExp(schema.pattern).test(value)),'NETCDF_TOOL_INPUT_INVALID');
  if(schema.type==='object')need(plain(value),'NETCDF_TOOL_INPUT_INVALID');
  if(schema.type==='integer')need(Number.isSafeInteger(value)&&value>=(schema.minimum??0)&&value<=(schema.maximum??Number.MAX_SAFE_INTEGER),'NETCDF_TOOL_INPUT_INVALID');
  if(schema.enum)need(schema.enum.includes(value),'NETCDF_TOOL_INPUT_INVALID');
}
function page(items,args){const offset=args.offset??0,limit=args.limit??100,end=Math.min(items.length,offset+limit);return {items:items.slice(offset,end),offset,limit,total:items.length,next_offset:end<items.length?end:null};}
function sourceIndex(source){return {id:source.id,name:source.name,sha256:source.sha256,bytes:source.bytes,reference:source.reference,imported_at:source.imported_at,variables:source.catalog.variables.length,format:source.catalog.format};}
function projection(value,args){
  if(args.action==='overview')return {schema:value.schema,project:value.project,projection:'source-and-result-index',
    sources:page(value.sources.map(sourceIndex),args),selections:page(value.selections,args),runs:page(value.runs,args),reviews:page(value.reviews,args)};
  if(['sources','selections','runs','reviews'].includes(args.action))return page(args.action==='sources'?value.items.map(sourceIndex):value.items,args);
  return value;
}
async function saveJSON(path,value){
  const temporary=path+'.'+randomUUID()+'.partial';const file=await open(temporary,'wx',0o600);
  try{await file.writeFile(JSON.stringify(value));await file.sync();}finally{await file.close();}
  await rename(temporary,path);
}
export class MerchantNetCDFWorkspaces{
  #config;#clients=new Map();#tasks=new Set();#closed=false;#exports=new Map();
  constructor(config){this.#config=config.netcdfWorkspaces;}
  get summary(){return {configured:Boolean(this.#config),workspaces:Object.keys(this.#config?.workspaces??{}),retainedClients:this.#clients.size};}
  #entry(alias){need(Object.hasOwn(this.#config?.workspaces??{},alias),'NETCDF_WORKSPACE_UNKNOWN');return this.#config.workspaces[alias];}
  async #client(alias){
    const entry=this.#entry(alias);
    if(!this.#clients.has(alias)){
      const client=new NetCDFWorkspaceClient(entry);let promise;
      promise=(async()=>{
        try{
          const binding=await client.binding();
          need(binding.directory===resolve(entry.directory)&&(!entry.project_id||binding.project_id===entry.project_id)&&(!entry.sha256||binding.sha256===entry.sha256),
            'NETCDF_WORKSPACE_CHANGED','The configured original project binding changed.');
          return client;
        }catch(error){await client.close();if(this.#clients.get(alias)===promise)this.#clients.delete(alias);throw error;}
      })();
      this.#clients.set(alias,promise);
    }
    return this.#clients.get(alias);
  }
  async #export(entry,client,id){
    const binding=await client.binding(),key=entry.directory+'\0'+id;
    if(this.#exports.has(key))return this.#exports.get(key);
    const task=(async()=>{
      await mkdir(entry.exportsDirectory,{recursive:true,mode:0o700});
      const receiptPath=join(entry.exportsDirectory,'netcdf-'+id+'.json'),path=join(entry.exportsDirectory,'netcdf-'+id+'.zip');
      let receipt;
      try{receipt=JSON.parse(await readFile(receiptPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
      if(receipt){
        need(receipt.schema==='stellar-forge.netcdf-merchant-export.v1'&&receipt.id===id&&receipt.project_id===binding.project_id,
          'NETCDF_EXPORT_CONFLICT','The original export identity belongs to another project.');
        if(receipt.state!=='complete')await client.copyObject(receipt.file.sha256,path);
        const completed=await digestFile(path);
        need(completed.sha256===receipt.file.sha256&&completed.bytes===receipt.file.bytes,'NETCDF_EXPORT_CHANGED');
        if(receipt.state!=='complete')await saveJSON(receiptPath,{...receipt,state:'complete'});
        return {...receipt.file,export_id:id,project_id:binding.project_id};
      }
      try{await stat(path);need(false,'NETCDF_EXPORT_RECEIPT_MISSING','The original export file needs its retained receipt before another export.');}
      catch(error){if(error.code!=='ENOENT')throw error;}
      const file=await client.exportProject();
      const selected={name:file.name,sha256:file.sha256,bytes:file.bytes,mime:file.mime};
      const original={schema:'stellar-forge.netcdf-merchant-export.v1',state:'prepared',id,project_id:binding.project_id,file:selected};
      await saveJSON(receiptPath,original);await client.copyObject(file.sha256,path);
      await saveJSON(receiptPath,{...original,state:'complete'});
      return {...selected,export_id:id,project_id:binding.project_id};
    })();
    this.#exports.set(key,task);
    try{return await task;}finally{this.#exports.delete(key);}
  }
  async #call(name,args){
    if(name==='merchant_netcdf_workspaces')return {workspaces:Object.entries(this.#config?.workspaces??{}).map(([workspace,entry])=>({workspace,label:entry.label??workspace,inputs:Object.keys(entry.inputs??{})}))};
    const entry=this.#entry(args.workspace),client=await this.#client(args.workspace);
    if(name==='merchant_netcdf_query'){
      need(NETCDF_QUERY_ACTIONS.includes(args.action),'NETCDF_QUERY_UNKNOWN');
      const input={...(args.input??{})};
      if(['variables','preview'].includes(args.action)){input.offset=args.offset??input.offset??0;input.limit=args.limit??input.limit??100;}
      return projection(await client.call(args.action,input),args);
    }
    if(name==='merchant_netcdf_import'){
      const input=await readConfiguredInput(entry,args.input,args.expectedSha256);
      return client.importFile(input.path,{request_id:args.id,expected_sha:input.sha256,
        ...(args.name??input.name?{name:args.name??input.name}:{}),
        ...(args.reference??input.reference?{reference:args.reference??input.reference}:{})});
    }
    if(name==='merchant_netcdf_selection')return client.saveSelection({...args.input,request_id:args.id});
    if(name==='merchant_netcdf_run')return client.run(args.selectionId,{request_id:args.id});
    if(name==='merchant_netcdf_review')return client.saveReview({...args.input,request_id:args.id});
    if(name==='merchant_netcdf_report')return client.report(args.runId);
    if(name==='merchant_netcdf_export')return this.#export(entry,client,args.id);
    if(name==='merchant_netcdf_receive'){
      const input=await readConfiguredInput(entry,args.input,args.expectedSha256);
      await mkdir(entry.receiveRoot,{recursive:true,mode:0o700});
      return client.receiveProject(input.path,join(entry.receiveRoot,args.name),input.sha256);
    }
    if(name==='merchant_netcdf_file_read')return client.objectRead(args.sha256,{offset:args.offset,limit:args.limit});
    need(false,'NETCDF_TOOL_UNKNOWN');
  }
  call(name,args={}){
    const definition=definitions.get(name);
    need(!this.#closed&&definition&&plain(args)&&Object.keys(args).every(key=>Object.hasOwn(definition.properties,key))&&definition.required.every(key=>Object.hasOwn(args,key)),
      'NETCDF_TOOL_INPUT_INVALID');
    for(const [key,value]of Object.entries(args))validate(value,definition.properties[key]);
    const task=Promise.resolve().then(()=>this.#call(name,args));this.#tasks.add(task);
    task.finally(()=>this.#tasks.delete(task)).catch(()=>{});return task;
  }
  async close(){
    this.#closed=true;await Promise.allSettled([...this.#tasks]);
    const clients=await Promise.allSettled([...this.#clients.values()]);
    await Promise.all(clients.filter(value=>value.status==='fulfilled').map(value=>value.value.close()));this.#clients.clear();
  }
}
