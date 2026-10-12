// MIT. Typed control and complete native receiving through the original merchant MCP.
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {openMerchantFileClient,createRetainedDownload} from './retained-download.mjs';
import {
 API_MERCHANT_PREFIX,API_MERCHANT_ALIAS,API_MERCHANT_UUID,API_MERCHANT_HASH,API_MERCHANT_ACTIONS,
 API_MERCHANT_MANIFEST,API_MERCHANT_MAX_FILE_BYTES,API_MERCHANT_MAX_MANIFEST_BYTES,
 apiMerchantPlain,apiMerchantNeed,apiMerchantArguments,parseApiMerchantExport,
} from './api-merchant-protocol.mjs';
const DOWNLOAD_STATE='stellar-forge.sf101.api-merchant-mcp-download-state.v1';
const DOWNLOAD_RESULT='stellar-forge.sf101.api-merchant-mcp-download.v1';
const METHODS={
 view:'view',inventory:'inventory',selections:'selections',preview:'preview',refreshSource:'source_refresh',
 prepareOffer:'offer_prepare',publishOffer:'offer_publish',adoptOffer:'offer_adopt',
 prepareOrder:'order_prepare',adoptOrder:'order_adopt',start:'start',stop:'stop',attachPass:'attach_pass',
 updateAccess:'access',recoverCall:'recover_call',releaseCall:'release_call',exportUsage:'export_usage',
 exportResult:'export_result',backup:'backup',restore:'restore',operation:'operation',resume:'resume',cancel:'cancel',
 offer:'offer',order:'order',executions:'executions',execution:'execution',manifest:'manifest',readFileChunk:'file',
 releaseFile:'file_release',restoreBundle:'restore_bundle',
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function binding(workspace,workspaceId){
 apiMerchantNeed(typeof workspace==='string'&&typeof workspaceId==='string'&&API_MERCHANT_ALIAS.test(workspace)&&API_MERCHANT_UUID.test(workspaceId),
  'Select the alias and original workspace ID returned by merchant_api_console_workspaces.','API_MERCHANT_CLIENT_CONFIGURATION');
 return '#api-merchant-workspace='+encodeURIComponent(workspace)+'&workspace-id='+workspaceId;
}
function nativeReply(result,workspace,workspaceId){
 apiMerchantNeed(apiMerchantPlain(result)&&result.workspace===workspace&&result.workspaceId===workspaceId&&apiMerchantPlain(result.native),
  'The reply must belong to this selected original merchant workspace.','API_MERCHANT_CLIENT_WORKSPACE_CHANGED');
 return result.native;
}
function transfer({workspace,workspaceId,connect}){
 const suffix=binding(workspace,workspaceId);
 return createRetainedDownload({
  manifestName:API_MERCHANT_MANIFEST,parseManifest:parseApiMerchantExport,maximumBytes:API_MERCHANT_MAX_FILE_BYTES,
  maximumManifestBytes:API_MERCHANT_MAX_MANIFEST_BYTES,maximumCheckpointBytes:1024*1024,
  stateSchema:DOWNLOAD_STATE,resultSchema:DOWNLOAD_RESULT,toolPrefix:API_MERCHANT_PREFIX.slice(0,-1),
  errorPrefix:'API_MERCHANT_AGENT',clientName:'starforge-api-merchant-receiving',
  validateExportId:value=>apiMerchantNeed(API_MERCHANT_UUID.test(value??''),'Select an original export ID.','API_MERCHANT_CLIENT_EXPORT_REQUIRED'),
  describe:manifest=>({workspace,workspaceId,kind:manifest.kind,label:manifest.label,createdAt:manifest.createdAt}),
  connect:connect??(async options=>{
   const transport=await openMerchantFileClient(options);
   return {endpoint:transport.endpoint+suffix,async call(name,args,request){
    return nativeReply(await transport.call(name,apiMerchantArguments(name,{...args,workspace}),request),workspace,workspaceId);
   }};
  }),
 });
}
/** Read source-owned aliases without opening another native merchant workspace. */
export async function discoverApiMerchantWorkspaces({call}={}){
 apiMerchantNeed(typeof call==='function','Supply the existing structured MCP caller.','API_MERCHANT_CLIENT_CONFIGURATION');
 const result=await call(API_MERCHANT_PREFIX+'workspaces',{});
 apiMerchantNeed(apiMerchantPlain(result)&&Array.isArray(result.workspaces)&&result.workspaces.every(item=>
  apiMerchantPlain(item)&&API_MERCHANT_ALIAS.test(item.workspace??'')&&API_MERCHANT_UUID.test(item.workspaceId??'')),
  'The original provider must return its configured workspace aliases.','API_MERCHANT_CLIENT_CONFIGURATION');
 return result;
}
/** The caller drains its accepted requests; the original console retains native ownership. */
export function createApiMerchantWorkspaceClient({workspace,workspaceId,call,endpoint}={}){
 const suffix=binding(workspace,workspaceId);
 apiMerchantNeed(typeof call==='function','Supply the existing structured MCP caller.','API_MERCHANT_CLIENT_CONFIGURATION');
 let closing=false,closePromise;const pending=new Set();
 function captured(kind,input={}){
  apiMerchantNeed(apiMerchantPlain(input)&&!Object.hasOwn(input,'workspace'),'Use this caller’s selected workspace.');
  const {workspace:alias,...request}=apiMerchantArguments(kind,{...input,workspace});return request;
 }
 async function wire(kind,input={},options){
  apiMerchantNeed(apiMerchantPlain(input)&&!Object.hasOwn(input,'workspace'),'Use this caller’s selected workspace.');
  const args=apiMerchantArguments(kind,{...input,workspace}),name=kind.startsWith(API_MERCHANT_PREFIX)?kind:API_MERCHANT_PREFIX+kind;
  return nativeReply(await call(name,args,options),workspace,workspaceId);
 }
 function tracked(work){
  apiMerchantNeed(!closing,'This caller is draining or closed.','API_MERCHANT_CLIENT_CLOSING');
  const promise=Promise.resolve().then(work);pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;
 }
 async function settledOperation({operationId,requestSha256,pollIntervalMs=350},options={}){
  apiMerchantNeed(API_MERCHANT_UUID.test(operationId??'')&&(requestSha256===undefined||API_MERCHANT_HASH.test(requestSha256))&&
   Number.isSafeInteger(pollIntervalMs)&&pollIntervalMs>=100&&pollIntervalMs<=60000,
   'Retain the original operation ID, optional request SHA and a polling interval.','API_MERCHANT_CLIENT_OPERATION_REQUIRED');
  for(;;){
   options.requestSignal?.throwIfAborted();
   const result=await wire('operation',{operationId},options);
   apiMerchantNeed(result.id===operationId&&(requestSha256===undefined||result.requestSha256===requestSha256),
    'The original saved operation request changed.','API_MERCHANT_CLIENT_OPERATION_CHANGED');
   if(['COMPLETED','ATTENTION','CANCELLED'].includes(result.status))return result;
   apiMerchantNeed(['QUEUED','RUNNING'].includes(result.status),'The original operation state is unavailable.','API_MERCHANT_CLIENT_OPERATION_CHANGED');
   await delay(pollIntervalMs,undefined,{signal:options.requestSignal??undefined});
  }
 }
 const client={workspace,workspaceId,endpoint,
  invoke:(kind,args={},options)=>{
   const request=captured(kind,args),settings={...options};return tracked(()=>wire(kind,request,settings));
  },
  waitOperation:(args,options)=>{
   apiMerchantNeed(apiMerchantPlain(args),'Supply the retained operation selection.','API_MERCHANT_CLIENT_OPERATION_REQUIRED');
   const request={...args},settings={...options};return tracked(()=>settledOperation(request,settings));
  },
  run:(kind,args,options)=>{
   apiMerchantNeed(API_MERCHANT_ACTIONS.includes(kind),'Choose one of the native durable actions.','API_MERCHANT_CLIENT_OPERATION_REQUIRED');
   const request=captured(kind,args),settings={...options};
   return tracked(async()=>{
    const accepted=await wire(kind,request,settings),operation=accepted.operation;
    apiMerchantNeed(operation?.id===request.operationId&&API_MERCHANT_HASH.test(operation.requestSha256??''),
     'The original acceptance must retain this operation and exact request SHA.','API_MERCHANT_CLIENT_OPERATION_CHANGED');
    return settledOperation({operationId:operation.id,requestSha256:operation.requestSha256},settings);
   });
  },
  allInventory:(collection,options={})=>tracked(async()=>{
   const items=[];let offset=0,revision,total;
   for(;;){
    const page=await wire('inventory',{collection,offset,limit:50,...(revision===undefined?{}:{expectedRevision:revision})},options);
    revision??=page.revision;total??=page.total;
    apiMerchantNeed(page.collection===collection&&page.workspaceId===workspaceId&&page.revision===revision&&page.offset===offset&&
     page.total===total&&Number.isSafeInteger(total)&&total>=0&&Array.isArray(page.items)&&page.items.length<=50,
     'The original inventory changed between pages.','API_MERCHANT_CLIENT_PAGE_CHANGED');
    items.push(...page.items);
    if(page.nextOffset===null){
     apiMerchantNeed(items.length===total,'The original inventory ended early.','API_MERCHANT_CLIENT_PAGE_CHANGED');
     return {workspaceId,collection,revision,total,items};
    }
    apiMerchantNeed(page.nextOffset===offset+page.items.length&&page.nextOffset>offset&&page.nextOffset<total,
     'The original inventory cursor did not advance.','API_MERCHANT_CLIENT_PAGE_CHANGED');offset=page.nextOffset;
   }
  }),
  downloadExport:options=>{
   apiMerchantNeed(apiMerchantPlain(options)&&!Object.hasOwn(options,'client')&&!Object.hasOwn(options,'url'),
    'Receive through this caller’s selected original transport.','API_MERCHANT_CLIENT_CONFIGURATION');
   const selected={...options};
   return tracked(async()=>{
    apiMerchantNeed(typeof endpoint==='string'&&endpoint.length>0&&endpoint.length+suffix.length<=4096,
     'Retain the stable endpoint identity for complete receiving.','API_MERCHANT_CLIENT_ENDPOINT_REQUIRED');
    const receiver=transfer({workspace,workspaceId,connect:async settings=>({endpoint:endpoint+suffix,
     call:(name,args,request)=>wire(name,args,{requestSignal:settings.signal,...request})})});
    return receiver.download(selected);
   });
  },
  disconnect(){
   if(!closePromise){closing=true;closePromise=(async()=>{await Promise.allSettled([...pending]);})();}
   return closePromise;
  },
 };
 for(const [method,kind]of Object.entries(METHODS))client[method]=(args={},options)=>{
  const request=captured(kind,args),settings={...options};return tracked(()=>wire(kind,request,settings));
 };
 return Object.freeze(client);
}
export async function connectApiMerchantWorkspaceClient({workspace,workspaceId,...options}={}){
 apiMerchantNeed(API_MERCHANT_ALIAS.test(workspace??''),'Select the original workspace alias.','API_MERCHANT_CLIENT_CONFIGURATION');
 const transport=await openMerchantFileClient({...options,errorPrefix:'API_MERCHANT_AGENT',clientName:'starforge-api-merchant-workspace'});
 if(workspaceId===undefined){
  const inventory=await discoverApiMerchantWorkspaces({call:transport.call});
  workspaceId=inventory.workspaces.find(item=>item.workspace===workspace)?.workspaceId;
 }
 return createApiMerchantWorkspaceClient({workspace,workspaceId,call:transport.call,endpoint:transport.endpoint});
}
export async function downloadApiMerchantExport({workspace,workspaceId,...options}={}){
 apiMerchantNeed(!Object.hasOwn(options,'client'),'Use createApiMerchantWorkspaceClient for an existing structured transport.','API_MERCHANT_CLIENT_CONFIGURATION');
 return transfer({workspace,workspaceId}).download(options);
}
export async function inspectApiMerchantExportDownload({workspace,workspaceId,...options}={}){
 apiMerchantNeed(!Object.hasOwn(options,'client'),'Use the selected original HTTP endpoint.','API_MERCHANT_CLIENT_CONFIGURATION');
 return transfer({workspace,workspaceId}).inspect(options);
}
/** Reopen complete original files offline, verifying their original download binding and every member. */
export async function reopenApiMerchantExportDownload({directory,expectedManifestSha256,workspace,workspaceId,endpoint}={}){
 const suffix=binding(workspace,workspaceId),receiver=transfer({workspace,workspaceId});
 return receiver.lockedDownload(directory,async context=>{
  const bytes=await receiver.bytesAt(join(context.root,API_MERCHANT_MANIFEST),API_MERCHANT_MAX_MANIFEST_BYTES),
   manifest=parseApiMerchantExport(bytes),saved=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
    await receiver.bytesAt(join(context.stateDirectory,'checkpoint.json'),1024*1024)));
  apiMerchantNeed(saved.schema===DOWNLOAD_STATE&&typeof saved.endpoint==='string'&&saved.endpoint.endsWith(suffix)&&
   (endpoint===undefined||saved.endpoint===endpoint+suffix),
   'Reopen the complete files from this original endpoint, alias and workspace ID.','API_MERCHANT_CLIENT_DOWNLOAD_BINDING');
  if(expectedManifestSha256!==undefined)apiMerchantNeed(API_MERCHANT_HASH.test(expectedManifestSha256)&&sha(bytes)===expectedManifestSha256,
   'The saved manifest differs from the reviewed original SHA.','API_MERCHANT_CLIENT_DOWNLOAD_CHANGED');
  await receiver.loadContext(context,bytes,manifest.exportId,saved.endpoint);
  for(const file of manifest.files)await receiver.verifiedFile(join(context.root,file.name),file);
  return {schema:DOWNLOAD_RESULT,state:'REOPENED',directory:context.root,exportId:manifest.exportId,
   workspace,workspaceId,kind:manifest.kind,label:manifest.label,manifestSha256:sha(bytes),
   files:manifest.files.length,bytes:manifest.files.reduce((count,file)=>count+file.bytes,0)};
 });
}
