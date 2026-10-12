// MIT. Merchant tools attach to the original authenticated browser owner.
import { dirname, resolve, join } from 'node:path';
import { connectCouchdbWorkspace } from '../client.mjs';
import { couchdbWorkspaceTools, COUCHDB_ACTION_TOOLS, COUCHDB_QUERIES, COUCHDB_FILE_KINDS } from './catalog.mjs';
import { need, only, object, UUID, HASH, readJson } from '../common.mjs';
export const COUCHDB_CONNECTION_SCHEMA='stellar-forge.couchdb-merchant-connection.v1';
const ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const definitions=new Map(couchdbWorkspaceTools((name,description,properties,required)=>({name,properties,required})).map(item=>[item.name,item]));
const actions=new Map(COUCHDB_ACTION_TOOLS.map(item=>[item.name,item.command]));
const alias=value=>{need(ALIAS.test(value??''),'COUCHDB_HOST_ALIAS_INVALID');return value;};
const path=(value,base)=>{need(typeof value==='string'&&value&&!value.includes('\0'),'COUCHDB_HOST_PATH_INVALID');return resolve(base,value);};
export async function readCouchdbWorkspaceConfiguration(file){
  const base=dirname(resolve(file)),input=await readJson(resolve(file),1048576);
  only(input,['schema','workspaces'],'COUCHDB_MERCHANT_CONFIGURATION_INVALID');
  need(input.schema===COUCHDB_CONNECTION_SCHEMA&&object(input.workspaces)&&Object.keys(input.workspaces).length>=1&&Object.keys(input.workspaces).length<=32,'COUCHDB_MERCHANT_CONFIGURATION_INVALID');
  const workspaces=Object.create(null);
  for(const [name,item]of Object.entries(input.workspaces)){
    alias(name);only(item,['label','workspaceId','connectionFile','imports','deliveries','receivers'],'COUCHDB_MERCHANT_CONFIGURATION_INVALID');
    need(UUID.test(item.workspaceId??'')&&(item.label===undefined||typeof item.label==='string'&&item.label.trim()&&item.label.length<=160),'COUCHDB_MERCHANT_CONFIGURATION_INVALID');
    const imports=Object.create(null),deliveries=Object.create(null),receivers=Object.create(null);
    for(const [family,out]of [['deliveries',deliveries],['receivers',receivers]]){
      need(item[family]===undefined||object(item[family])&&Object.keys(item[family]).length<=64,'COUCHDB_MERCHANT_CONFIGURATION_INVALID');
      for(const [key,value]of Object.entries(item[family]??{})){alias(key);only(value,['directory'],'COUCHDB_MERCHANT_CONFIGURATION_INVALID');out[key]={directory:path(value.directory,base)};}
    }
    need(item.imports===undefined||object(item.imports)&&Object.keys(item.imports).length<=64,'COUCHDB_MERCHANT_CONFIGURATION_INVALID');
    for(const [key,value]of Object.entries(item.imports??{})){
      alias(key);only(value,['kind','file','directory','sha256','exportId'],'COUCHDB_MERCHANT_IMPORT_INVALID');
      need(['connection','capture','client'].includes(value.kind)&&HASH.test(value.sha256??''),'COUCHDB_MERCHANT_IMPORT_INVALID');
      if(value.kind==='client'){
        need(ALIAS.test(value.exportId??'')&&value.file===undefined,'COUCHDB_MERCHANT_IMPORT_INVALID');
        imports[key]={kind:value.kind,directory:path(value.directory,base),sha256:value.sha256,exportId:value.exportId};
      }else{
        need(value.directory===undefined&&value.exportId===undefined,'COUCHDB_MERCHANT_IMPORT_INVALID');
        imports[key]={kind:value.kind,file:path(value.file,base),sha256:value.sha256};
      }
    }
    workspaces[name]={workspaceId:item.workspaceId,label:item.label??name,connectionFile:path(item.connectionFile,base),imports,deliveries,receivers};
  }
  return {schema:COUCHDB_CONNECTION_SCHEMA,workspaces};
}
export class MerchantCouchdbWorkspaces {
  #config;#pending=new Set();#closing=false;#close;
  constructor(config){this.#config=config;}
  get summary(){
    return {configured:Boolean(this.#config.couchdbWorkspaces),ownership:'ORIGINAL_COUCHDB_WORKSPACE',
      workspaces:Object.entries(this.#config.couchdbWorkspaces?.workspaces??{}).map(([workspace,item])=>({
        workspace,workspaceId:item.workspaceId,label:item.label,
        imports:Object.entries(item.imports).map(([source,value])=>({source,kind:value.kind,sha256:value.sha256})),
        deliveries:Object.keys(item.deliveries),receivers:Object.keys(item.receivers)}))};
  }
  async #execute(name,args){
    if(name==='merchant_couchdb_workspaces')return this.summary;
    const {workspace,workspaceId,...input}=args;alias(workspace);need(UUID.test(workspaceId??''),'COUCHDB_WORKSPACE_ID_REQUIRED');
    const selected=this.#config.couchdbWorkspaces?.workspaces[workspace];
    need(selected&&selected.workspaceId===workspaceId,'COUCHDB_WORKSPACE_NOT_CONFIGURED');
    const client=await connectCouchdbWorkspace({connectionFile:selected.connectionFile,expectedWorkspaceId:workspaceId});
    let result;
    if(actions.has(name)){
      need(UUID.test(input.operationId??'')&&object(input.input),'COUCHDB_SAVED_OPERATION_REQUIRED');
      result=await client.action(actions.get(name),input.input,{id:input.operationId});
    }else switch(name){
      case 'merchant_couchdb_status':result=client.info;break;
      case 'merchant_couchdb_query':
        need(COUCHDB_QUERIES.includes(input.query),'COUCHDB_QUERY_NOT_FOUND');result=await client.query(input.query,input.input??{});break;
      case 'merchant_couchdb_operations':result=await client.query('operations',input);break;
      case 'merchant_couchdb_operation':result=await client.query('operation',{id:input.operationId,includeResult:input.includeResult!==false});break;
      case 'merchant_couchdb_resume':result=await client.resume(input.operationId);break;
      case 'merchant_couchdb_cancel':result=await client.cancel(input.operationId);break;
      case 'merchant_couchdb_import':{
        const original=selected.imports[alias(input.source)];need(original,'COUCHDB_IMPORT_NOT_CONFIGURED');
        need(UUID.test(input.operationId??''),'COUCHDB_SAVED_OPERATION_REQUIRED');
        if(original.kind==='client')result=await client.action('client.receive',{directory:original.directory,exportId:original.exportId,expectedManifestSha256:original.sha256},{id:input.operationId});
        else result=await client.action(original.kind==='connection'?'connection.import':'capture.import',
          {file:original.file,expectedSha256:original.sha256,...(original.kind==='connection'?{label:input.label??input.source}:{})},{id:input.operationId});
        break;
      }
      case 'merchant_couchdb_file_metadata':
      case 'merchant_couchdb_file':
        need(COUCHDB_FILE_KINDS.includes(input.kind),'COUCHDB_FILE_NOT_FOUND');result=await client.query(name.endsWith('_metadata')?'file.metadata':'file.read',input);break;
      case 'merchant_couchdb_file_release':result=await client.query('file.release',input);break;
      case 'merchant_couchdb_download':{
        const destination=selected.deliveries[alias(input.delivery)];need(destination,'COUCHDB_DELIVERY_NOT_CONFIGURED');
        need(UUID.test(input.operationId??'')&&COUCHDB_FILE_KINDS.includes(input.kind),'COUCHDB_SAVED_OPERATION_REQUIRED');
        result=await client.download(input.kind,input.input,{directory:join(destination.directory,input.operationId),id:input.operationId,
          expectedSha256:input.expectedSha256,expectedBytes:input.expectedBytes});break;
      }
      case 'merchant_couchdb_receive':{
        const from=selected.deliveries[alias(input.delivery)],to=selected.receivers[alias(input.receiver)];
        need(from&&to&&UUID.test(input.downloadId??'')&&UUID.test(input.operationId??'')&&HASH.test(input.expectedSha256??''),'COUCHDB_RECEIVER_NOT_CONFIGURED');
        const source=join(from.directory,input.downloadId),retained=await readJson(join(source,'request.json'),1048576);
        need(retained.schema==='stellar-forge.couchdb-download.v1'&&retained.id===input.downloadId&&retained.workspaceId===workspaceId&&retained.kind==='export'&&
          retained.expectedSha256===input.expectedSha256,'COUCHDB_RECEIVING_DOWNLOAD_CHANGED');
        result=await client.action('project.receive',{file:join(source,'file.bin'),expectedSha256:input.expectedSha256,directory:to.directory},{id:input.operationId});break;
      }
      default:need(false,'TOOL_NOT_FOUND');
    }
    return {workspace,workspaceId,result};
  }
  async call(name,args={}){
    need(!this.#closing,'COUCHDB_AGENT_CLOSING',undefined,503);
    const definition=definitions.get(name);need(definition,'TOOL_NOT_FOUND');
    only(args,Object.keys(definition.properties),'COUCHDB_TOOL_INPUT_INVALID');
    need(definition.required.every(key=>Object.hasOwn(args,key)),'COUCHDB_TOOL_INPUT_REQUIRED');
    const job=Promise.resolve().then(()=>this.#execute(name,args));this.#pending.add(job);
    try{return await job;}finally{this.#pending.delete(job);}
  }
  close(){return this.#close??=(async()=>{this.#closing=true;await Promise.allSettled([...this.#pending]);})();}
}
