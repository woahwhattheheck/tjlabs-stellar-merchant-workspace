// MIT. One persistent original project process per configured workspace.
import {mkdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {readDbtProjectConfiguration,readConfiguredInput,digestFile,ensure} from '../client.mjs';
import {DbtOptimizationClient} from './client.mjs';
import {dbtOptimizationTools,QUERY_ACTIONS} from './mcp-tools.mjs';
export {dbtOptimizationTools,readDbtProjectConfiguration};
const definitions=new Map(dbtOptimizationTools((name,description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function validate(value,schema){
 if(schema.type==='string')ensure(typeof value==='string'&&value.length<=(schema.maxLength??1000000)&&(!schema.pattern||new RegExp(schema.pattern).test(value)),'DBT_OPT_INPUT_INVALID');
 if(schema.type==='object')ensure(plain(value),'DBT_OPT_INPUT_INVALID');
 if(schema.type==='integer')ensure(Number.isSafeInteger(value)&&value>=(schema.minimum??0)&&value<=(schema.maximum??Number.MAX_SAFE_INTEGER),'DBT_OPT_INPUT_INVALID');
 if(schema.enum)ensure(schema.enum.includes(value),'DBT_OPT_INPUT_INVALID');
}
function page(items,args){const offset=args.offset??0,limit=args.limit??100;return {items:items.slice(offset,offset+limit),offset,limit,total:items.length,next_offset:offset+limit<items.length?offset+limit:null};}
function pathSummary(p){return {seconds:p.seconds,timed_resources:p.timed_resources,resources:p.resources.length,unobserved_dependencies:p.unobserved_dependencies.length,cycle_or_downstream:p.cycle_or_downstream.length,interpretation:p.interpretation};}
function projection(value,args){
 if(Array.isArray(value))return page(value,args);
 if(args.action==='inventory')return {schema:value.schema,project:{id:value.project.id,title:value.project.title},editions:page(value.editions,args),saved_plans:value.plans.length};
 if(args.action==='profile'){
  const section=args.section??'rows';const field={dependency_path:'resources',unobserved_dependencies:'unobserved_dependencies',cycle_or_downstream:'cycle_or_downstream'}[section];
  const items=field?value.weighted_dependency_path[field]:value[section];ensure(Array.isArray(items),'DBT_OPT_SECTION_INVALID');
  return {schema:value.schema,selection:value.selection,edition_title:value.edition_title,summary:value.summary,warnings:value.warnings,weighted_dependency_path:pathSummary(value.weighted_dependency_path),section,page:page(items,args)};
 }
 if(args.action==='compare'){ensure(!args.section||args.section==='rows','DBT_OPT_SECTION_INVALID');return {schema:value.schema,before:value.before.selection,after:value.after.selection,summary:value.summary,warnings:value.warnings,context_changes:value.context_changes,section:'rows',page:page(value.rows,args)};}
 return value;
}
export class MerchantDbtOptimization{
 #config;#clients=new Map();#tasks=new Set();#closed=false;
 constructor(config){this.#config=config.dbtOptimization;}
 get summary(){return {configured:Boolean(this.#config),workspaces:Object.keys(this.#config?.workspaces??{}),attachedClients:this.#clients.size};}
 #entry(alias){ensure(Object.hasOwn(this.#config?.workspaces??{},alias),'DBT_WORKSPACE_UNKNOWN');return this.#config.workspaces[alias];}
 #client(alias){const entry=this.#entry(alias);if(!this.#clients.has(alias))this.#clients.set(alias,new DbtOptimizationClient(entry));return this.#clients.get(alias);}
 async #call(name,args){
  if(name==='merchant_dbt_opt_projects')return {workspaces:Object.entries(this.#config?.workspaces??{}).map(([workspace,e])=>({workspace,label:e.label??workspace,inputs:Object.keys(e.inputs)}))};
  const entry=this.#entry(args.workspace),client=this.#client(args.workspace);
  if(name==='merchant_dbt_opt_query'){ensure(QUERY_ACTIONS.includes(args.action),'DBT_OPT_QUERY_UNKNOWN');return projection(await client.call(args.action,args.input??{}),args);}
  if(name==='merchant_dbt_opt_save')return client.save({...args.input,request_id:args.id});
  if(name==='merchant_dbt_opt_report')return client.report(args.input);
  if(name==='merchant_dbt_opt_file_read')return client.call('object.read',{sha256:args.sha256,offset:args.offset,limit:args.limit});
  if(name==='merchant_dbt_opt_export'){
   await mkdir(entry.exportsDirectory,{recursive:true,mode:0o700});const binding=await client.call('binding');const path=join(entry.exportsDirectory,'dbt-optimization-'+binding.projectId+'-'+args.id+'.zip');
   let expected;try{await stat(path);expected=(await digestFile(path)).sha256;}catch(error){if(error.code!=='ENOENT')throw error;}
   return client.export(path,expected);
  }
  if(name==='merchant_dbt_opt_receive'){const input=await readConfiguredInput(entry,args.input,args.expectedSha256);await mkdir(entry.receiveRoot,{recursive:true,mode:0o700});return client.receive(input.path,join(entry.receiveRoot,args.name),input.sha256);}
  throw Error('Unknown optimization tool.');
 }
 call(name,args={}){
  const def=definitions.get(name);ensure(!this.#closed&&def&&plain(args)&&Object.keys(args).every(k=>Object.hasOwn(def.properties,k))&&def.required.every(k=>Object.hasOwn(args,k)),'DBT_OPT_INPUT_INVALID');
  for(const [key,value]of Object.entries(args))validate(value,def.properties[key]);
  const task=Promise.resolve().then(()=>this.#call(name,args));this.#tasks.add(task);task.finally(()=>this.#tasks.delete(task)).catch(()=>{});return task;
 }
 async close(){this.#closed=true;await Promise.allSettled([...this.#tasks]);await Promise.all([...this.#clients.values()].map(c=>c.close()));this.#clients.clear();}
}
