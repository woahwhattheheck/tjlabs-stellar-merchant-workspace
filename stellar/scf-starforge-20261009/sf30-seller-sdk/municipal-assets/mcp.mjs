// MIT. Source-owned merchant provider for the original managed municipal application.
import { RetainedFileReads } from '../../../../stellar-forge/mcp-merchant-operator/retained-file-reads.mjs';
import { municipalAssetTools,municipalFileSelection,actionSchemas } from './mcp-tools.mjs';
import { MunicipalAssetClient,readMunicipalAssetInput } from './client.mjs';
import { PREFIX,MAX_FILE,need,plain,clone,canonical,validate,page,small,exact } from './agent-contracts.mjs';
export { municipalAssetTools };
export { readMunicipalAssetConfiguration } from './client.mjs';
const definitions=new Map(municipalAssetTools((name,description,properties,required)=>({name,properties,required})).map(item=>[item.name,item]));
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
const collections=['findings','inputs','mappings','decisions','repairs','changes','exclusions','work_order_overrides','history','releases','native_runs','settings'];
function section(view,name){
  const state=view.project.state;
  if(name==='settings')return [pick(state,['comparison_fields','transitions','attestation','expected_source_rows','expected_target_rows','expected_correlation_ids','native_run','current_release'])];
  const found=Object.hasOwn(view,name)?view[name]:state[name];
  if(Array.isArray(found))return found;
  need(plain(found),'The original project section is unavailable.');
  return Object.entries(found).map(([id,value])=>({id,value}));
}
function projectSummary(view) {
  const {state,...project}=view.project;
  return {project,selectedInputs:state.inputs,counts:view.counts,errors:view.errors,warnings:view.warnings,
    currentRelease:state.current_release,nativeRun:state.native_run,
    collections:Object.fromEntries(collections.map(name=>[name,section(view,name).length])),
    historyWindow:'Original latest 100 history entries and latest 20 native runs; full native history is retained in the SQLite backup.',
    kinds:view.kinds,required:view.required};
}
function selection(input){
  const chosen=pick(input,Object.keys(municipalFileSelection));
  const required={project:['projectId','expectedRevision'],report:['projectId','expectedRevision'],export:['projectId','expectedRevision'],
    backup:[],refresh:['projectId','operationId','name'],'maximo-capture':['projectId','operationId'],
    'maximo-load':['projectId','operationId'],'maximo-result':['projectId','operationId'],'refresh-status':['projectId'],'maximo-status':['projectId'],operation:['requestId']}[chosen.kind];
  need(required,'Select one original file kind.');
  const allowed=['kind',...required,...(chosen.kind==='export'?['releaseId']:[])];
  exact(chosen,allowed,['kind',...required]);return chosen;
}
export class MerchantMunicipalAssets {
  #config;#exports;#clients=new Map();#reads;#tasks=new Set();#closing=false;#close;
  constructor(config) {
    this.#config=config.municipalAssets;
    this.#exports=config.exportsDirectory;
    this.#reads=new RetainedFileReads({errorPrefix:'MUNICIPAL_ASSET_FILE',maxSnapshotBytes:MAX_FILE});
  }
  summary(){return {configured:Boolean(this.#config),workspaces:Object.keys(this.#config?.workspaces??{}),
    openWorkspaces:this.#clients.size,...this.#reads.summary()};}
  async #client(alias) {
    const entry=this.#config?.workspaces?.[alias];need(entry,'Select a configured original municipal workspace.','MUNICIPAL_ASSET_WORKSPACE_UNKNOWN');
    let result=this.#clients.get(alias);
    if(!result){result=MunicipalAssetClient.open(entry);this.#clients.set(alias,result);
      result.catch(()=>{if(this.#clients.get(alias)===result)this.#clients.delete(alias);});}
    return result;
  }
  call(name,args={}) {
    need(!this.#closing,'The municipal merchant provider is closing.','MUNICIPAL_ASSET_CLOSING');
    const definition=definitions.get(name);need(definition,'Select an original municipal merchant tool.');
    validate(args,{type:'object',properties:definition.properties,required:definition.required,additionalProperties:false});
    const input=clone(args);
    const result=Promise.resolve().then(()=>this.#run(name.slice(PREFIX.length),input)).then(small);
    this.#tasks.add(result);result.then(()=>this.#tasks.delete(result),()=>this.#tasks.delete(result));return result;
  }
  async #run(name,input) {
    if(name==='workspaces')return {workspaces:Object.entries(this.#config?.workspaces??{}).map(([workspace,entry])=>({
      workspace,label:entry.label,actor:entry.actor,instanceId:entry.startup.instanceId,
      bindingSha256:entry.startup.bindingSha256,sourceSha256:entry.startup.sourceSha256,
      inputs:Object.entries(entry.inputs).map(([input,item])=>({input,label:item.label,kind:item.kind,format:item.format,sha256:item.sha256}))}))};
    const {workspace,...args}=input,entry=this.#config?.workspaces?.[workspace];
    need(entry,'Select a configured original municipal workspace.','MUNICIPAL_ASSET_WORKSPACE_UNKNOWN');
    if(name==='input'){
      const selected=await readMunicipalAssetInput(entry,args.input);
      return {input:args.input,label:selected.input.label,name:selected.name,kind:selected.input.kind,format:selected.input.format,
        bytes:selected.bytes.length,sha256:selected.sha256};
    }
    if(name==='file_release')return this.#reads.release(workspace,args.readId);
    if(name==='file_read'){
      const chosen=selection(args);
      return this.#reads.read({scope:workspace,key:canonical(chosen),kind:chosen.kind,directory:this.#exports,
        ...pick(args,['readId','expectedSha256','offset','limit']),
        load:async()=> (await this.#client(workspace)).originalFile(chosen)});
    }
    const client=await this.#client(workspace);
    if(name==='status')return client.status();
    if(name==='project')return projectSummary(await client.project(args.projectId,args.expectedRevision));
    if(name==='project_section'){
      const value=await client.project(args.projectId,args.expectedRevision),all=section(value,args.section);
      const query=(args.query??'').toLocaleLowerCase();
      const selected=query?all.filter(item=>canonical(item).toLocaleLowerCase().includes(query)):all;
      return {projectId:args.projectId,revision:args.expectedRevision,section:args.section,...page(selected,args)};
    }
    if(name==='records')return client.records(args);
    if(name==='create_project')return client.createProject(args);
    if(name==='import_input'){
      const selected=await readMunicipalAssetInput(entry,args.input,args.expectedSha256);
      need(selected.input.kind!=='maximo-result','Select a dataset input for native import.');
      return client.importInput({...pick(args,['requestId','projectId','expectedRevision']),kind:selected.input.kind,format:selected.input.format,name:selected.name,bytes:selected.bytes});
    }
    if(Object.hasOwn(actionSchemas,name))return client.action(name,args);
    if(name==='refresh_status')return {projectId:args.projectId,...page((await client.refreshStatus(args.projectId)).refreshes,args)};
    if(name==='refresh_start')return client.refreshStart(args);
    if(name==='refresh_resume')return client.refreshResume(args);
    if(name==='maximo_status')return {projectId:args.projectId,section:args.section,...page((await client.maximoStatus(args.projectId))[args.section],args)};
    if(name==='maximo_start')return client.maximoStart(args);
    if(name==='maximo_resume')return client.maximoResume(args);
    if(name==='maximo_receive')return client.maximoReceive(args);
    if(name==='maximo_prepare_load')return client.maximoPrepareLoad(args);
    if(name==='maximo_receive_load'){
      const selected=await readMunicipalAssetInput(entry,args.input,args.expectedSha256);
      need(selected.input.kind==='maximo-result'&&selected.input.format==='json','Select the original Maximo result JSON.');
      return client.maximoReceiveLoad({...pick(args,['requestId','projectId','loadId']),returnedBytes:selected.bytes});
    }
    if(name==='maximo_result')return client.maximoResult(args);
    if(name==='operation')return client.operation(args.requestId);
    if(name==='replay_operation')return client.replayOperation(args.requestId);
    throw new Error('The municipal merchant method is unavailable.');
  }
  close() {
    if(!this.#close){
      this.#closing=true;
      this.#close=(async()=>{
        await Promise.allSettled([...this.#tasks]);
        const clients=await Promise.allSettled([...this.#clients.values()]);
        const completed=await Promise.allSettled([this.#reads.close(),...clients.filter(item=>item.status==='fulfilled').map(item=>item.value.close())]);
        const failure=completed.find(item=>item.status==='rejected');if(failure)throw failure.reason;
      })().catch(error=>{this.#close=null;throw error;});
    }
    return this.#close;
  }
}
