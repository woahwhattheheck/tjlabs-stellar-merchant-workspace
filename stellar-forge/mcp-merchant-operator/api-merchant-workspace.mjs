// MIT. Agent operations share the original running merchant and immutable native files.
import {randomUUID} from 'node:crypto';
import {ApiMerchantWorkspaceConnection} from './api-merchant-connection.mjs';
import {ApiMerchantNativeExports} from './api-merchant-exports.mjs';
import {restoreMerchantWorkspaceBundle} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/cli.mjs';
import {validateAction} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/operations.mjs';
import {digest,canonical} from '../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/configuration.mjs';
import {
 API_MERCHANT_PREFIX,API_MERCHANT_ACTIONS,apiMerchantArguments,apiMerchantNeed,apiMerchantError,
} from './api-merchant-protocol.mjs';
export {apiMerchantWorkspaceTools} from './api-merchant-protocol.mjs';

const path=value=>encodeURIComponent(value);
function query(input,fields){
 const params=new URLSearchParams();
 for(const name of fields)if(input[name]!==undefined)params.set(name,String(input[name]));
 return params.size?'?'+params.toString():'';
}
function nativeError(error,input,mutation){
 const code=/^[A-Z][A-Z0-9_]{1,140}$/.test(error?.code??'')?error.code:'API_MERCHANT_AGENT_OPERATION_FAILED';
 return apiMerchantError(code,error?.apiMerchantPublic?error.message:
  'The original merchant returned '+code+'.'+(input.operationId?' Reopen saved operation '+input.operationId+' before retrying.':''),
  {...(input.operationId?{operationId:input.operationId}:{}),...(input.receiving?{receiving:input.receiving}:{}),
   ...(Number.isInteger(error?.status)?{status:error.status}:{}),
   ...(mutation?{outcomeUnknown:typeof error?.outcomeUnknown==='boolean'?error.outcomeUnknown:!Number.isInteger(error?.status)||error.status>=500}:{})});
}
export class MerchantApiMerchantWorkspaces{
 #clients=new Map();#exports=new Map();#pending=new Set();#closing=false;#closePromise=null;
 constructor(config){
  for(const [alias,definition] of Object.entries(config.apiMerchantWorkspaces?.workspaces??{})){
   this.#clients.set(alias,new ApiMerchantWorkspaceConnection(definition));
   this.#exports.set(alias,new ApiMerchantNativeExports(alias,definition));
  }
 }
 get summary(){
  return {configured:this.#clients.size>0,closing:this.#closing,pendingRequests:this.#pending.size,
   workspaces:[...this.#clients].map(([workspace,client])=>({
    workspace,label:client.definition.label,workspaceId:client.definition.workspaceId,
    configSha256:client.definition.configSha256,
    applications:Object.entries(client.definition.applications).map(([handle,value])=>({handle,label:value.label,
     profileFileSha256:value.profileFileSha256,planFileSha256:value.planFileSha256})),
    receiving:Object.entries(client.definition.receiving).map(([handle,value])=>({handle,label:value.label,metadataSha256:value.metadataSha256})),
    files:this.#exports.get(workspace).summary,
   }))};
 }
 #client(alias){
  const selected=this.#clients.get(alias);
  apiMerchantNeed(selected,'Select an existing API merchant workspace alias.','API_MERCHANT_AGENT_WORKSPACE_REQUIRED');
  return selected;
 }
 async #execute(kind,args){
  if(kind==='workspaces')return this.summary;
  if(kind==='new_id')return {operationId:randomUUID()};
  const client=this.#client(args.workspace),files=this.#exports.get(args.workspace);
  const {workspace,...input}=args;let native;
  if(kind==='view'||kind==='inventory'){
   const current=await client.view(),state=current.workspace;
   const {functions,...source}=state.source;
   const collections={offers:state.offers,orders:state.orders,operations:state.operations,exports:state.exports,
    backups:state.backups,functions};
   apiMerchantNeed(Object.values(collections).every(Array.isArray),'The original workspace returned an incomplete inventory.','API_MERCHANT_AGENT_VIEW_CHANGED');
   if(kind==='view')native={workspaceId:state.id,revision:state.revision,source,fault:state.fault,service:current.service,
    counts:Object.fromEntries(Object.entries(collections).map(([name,items])=>[name,items.length]))};
   else{
    apiMerchantNeed(input.expectedRevision===undefined||input.expectedRevision===state.revision,
     'The original workspace changed between inventory pages. Refresh its revision.','API_MERCHANT_AGENT_REVISION_CHANGED');
    const rows=collections[input.collection],offset=input.offset??0,limit=input.limit??20;
    apiMerchantNeed(offset<=rows.length,'Select an offset within the original collection.','API_MERCHANT_AGENT_PAGE_REQUIRED');
    const items=rows.slice(offset,offset+limit),nextOffset=offset+items.length<rows.length?offset+items.length:null;
    native={workspaceId:state.id,revision:state.revision,collection:input.collection,offset,limit,total:rows.length,nextOffset,items};
   }
  }else if(kind==='selections')native=await client.selections();
  else if(kind==='preview')native=await client.json('/api/preview',{body:input});
  else if(API_MERCHANT_ACTIONS.includes(kind)){
   let body=input;
   if(kind==='offer_adopt'){
    const {application,...selected}=input;
    body={...selected,...await client.application(application)};
   }
   validateAction(kind,body);
   native=await client.json('/api/actions/'+kind,{body});
   if(native?.operation?.id!==input.operationId||native?.operation?.kind!==kind||native?.operation?.requestSha256!==digest(canonical(body)))
    throw apiMerchantError('API_MERCHANT_AGENT_ACCEPTANCE_CHANGED','Reopen the original saved operation before continuing.',{operationId:input.operationId,outcomeUnknown:true});
  }else if(kind==='operation')native=await client.json('/api/operations/'+path(input.operationId));
  else if(kind==='resume'||kind==='cancel'){
   native=await client.json('/api/operations/'+path(input.operationId)+'/'+kind,{body:{requestSha256:input.requestSha256}});
   const operation=kind==='resume'?native?.operation:native;
   if(operation?.id!==input.operationId||operation?.requestSha256!==input.requestSha256)
    throw apiMerchantError('API_MERCHANT_AGENT_ACCEPTANCE_CHANGED','Reopen the same original saved operation and request SHA.',{operationId:input.operationId,outcomeUnknown:true});
  }
  else if(kind==='offer')native=await client.json('/api/offers/'+path(input.offerId));
  else if(kind==='order')native=await client.json('/api/orders/'+path(input.orderReference)+query(input,['after','limit']));
  else if(kind==='executions')native=await client.json('/api/executions'+query(input,['offerId','after','limit']));
  else if(kind==='execution')native=await client.json('/api/executions/'+path(input.executionId)+query(input,['offerId']));
  else if(kind==='manifest')native=await files.manifest(input.exportId);
  else if(kind==='file')native=await files.file(input);
  else if(kind==='file_release'){await files.release(input.exportId,input.readId);native={exportId:input.exportId,readId:input.readId,released:true};}
  else if(kind==='restore_bundle')native=await restoreMerchantWorkspaceBundle(await client.receiving(input.receiving,input.expectedMetadataSha256));
  else throw apiMerchantError('TOOL_NOT_FOUND','Choose an original API merchant operation.');
  const result={workspace,workspaceId:client.definition.workspaceId,native};
  apiMerchantNeed(Buffer.byteLength(JSON.stringify(result))<=900000,
   'Select a smaller original inventory page or receive the complete exported files.','API_MERCHANT_AGENT_REPLY_REQUIRES_FILE');
  return result;
 }
 call(name,input={}){
  apiMerchantNeed(!this.#closing,'This merchant attachment is draining its accepted calls.','API_MERCHANT_AGENT_CLOSING');
  const kind=name.startsWith(API_MERCHANT_PREFIX)?name.slice(API_MERCHANT_PREFIX.length):name;
  const args=apiMerchantArguments(kind,input);
  const mutation=API_MERCHANT_ACTIONS.includes(kind)||['resume','cancel','restore_bundle'].includes(kind);
  const promise=Promise.resolve().then(()=>this.#execute(kind,args)).catch(error=>{throw nativeError(error,args,mutation);});
  this.#pending.add(promise);promise.finally(()=>this.#pending.delete(promise)).catch(()=>{});return promise;
 }
 close(){
  if(this.#closePromise)return this.#closePromise;
  this.#closing=true;
  this.#closePromise=(async()=>{
   await Promise.allSettled([...this.#pending]);
   const results=await Promise.allSettled([...this.#exports.values()].map(owner=>owner.close()));
   const failed=results.find(result=>result.status==='rejected');
   if(failed)throw failed.reason;
  })().catch(error=>{this.#closePromise=null;throw error;});
  return this.#closePromise;
 }
}
