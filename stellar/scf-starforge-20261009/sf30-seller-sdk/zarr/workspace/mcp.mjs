/** Host-declared attachments to the original Zarr operator; no second workspace. */
import {resolve,dirname,join} from 'node:path';
import {ZARR_ROOT,UUID,HASH,CONNECTION_FILENAME,need,fields,readJson,directoryIdentity,readZarrConnection,ZarrWorkspaceClient,sha} from './bridge.mjs';
import {zarrWorkspaceTools} from './catalog.mjs';
export const ZARR_MCP_CONFIGURATION_SCHEMA='stellar-forge.zarr-workspaces.v1';
const ALIAS=/^[a-z][a-z0-9-]{0,63}$/;
const schemas=new Map(zarrWorkspaceTools((name,_description,properties,required)=>({name,properties,required})).map(x=>[x.name,x]));
const READ=new Set(['merchant_zarr_status','merchant_zarr_browser','merchant_zarr_operation','merchant_zarr_result_page','merchant_zarr_frozen','merchant_zarr_files','merchant_zarr_file_read','merchant_zarr_publisher_requests']);
const PUBLISHER_READ=new Set(['source','status','target','plan','run','inspect','buyer-offer','cancel']);
export async function readZarrWorkspaceConfiguration(path){
 const read=await readJson(resolve(path),{maximum:1024*1024,privateFile:true}),value=fields(read.value,['schema','workspaces']);
 need(value.schema===ZARR_MCP_CONFIGURATION_SCHEMA&&value.workspaces&&typeof value.workspaces==='object'&&!Array.isArray(value.workspaces),
  'ZARR_MCP_CONFIGURATION','Declare original workspace aliases in the host configuration');
 const entries=Object.entries(value.workspaces),workspaces=Object.create(null),seen=new Set();
 need(entries.length>=1&&entries.length<=64,'ZARR_MCP_CONFIGURATION','Declare 1–64 original workspaces');
 for(const [alias,input] of entries){
  need(ALIAS.test(alias),'ZARR_MCP_ALIAS','Use a declared original workspace alias');
  fields(input,['label','directory','workspaceId','workspaceSha256'],['directory','workspaceId','workspaceSha256']);
  need(UUID.test(input.workspaceId)&&HASH.test(input.workspaceSha256)&&typeof input.directory==='string'&&input.directory,
   'ZARR_MCP_BINDING','Retain the original workspace UUID, storage identity and directory');
  const directory=resolve(dirname(read.identity.path),input.directory);await directoryIdentity(directory,{privateDirectory:true});
  need(!seen.has(directory),'ZARR_MCP_DUPLICATE','Declare one alias for each original workspace');seen.add(directory);
  const label=input.label??alias;need(typeof label==='string'&&label.trim()&&label.length<=160,'ZARR_MCP_LABEL','Use a plain workspace label');
  workspaces[alias]={label:label.trim(),directory,workspaceId:input.workspaceId,workspaceSha256:input.workspaceSha256,connectionFile:join(directory,CONNECTION_FILENAME)};
 }
 return {configuration:read.identity.path,sha256:read.identity.sha256,workspaces};
}
export class MerchantZarrWorkspaces{
 constructor(config){this.config=config;this.clients=new Map();this.pending=new Set();this.tails=new Map();this.closing=false;this.closed=null;}
 get summary(){return {configured:Boolean(this.config.zarrWorkspaces),connected:[...this.clients.keys()],pending:this.pending.size,closing:this.closing};}
 scope(alias){need(ALIAS.test(alias??''),'ZARR_MCP_ALIAS','Choose a declared workspace alias');const value=this.config.zarrWorkspaces?.workspaces?.[alias];need(value,'ZARR_MCP_UNCONFIGURED','Choose a workspace from merchant_zarr_status',404);return {...value,alias};}
 client(scope){const value=this.clients.get(scope.alias);need(value,'ZARR_MCP_DISCONNECTED','Connect the original running operator first',409);return value;}
 async dispatch(name,args){
  const schema=schemas.get(name);need(schema,'ZARR_MCP_TOOL','Choose a declared Zarr tool');fields(args,Object.keys(schema.properties),schema.required,name);
  if(name==='merchant_zarr_status'&&args.workspace===undefined)return {...this.summary,
   workspaces:Object.entries(this.config.zarrWorkspaces?.workspaces??{}).map(([workspace,x])=>({workspace,label:x.label,workspaceId:x.workspaceId,workspaceSha256:x.workspaceSha256,state:this.clients.has(workspace)?'CONNECTED':'DISCONNECTED'}))};
  for(const [key,value] of Object.entries(args)){const spec=schema.properties[key];if(spec?.pattern)need(typeof value==='string'&&new RegExp(spec.pattern).test(value),'ZARR_MCP_ARGUMENT','Use the exact declared '+key);if(spec?.enum)need(spec.enum.includes(value),'ZARR_MCP_ARGUMENT','Choose a declared '+key);if(spec?.type==='integer')need(Number.isSafeInteger(value)&&value>=(spec.minimum??0)&&value<=(spec.maximum??Number.MAX_SAFE_INTEGER),'ZARR_MCP_ARGUMENT','Use an exact bounded '+key);}
  const scope=this.scope(args.workspace);
  if(name==='merchant_zarr_connect'){
   const saved=await readZarrConnection(scope.connectionFile,{workspaceId:scope.workspaceId,workspaceSha256:scope.workspaceSha256});
   need(saved.value.directory===scope.directory&&(!args.expectedInstanceId||saved.value.instanceId===args.expectedInstanceId),
    'ZARR_MCP_INSTANCE','The declared original connection or requested instance changed',409);
   const client=new ZarrWorkspaceClient(saved.value);
   let session;try{session=await client.connect();}catch(error){await client.close();throw error;}
   await this.clients.get(scope.alias)?.close();this.clients.set(scope.alias,client);
   return {workspace:scope.alias,state:'CONNECTED',instanceId:session.instanceId,workspaceId:session.workspaceId,workspaceSha256:session.workspaceSha256,connections:session.connections,runtime:session.runtime};
  }
  if(name==='merchant_zarr_disconnect'){
   const client=this.clients.get(scope.alias);need(!client||client.connection.instanceId===args.instanceId,'ZARR_MCP_INSTANCE','Disconnect the actual attached instance',409);
   await client?.close();this.clients.delete(scope.alias);return {workspace:scope.alias,state:'DISCONNECTED',instanceId:args.instanceId};
  }
  if(name==='merchant_zarr_status'&&!this.clients.has(scope.alias))return {workspace:scope.alias,state:'DISCONNECTED',workspaceId:scope.workspaceId,workspaceSha256:scope.workspaceSha256};
  const client=this.client(scope);
  switch(name){
   case 'merchant_zarr_status':return {workspace:scope.alias,state:'CONNECTED',instanceId:client.connection.instanceId,native:await client.request('/api/status')};
   case 'merchant_zarr_browser':return {workspace:scope.alias,instanceId:client.connection.instanceId,url:client.connection.origin+'/#token='+client.connection.token};
   case 'merchant_zarr_prepare':return client.request('/api/prepare',{method:'POST',body:args.intent});
   case 'merchant_zarr_apply':return client.request('/api/apply',{method:'POST',body:args.prepared});
   case 'merchant_zarr_operation':return client.request('/api/operations/'+args.operationId);
   case 'merchant_zarr_resume':return client.request('/api/resume',{method:'POST',body:{id:args.operationId}});
   case 'merchant_zarr_result_page':return client.request('/api/results/'+args.resultId+'?offset='+args.offset+'&limit='+args.limit);
   case 'merchant_zarr_frozen':return client.request('/api/frozen/'+args.frozenId);
   case 'merchant_zarr_export':return client.request('/api/export',{method:'POST',body:{id:args.operationId}});
   case 'merchant_zarr_receive':return client.request('/api/receive',{method:'POST',body:{id:args.operationId,inputId:args.inputId,destinationId:args.destinationId}});
   case 'merchant_zarr_files':return client.request('/api/files');
   case 'merchant_zarr_file_read':{
    need(HASH.test(args.expectedSha256)&&Number.isSafeInteger(args.offset)&&args.offset>=0&&Number.isSafeInteger(args.limit)&&args.limit>=1&&args.limit<=1048576,
     'ZARR_MCP_RANGE','Read an exact original range of at most 1 MiB');
    const value=await client.request('/api/files/'+args.fileId+'/read?offset='+args.offset+'&limit='+args.limit),raw=Buffer.from(value.content??'','base64');
    need(value.file?.id===args.fileId&&value.file.sha256===args.expectedSha256&&value.offset===args.offset&&value.bytes===raw.length&&sha(raw)===value.sha256&&
     value.encoding==='base64'&&raw.toString('base64')===value.content,'ZARR_MCP_FILE_CHANGED','The original complete file or returned range changed',409);
    return value;
   }
   case 'merchant_zarr_publisher':return client.request('/api/publisher',{method:'POST',body:{frozenId:args.frozenId,action:args.action,input:args.input,...(args.requestId===undefined?{}:{requestId:args.requestId})}});
   case 'merchant_zarr_publisher_requests':return client.request('/api/publisher-requests');
   case 'merchant_zarr_publisher_request_recover':return client.request('/api/publisher-request/recover',{method:'POST',body:{requestId:args.requestId}});
   case 'merchant_zarr_publisher_request_close':return client.request('/api/publisher-request/close',{method:'POST',body:{requestId:args.requestId,reason:args.reason}});
  }
 }
 async call(name,args={}){
  need(!this.closing,'ZARR_MCP_CLOSING','The original Zarr attachments are closing',409);
  const concurrent=READ.has(name)||name==='merchant_zarr_publisher'&&PUBLISHER_READ.has(args.action);
  const key=typeof args.workspace==='string'?args.workspace:'';
  const promise=concurrent?Promise.resolve().then(()=>this.dispatch(name,args)):(this.tails.get(key)??Promise.resolve()).then(()=>this.dispatch(name,args));
  const tail=promise.catch(()=>{});if(!concurrent)this.tails.set(key,tail);this.pending.add(promise);
  try{return await promise;}finally{this.pending.delete(promise);if(this.tails.get(key)===tail)this.tails.delete(key);}
 }
 close(){
  if(this.closed)return this.closed;this.closing=true;
  return this.closed=(async()=>{await Promise.allSettled([...this.pending]);await Promise.all([...this.clients.values()].map(x=>x.close()));this.clients.clear();})();
 }
}
export {zarrWorkspaceTools} from './catalog.mjs';
