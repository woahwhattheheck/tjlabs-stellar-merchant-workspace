// MIT. Host-declared original SQL preparation, durable files and native receiving.
import {lstat} from 'node:fs/promises';
import {dirname,resolve,join,basename} from 'node:path';
import {preparationWorkspaceTools} from './tools.mjs';
import {PreparationCustomerFiles} from './files.mjs';
import {PreparationPipelineClient} from './pipeline-connection.mjs';
import {receivePreparationWorkspace,inspectReceivedPreparation} from './managed.mjs';
import {PreparationWorkspaceClient,PREPARATION_CONNECTION_FILENAME,PREPARATION_HASH,PREPARATION_DEFAULT_RECEIVING_BYTES,
  preparationNeed,preparationExact,preparationPlain,preparationAbsolute,preparationPrivateDirectory,
  preparationReadJson,preparationOpenFile,preparationWorkspaceIdentity,preparationHashFile,preparationDigest} from './connection.mjs';
export const PREPARATION_MCP_CONFIGURATION_SCHEMA='stellar-forge.data-preparation-workspaces.v1';
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const schemas=new Map(preparationWorkspaceTools((name,description,properties,required)=>({name,properties,required})).map(value=>[value.name,value]));
function alias(value){
  preparationNeed(typeof value==='string'&&ALIAS.test(value),'PREPARATION_ALIAS_INVALID','Choose a declared workspace, source or customer destination.');return value;
}
function label(value,fallback){
  const result=value??fallback;
  preparationNeed(typeof result==='string'&&result.trim()===result&&result.length>=1&&result.length<=128&&!/[\x00-\x1f\x7f]/.test(result),
    'PREPARATION_LABEL_INVALID','Use 1–128 printable characters.');return result;
}
function canonical(value){return JSON.stringify(value,(_key,item)=>preparationPlain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function capacity(value,fallback){
  const result=value??fallback;
  preparationNeed(Number.isSafeInteger(result)&&result>0,'PREPARATION_CAPACITY_INVALID','Use an explicit positive safe-integer byte allowance.');return result;
}
export async function readPreparationWorkspaceConfiguration(path){
  await preparationPrivateDirectory(dirname(preparationAbsolute(path)));
  const source=await preparationReadJson(path,{maximum:4*1024*1024}),raw=source.value;
  preparationExact(raw,['schema','workspaces','maxFileBytes','maxExpandedBytes','python'],['schema','workspaces']);
  preparationNeed(raw.schema===PREPARATION_MCP_CONFIGURATION_SCHEMA&&preparationPlain(raw.workspaces)&&
    Object.keys(raw.workspaces).length>=1&&Object.keys(raw.workspaces).length<=64,
  'PREPARATION_CONFIGURATION_INVALID','Declare 1–64 original preparation workspaces.');
  const maxFileBytes=capacity(raw.maxFileBytes,PREPARATION_DEFAULT_RECEIVING_BYTES);
  const maxExpandedBytes=capacity(raw.maxExpandedBytes,PREPARATION_DEFAULT_RECEIVING_BYTES);
  const base=dirname(path),workspaces=Object.create(null),directories=new Set();
  for(const [name,input] of Object.entries(raw.workspaces)){
    alias(name);preparationExact(input,['label','directory','workspaceSha256','inputs','destinations'],['directory']);
    preparationNeed(typeof input.directory==='string'&&input.directory.length>0,'PREPARATION_DIRECTORY_INVALID','Declare the original workspace directory.');
    const directory=preparationAbsolute(resolve(base,input.directory)),identity=await preparationWorkspaceIdentity(directory);
    preparationNeed(!directories.has(directory),'PREPARATION_DUPLICATE_WORKSPACE','Give each original workspace one host alias.');
    directories.add(directory);
    preparationNeed(input.workspaceSha256===undefined||input.workspaceSha256===identity.workspaceSha256,
      'PREPARATION_WORKSPACE_CHANGED','The declared original workspace identity changed.',409);
    for(const key of ['inputs','destinations'])
      preparationNeed(input[key]===undefined||preparationPlain(input[key])&&Object.keys(input[key]).length<=256,
        'PREPARATION_CONFIGURATION_INVALID','Declare up to 256 original sources or customer destinations.');
    const inputs=Object.create(null),destinations=Object.create(null);
    for(const [key,value] of Object.entries(input.inputs??{})){
      alias(key);preparationExact(value,['label','kind','file','sha256','nullToken'],['kind','file','sha256']);
      preparationNeed(['csv','jsonl','project','job-result'].includes(value.kind)&&typeof value.file==='string'&&
        value.file.length>0&&PREPARATION_HASH.test(value.sha256??'')&&
        (value.nullToken===undefined||value.kind==='csv'&&typeof value.nullToken==='string'&&value.nullToken.length<=256),
      'PREPARATION_SOURCE_INVALID','Declare complete CSV, JSONL, project or paid-job result bytes and their original SHA-256.');
      const file=preparationAbsolute(resolve(base,value.file));
      await preparationPrivateDirectory(dirname(file));
      const opened=await preparationOpenFile(file,{maximum:['project','job-result'].includes(value.kind)?maxFileBytes:2*1024**3});
      const bytes=opened.bytes;await opened.handle.close();
      inputs[key]={file,bytes,kind:value.kind,sha256:value.sha256,label:label(value.label,basename(file)),
        ...(value.nullToken===undefined?{}:{nullToken:value.nullToken})};
    }
    for(const [key,value] of Object.entries(input.destinations??{})){
      alias(key);preparationExact(value,['label','directory'],['directory']);
      preparationNeed(typeof value.directory==='string'&&value.directory.length>0,'PREPARATION_DESTINATION_INVALID','Declare the original receiving directory.');
      const target=preparationAbsolute(resolve(base,value.directory));
      await preparationPrivateDirectory(dirname(target));
      try{await preparationPrivateDirectory(target);}catch(error){if(error.code!=='ENOENT')throw error;}
      destinations[key]={directory:target,label:label(value.label,key)};
    }
    workspaces[name]={label:label(input.label,identity.info.label),...identity,inputs,destinations,
      connectionFile:join(directory,PREPARATION_CONNECTION_FILENAME)};
  }
  for(const scope of Object.values(workspaces))for(const target of Object.values(scope.destinations))
    preparationNeed([...directories].every(directory=>target.directory!==directory&&
      !target.directory.startsWith(directory+'/')&&!directory.startsWith(target.directory+'/')),
    'PREPARATION_DESTINATION_CONFLICT','Receive into a separate customer directory beside the original workspaces.');
  return {configuration:path,sha256:source.sha256,maxFileBytes,maxExpandedBytes,workspaces,
    ...(raw.python===undefined?{}:{python:preparationAbsolute(raw.python)})};
}
export class MerchantPreparationWorkspaces{
  #config;#clients=new Map();#files;#commissioning;#commissioningReady;#pending=new Set();#tails=new Map();#closing=false;#closed;
  constructor(config){
    this.#config=config;this.#files=new PreparationCustomerFiles(config.preparationWorkspaces?.maxFileBytes);
  }
  get summary(){return {configured:Boolean(this.#config.preparationWorkspaces),connected:[...this.#clients.keys()],
    pending:this.#pending.size,closing:this.#closing,...this.#files.summary,
    commissioning:this.#commissioning?.summary??null};}
  async #commissioningOwner(){
    if(!this.#commissioningReady)this.#commissioningReady=import('./jobs/merchant.mjs')
      .then(({PreparationCommissioning})=>this.#commissioning=new PreparationCommissioning())
      .catch(error=>{this.#commissioningReady=null;
        if(error.code==='ERR_MODULE_NOT_FOUND')preparationNeed(false,'PREPARATION_COMMISSIONING_NOT_INSTALLED',
          'Install the complete data-preparation-jobs selection to operate pipeline commissioning.',409);
        throw error;});
    return this.#commissioningReady;
  }
  #scope(name){
    const value=this.#config.preparationWorkspaces?.workspaces?.[alias(name)];
    preparationNeed(value,'PREPARATION_WORKSPACE_NOT_CONFIGURED','Choose a workspace from merchant_preparation_status.',404);
    return {...value,alias:name};
  }
  #client(scope){
    const client=this.#clients.get(scope.alias);
    preparationNeed(client,'PREPARATION_WORKSPACE_DISCONNECTED','Connect the original Applications listener.',409);return client;
  }
  #input(scope,args,kind){
    const selected=scope.inputs[alias(args.sourceInput)];
    preparationNeed(selected&&(kind==='tabular'?['csv','jsonl'].includes(selected.kind):selected.kind===kind)&&
      selected.sha256===args.expectedSourceSha256,'PREPARATION_SOURCE_CHANGED',
    'Choose a declared original source and its reviewed SHA-256.',409);return selected;
  }
  #destination(scope,name){
    const value=scope.destinations[alias(name)];
    preparationNeed(value,'PREPARATION_DESTINATION_NOT_CONFIGURED','Choose a declared customer receiving destination.');
    return value;
  }
  async #dispatch(name,args){
    const schema=schemas.get(name);
    preparationNeed(schema,'PREPARATION_TOOL_UNKNOWN','Choose a declared preparation tool.');
    preparationExact(args,Object.keys(schema.properties),schema.required);
    if(name==='merchant_preparation_status'&&args.workspace===undefined)return {...this.summary,
      workspaces:Object.entries(this.#config.preparationWorkspaces?.workspaces??{}).map(([workspace,scope])=>({
        workspace,label:scope.label,workspaceSha256:scope.workspaceSha256,
        state:this.#clients.has(workspace)?'CONNECTED':'DISCONNECTED',
        inputs:Object.entries(scope.inputs).map(([sourceInput,value])=>({sourceInput,label:value.label,kind:value.kind,bytes:value.bytes,sha256:value.sha256})),
        destinations:Object.entries(scope.destinations).map(([destination,value])=>({destination,...value})),
      }))};
    const scope=this.#scope(args.workspace);
    if(name.startsWith('merchant_preparation_job_')){
      const owner=await this.#commissioningOwner();
      return owner.call(name,args,{scope,python:this.#config.preparationWorkspaces.python,
        input:(value,kind)=>this.#input(scope,value,kind),
        destination:name=>this.#destination(scope,name),exported:fileId=>this.#files.record(scope,fileId)});
    }
    if(name==='merchant_preparation_connect'){
      const client=await PreparationWorkspaceClient.connect(scope.connectionFile,{
        directory:scope.directory,workspaceSha256:scope.workspaceSha256,expectedInstanceId:args.expectedInstanceId});
      const prior=this.#clients.get(scope.alias);
      if(prior){await prior.close();await this.#files.disconnect(scope);await this.#commissioning?.disconnect(scope);}
      this.#clients.set(scope.alias,client);
      return {workspace:scope.alias,state:'CONNECTED',...client.connection,native:await client.status()};
    }
    if(name==='merchant_preparation_disconnect'){
      const client=this.#clients.get(scope.alias);
      preparationNeed(!client||client.connection.instanceId===args.instanceId,'PREPARATION_INSTANCE_CHANGED',
        'Use the currently attached original instance ID.',409);
      await client?.close();await this.#files.disconnect(scope);await this.#commissioning?.disconnect(scope);this.#clients.delete(scope.alias);
      return {workspace:scope.alias,state:'DISCONNECTED',instanceId:args.instanceId};
    }
    if(name==='merchant_preparation_export'||name==='merchant_preparation_pipeline_export'){
      const {workspace,...request}=args;
      const fileId=preparationDigest(Buffer.from(JSON.stringify([scope.workspaceSha256,args.operationId])));
      let selected;
      try{selected=await this.#files.record(scope,fileId);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(selected){
        preparationNeed(canonical(selected.record.request)===canonical(request),'PREPARATION_OPERATION_REUSED',
          'This operation ID belongs to different original delivery arguments.',409);
        const original=await preparationOpenFile(selected.path,{privateOnly:true});
        try{preparationNeed(original.bytes===selected.record.bytes&&await preparationHashFile(original)===selected.record.sha256,
          'PREPARATION_DELIVERY_CHANGED','The completed original delivery bytes changed.',409);}
        finally{await original.handle.close();}
        return {...selected.record,reused:true};
      }
      return this.#client(scope).exportDelivery(request);
    }
    if(name==='merchant_preparation_exports')return this.#files.list(scope,args);
    if(name==='merchant_preparation_file')return this.#files.read(scope,args);
    if(name==='merchant_preparation_file_release'){
      await this.#files.release(scope,args.readId);return {workspace:scope.alias,readId:args.readId,released:true};
    }
    if(name==='merchant_preparation_received')
      return inspectReceivedPreparation(this.#destination(scope,args.destination).directory);
    if(name==='merchant_preparation_receive'){
      preparationNeed(Boolean(args.sourceInput)!==Boolean(args.fileId),'PREPARATION_RECEIVING_SOURCE_INVALID',
        'Choose exactly one declared project sourceInput or one retained project fileId.');
      const destination=this.#destination(scope,args.destination);
      let archive;
      if(args.sourceInput)archive=this.#input(scope,args,'project').file;
      else{
        const selected=await this.#files.record(scope,args.fileId);
        preparationNeed(selected.record.kind==='project'&&selected.record.sha256===args.expectedSourceSha256,
          'PREPARATION_RECEIVING_SOURCE_CHANGED','Choose the complete project delivery and its exact SHA-256.',409);
        archive=selected.path;
      }
      return receivePreparationWorkspace({archive,directory:destination.directory,expectedSha256:args.expectedSourceSha256,
        maxBytes:this.#config.preparationWorkspaces.maxExpandedBytes});
    }
    if(name==='merchant_preparation_status'&&!this.#clients.has(scope.alias))
      return {workspace:scope.alias,state:'DISCONNECTED',workspaceSha256:scope.workspaceSha256};
    const client=this.#client(scope),{workspace,...value}=args;
    if(name.startsWith('merchant_preparation_pipeline_')){
      const pipelines=new PreparationPipelineClient(client);
      switch(name){
        case 'merchant_preparation_pipeline_status':return pipelines.status();
        case 'merchant_preparation_pipeline_browser':return pipelines.browser();
        case 'merchant_preparation_pipeline_list':return pipelines.list(args.collection,value);
        case 'merchant_preparation_pipeline_definition':return pipelines.definition(args.pipelineId,value);
        case 'merchant_preparation_pipeline_save':return pipelines.save(args.definition,value);
        case 'merchant_preparation_pipeline_from_recipe':return pipelines.fromRecipe(args.recipeId,value);
        case 'merchant_preparation_pipeline_enqueue':return pipelines.enqueue(args.pipelineId,args.requestKey,value);
        case 'merchant_preparation_pipeline_execute':return pipelines.execute(args.executionId,value);
        case 'merchant_preparation_pipeline_execution':return pipelines.execution(args.executionId);
        case 'merchant_preparation_pipeline_events':return pipelines.events(args.executionId,value);
        case 'merchant_preparation_pipeline_rows':return pipelines.rows(args.executionId,args.stageId,value);
        case 'merchant_preparation_pipeline_cancel':return pipelines.cancel(args.executionId);
        case 'merchant_preparation_pipeline_recover':return pipelines.recover();
        case 'merchant_preparation_pipeline_review':return pipelines.review(args.executionId,args.stageId,value);
        case 'merchant_preparation_pipeline_compare':return pipelines.compare(args.beforeId,args.afterId);
        case 'merchant_preparation_pipeline_received':return pipelines.received();
        case 'merchant_preparation_pipeline_open_received':return pipelines.openReceived(args.receivedId);
        case 'merchant_preparation_pipeline_receive':{
          preparationNeed(Boolean(args.sourceInput)!==Boolean(args.fileId),'PREPARATION_RECEIVING_SOURCE_INVALID',
            'Choose exactly one declared sourceInput or complete retained pipeline-project fileId.');
          let archive;
          if(args.sourceInput)archive=this.#input(scope,args,'project').file;
          else{
            const selected=await this.#files.record(scope,args.fileId);
            preparationNeed(selected.record.kind==='pipeline-project'&&selected.record.sha256===args.expectedSourceSha256&&
              selected.record.bytes<=this.#config.preparationWorkspaces.maxFileBytes,
            'PREPARATION_PIPELINE_RECEIVING_SOURCE_CHANGED','Choose the complete original pipeline-project delivery and its reviewed SHA-256.',409);
            archive=selected.path;
          }
          return pipelines.receiveProject(archive,{requestKey:args.requestKey,expectedSha256:args.expectedSourceSha256});
        }
        default:preparationNeed(false,'PREPARATION_TOOL_UNKNOWN','Choose a declared original pipeline operation.');
      }
    }
    switch(name){
      case 'merchant_preparation_status':return {workspace,state:'CONNECTED',...client.connection,native:await client.status()};
      case 'merchant_preparation_browser':return client.browser();
      case 'merchant_preparation_records':return client.records(args.collection,value);
      case 'merchant_preparation_source_page':return client.sourcePage(args.sourceId,value);
      case 'merchant_preparation_result_page':return client.resultPage(args.runId,value);
      case 'merchant_preparation_import_source':{
        const input=this.#input(scope,args,'tabular');
        return client.importFile(input.file,{alias:args.alias,format:input.kind,label:input.label,
          nullToken:input.nullToken,expectedSha256:input.sha256});
      }
      case 'merchant_preparation_save_recipe':return client.saveRecipe(value);
      case 'merchant_preparation_run':return client.run(args.recipeId,args.revision);
      case 'merchant_preparation_start':return client.start(args.runId);
      case 'merchant_preparation_rerun':return client.rerun(args.runId);
      case 'merchant_preparation_cancel':return client.cancel(args.runId);
      case 'merchant_preparation_recover':return client.recover();
      case 'merchant_preparation_review':return client.review({run_id:args.runId,decision:args.decision,
        reviewer:args.reviewer,note:args.note,expected_revision:args.expectedRevision??0});
      default:preparationNeed(false,'PREPARATION_TOOL_UNKNOWN','Choose a declared original preparation operation.');
    }
  }
  async call(name,args={}){
    preparationNeed(!this.#closing,'PREPARATION_MCP_CLOSING','The preparation attachments are closing.',409);
    const key=typeof args.workspace==='string'?args.workspace:'';
    const operation=(this.#tails.get(key)??Promise.resolve()).then(()=>this.#dispatch(name,args));
    const tail=operation.catch(()=>{});this.#tails.set(key,tail);this.#pending.add(operation);
    try{return await operation;}
    finally{this.#pending.delete(operation);if(this.#tails.get(key)===tail)this.#tails.delete(key);}
  }
  close(){
    if(this.#closed)return this.#closed;this.#closing=true;
    return this.#closed=(async()=>{
      await Promise.allSettled([...this.#pending]);
      await Promise.all([...this.#clients.values()].map(client=>client.close()));
      await this.#files.close();await this.#commissioning?.close();this.#clients.clear();
    })();
  }
}
export {preparationWorkspaceTools} from './tools.mjs';
