// MIT. Same native project, configured host inputs and private portable receiving.
import {mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {DbtProjectClient,readDbtProjectConfiguration,readConfiguredInput,digestFile,ensure} from './client.mjs';
import {dbtProjectTools,DBT_QUERY_ACTIONS} from './mcp-tools.mjs';
export {dbtProjectTools,readDbtProjectConfiguration};
const definitions=new Map(dbtProjectTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function validate(value,schema){
 if(schema.type==='string')ensure(typeof value==='string'&&value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??1000000)&&(!schema.pattern||new RegExp(schema.pattern).test(value)),'DBT_TOOL_INPUT_INVALID');
 if(schema.type==='object')ensure(plain(value),'DBT_TOOL_INPUT_INVALID');
 if(schema.type==='integer')ensure(Number.isSafeInteger(value)&&value>=(schema.minimum??0)&&value<=(schema.maximum??Number.MAX_SAFE_INTEGER),'DBT_TOOL_INPUT_INVALID');
 if(schema.enum)ensure(schema.enum.includes(value),'DBT_TOOL_INPUT_INVALID');
}
export class MerchantDbtProjects{
 #config;#clients=new Map();#tasks=new Set();#closed=false;
 constructor(config){this.#config=config.dbtProjects;}
 get summary(){return {configured:Boolean(this.#config),workspaces:Object.keys(this.#config?.workspaces??{}),attachedClients:this.#clients.size};}
 #entry(alias){ensure(Object.hasOwn(this.#config?.workspaces??{},alias),'DBT_WORKSPACE_UNKNOWN');return this.#config.workspaces[alias];}
 #client(alias){const entry=this.#entry(alias);if(!this.#clients.has(alias))this.#clients.set(alias,new DbtProjectClient({...entry,maxResponseBytes:2*1024*1024}));return this.#clients.get(alias);}
 async #call(name,args){
  if(name==='merchant_dbt_projects')return {workspaces:Object.entries(this.#config?.workspaces??{}).map(([workspace,e])=>({workspace,label:e.label??workspace,inputs:Object.entries(e.inputs).map(([input,value])=>({input,sha256:value.sha256,label:value.label??input}))}))};
  const entry=this.#entry(args.workspace),client=this.#client(args.workspace);
  if(name==='merchant_dbt_query'){ensure(DBT_QUERY_ACTIONS.includes(args.action),'DBT_QUERY_UNKNOWN');return client.invoke(args.action,args.input??{});}
  if(name==='merchant_dbt_input'||name==='merchant_dbt_import'){
    const found=await readConfiguredInput(entry,args.input,args.expectedSha256);
    if(name==='merchant_dbt_input')return {workspace:args.workspace,input:args.input,sha256:found.sha256,bytes:found.bytes};
    return client.import(found.path,found.sha256);
  }
  if(name==='merchant_dbt_edition')return client.createEdition({...args.input,request_id:args.id});
  if(name==='merchant_dbt_review')return client.saveReview({...args.input,request_id:args.id});
  if(name==='merchant_dbt_bind_result'){
    const [result,query,provenance]=await Promise.all([args.result,args.query,args.provenance].map(alias=>readConfiguredInput(entry,alias)));
    return client.bindResult({edition:args.edition,uid:args.uid,file:result.path,expected_sha:result.sha256,query_file:query.path,provenance_file:provenance.path,
      source_kind:args.sourceKind,original_request_id:args.originalRequestId,request_id:args.id});
  }
  if(name==='merchant_dbt_report')return client.report(args.edition,{review:args.review,format:args.format});
  if(name==='merchant_dbt_export'){
    await mkdir(entry.exportsDirectory,{recursive:true,mode:0o700});const project=await client.status();const path=join(entry.exportsDirectory,'dbt-project-'+project.id+'-'+args.id+'.zip');
    let expected;try{await stat(path);expected=(await digestFile(path)).sha256;}catch(error){if(error.code!=='ENOENT')throw error;}
    return client.export(path,expected);
  }
  if(name==='merchant_dbt_receive'){
    const input=await readConfiguredInput(entry,args.input,args.expectedSha256);await mkdir(entry.receiveRoot,{recursive:true,mode:0o700});
    return client.receive(input.path,join(entry.receiveRoot,args.name),input.sha256);
  }
  if(name==='merchant_dbt_file_read')return client.invoke('object.read',{sha256:args.sha256,offset:args.offset??0,limit:args.limit??65536});
  throw Error('Unknown dbt tool.');
 }
 call(name,args={}){
  const definition=definitions.get(name);ensure(!this.#closed&&definition&&plain(args)&&Object.keys(args).every(k=>Object.hasOwn(definition.properties,k))&&definition.required.every(k=>Object.hasOwn(args,k)),'DBT_TOOL_INPUT_INVALID');
  for(const [key,value]of Object.entries(args))validate(value,definition.properties[key]);
  const task=Promise.resolve().then(()=>this.#call(name,args));this.#tasks.add(task);task.finally(()=>this.#tasks.delete(task)).catch(()=>{});return task;
 }
 async close(){this.#closed=true;await Promise.allSettled([...this.#tasks]);await Promise.all([...this.#clients.values()].map(c=>c.close()));this.#clients.clear();}
}
