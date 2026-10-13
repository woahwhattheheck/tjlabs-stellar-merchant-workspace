// MIT. Configured Bank source artifacts through the existing Merchant accounting owner.
import {openMerchantFileClient} from './retained-download.mjs';
import {createAccountingMaintenanceClient} from './accounting-maintenance-client.mjs';
import {BANK_SOURCE_SCHEMA,BANK_SOURCE_MAX_BYTES,validateBankSourceRequest,canonicalHash,
  clone,need,exact,key,uuid,sha,integer,basename} from './accounting-bank-sources-contract.mjs';

const PREFIX='merchant_accounting_bank_sources_';
export const ACCOUNTING_BANK_SOURCES_METHODS=Object.freeze(['status','source','list','prepare','execute','request','view']);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>canonicalHash(a)===canonicalHash(b);
function fields(value,allowed,required=[]){exact(value,allowed,required);return clone(value);}
function pageArgs(v){if(v.offset!==undefined)integer(v.offset);if(v.limit!==undefined)integer(v.limit,1,100);}
export function accountingBankSourcesArguments(action,value={}){
 need(ACCOUNTING_BANK_SOURCES_METHODS.includes(action),'Choose a declared configured-source action.');
 let v;
 if(action==='status')return fields(value,[]);
 if(action==='source'){v=fields(value,['sourceAlias','name'],['sourceAlias','name']);key(v.sourceAlias);basename(v.name);}
 if(action==='list'){v=fields(value,['offset','limit']);pageArgs(v);}
 if(action==='prepare'){v=fields(value,['request'],['request']);v.request=validateBankSourceRequest(v.request);}
 if(action==='execute'){v=fields(value,['preparationId','expectedRequestSha256'],['preparationId','expectedRequestSha256']);uuid(v.preparationId);sha(v.expectedRequestSha256);}
 if(action==='request'){v=fields(value,['preparationId'],['preparationId']);uuid(v.preparationId);}
 if(action==='view'){
  v=fields(value,['preparationId','offset','limit','itemId','profileId','section','statementId'],['preparationId']);
  uuid(v.preparationId);pageArgs(v);if(v.itemId!==undefined)uuid(v.itemId);if(v.profileId!==undefined)uuid(v.profileId);
  if(v.section!==undefined)need(['items','statements','rows','pending','excluded','issues'].includes(v.section),'Choose a complete original output section.');
  if(v.statementId!==undefined)need(typeof v.statementId==='string'&&v.statementId.length>0&&v.statementId.length<=240,'Select the original statement ID.');
  if(['rows','pending','excluded'].includes(v.section))need(v.itemId&&v.statementId,'Select both original item and statement for complete rows.');
 }
 return v;
}
/** Validate an exact retained artifact receipt, including incomplete custody. */
export function validateAccountingBankSourceReceipt(value,{request,workspaceId}={}){
 need(plain(value)&&value.schema===BANK_SOURCE_SCHEMA,'Use the original source-preparation receipt.','REPLY');
 sha(value.workspaceId);uuid(value.preparationId);sha(value.requestSha256);sha(value.sourceSha256);
 need(['RETAINING','PREPARED','COMPLETE'].includes(value.state)&&typeof value.actor==='string'&&
  typeof value.kind==='string'&&Number.isFinite(Date.parse(value.createdAt)),'The preparation receipt identity is incomplete.','REPLY');
 if(workspaceId!==undefined)need(value.workspaceId===workspaceId,'The receipt belongs to another original workspace.','WORKSPACE');
 if(request){
  const selected=validateBankSourceRequest(request);
  need(value.workspaceId===selected.workspaceId&&value.preparationId===selected.requestId&&
   value.requestSha256===canonicalHash(selected)&&value.kind===selected.kind&&value.actor===selected.actor,
   'This preparation ID belongs to a different source request.','REQUEST_CHANGED');
 }
 need(Array.isArray(value.inputs)&&Array.isArray(value.files),'Keep the complete input and retained-file inventories.','REPLY');
 const inputs=new Set(),names=new Set();
 for(const row of value.inputs){key(row.key);basename(row.name);integer(row.bytes,1,BANK_SOURCE_MAX_BYTES);sha(row.sha256);
  need(!inputs.has(row.key)&&row.file==='input-'+row.key+'.bin','The retained input identity differs.','REPLY');inputs.add(row.key);}
 for(const row of value.files){basename(row.name);integer(row.bytes,0,BANK_SOURCE_MAX_BYTES);sha(row.sha256);
  need(!names.has(row.name)&&['request','input','output','result'].includes(row.role),'The retained file inventory differs.','REPLY');names.add(row.name);}
 if(request)need(same(value.inputs,request.inputs.map(x=>({key:x.key,name:x.name,bytes:x.bytes,sha256:x.sha256,file:'input-'+x.key+'.bin'}))),
  'The receipt changed the original complete input inventory.','REQUEST_CHANGED');
 if(value.state!=='RETAINING'){
  need(value.files.some(x=>x.name==='request.json'&&x.role==='request'),'The original request is not retained.','REPLY');
  for(const pin of value.inputs)need(value.files.some(x=>x.name===pin.file&&x.role==='input'&&x.bytes===pin.bytes&&x.sha256===pin.sha256),'A prepared input is not fully retained.','REPLY');
 }
 if(value.state==='COMPLETE')need(plain(value.summary)&&['collection','library','inspection','profile-review'].includes(value.viewType)&&
  value.files.some(x=>x.name==='result.json'&&x.role==='result'),'Keep the complete original result.','REPLY');
 else need(value.summary===null&&value.viewType===null,'Incomplete custody cannot claim a completed result.','REPLY');
 return clone(value);
}
function checkedPage(page,offset,limit){
 need(plain(page)&&page.offset===offset&&page.limit===limit&&Array.isArray(page.items)&&
  Number.isSafeInteger(page.total)&&page.total>=offset+page.items.length&&page.items.length<=limit,
  'The complete original view returned an inconsistent page.','PAGE');
 return page;
}
/** Borrow a structured MCP call; authentication and the shared accounting owner remain unchanged. */
export function createAccountingBankSourcesClient({workspace,call}={}){
 key(workspace);need(typeof call==='function','Supply the original structured MCP call.');
 const maintenance=createAccountingMaintenanceClient({workspace,call}),pending=new Set();
 let closed=false,transitioning=false,closing,identity;const sources=new Map();
 function accepting(){need(!closed&&!transitioning,'This source client is draining or closed.','CLOSED');}
 async function tracked(work){accepting();const p=Promise.resolve().then(work);pending.add(p);try{return await p;}finally{pending.delete(p);}}
 function binding(result){
  need(plain(result)&&result.workspace===workspace,'The reply lost its configured workspace binding.','REPLY');sha(result.workspaceId);
  if(identity)need(identity===result.workspaceId,'The original accounting workspace identity changed.','WORKSPACE');
  identity??=result.workspaceId;return result;
 }
 async function transition(work,permanent=false){accepting();transitioning=true;try{
  await Promise.allSettled([...pending]);const value=await work();if(permanent)closed=true;return value;
 }finally{transitioning=false;}}
 function closeAfter(work){if(!closing){const p=transition(work,true);closing=p;p.catch(()=>{if(closing===p)closing=undefined;});}return closing;}
 const client={
  workspace,
  open:options=>tracked(()=>call('merchant_accounting_open',{workspace},options)),
  async callOperation(action,args={},options){
   const selected=accountingBankSourcesArguments(action,args);
   if(selected.request&&identity)need(selected.request.workspaceId===identity,'Select this original workspace.','WORKSPACE');
   const r=await tracked(async()=>binding(await call(PREFIX+action,{...selected,workspace},options)));
   if(['prepare','execute','request'].includes(action)){
    const id=selected.request?.requestId??selected.preparationId;
    need(r.preparationId===id,'The reply belongs to a different preparation.','REPLY');
    if(action==='request'&&r.state==='NOT_FOUND')return r;
    validateAccountingBankSourceReceipt(r,{request:selected.request,workspaceId:identity});
    if(sources.has(id))need(sources.get(id)===r.sourceSha256,'The original preparation source edition changed.','SOURCE_CHANGED');
    sources.set(id,r.sourceSha256);
    if(action==='execute')need(r.requestSha256===selected.expectedRequestSha256,'The original request SHA differs.','REQUEST_CHANGED');
   }else if(action==='source'){
    need(r.sourceAlias===selected.sourceAlias&&r.name===selected.name,'The configured original input selection changed.','REPLY');
    integer(r.bytes,1,BANK_SOURCE_MAX_BYTES);sha(r.sha256);
   }else if(action==='list'){
    sha(r.inventorySha256);checkedPage(r.page,selected.offset??0,selected.limit??25);
    for(const item of r.page.items)validateAccountingBankSourceReceipt(item,{workspaceId:identity});
   }else if(action==='view'){
    need(r.preparationId===selected.preparationId&&plain(r.view),'The view belongs to another preparation.','REPLY');
    checkedPage(r.view.page,selected.offset??0,selected.limit??25);
   }else if(action==='status'){sha(r.sourceSha256);need(Array.isArray(r.configuredSources)&&r.configuredSources.every(x=>typeof x==='string')&&plain(r.limits),'Keep the configured source inventory and limits.','REPLY');}
   return r;
  },
  async reconcileRequest(value,options){
   const request=validateBankSourceRequest(value),result=await client.request({preparationId:request.requestId},options);
   need(result.workspaceId===request.workspaceId,'The original request belongs to another workspace.','WORKSPACE');
   return result.state==='NOT_FOUND'?result:validateAccountingBankSourceReceipt(result,{request});
  },
  async listAll(options){
   let offset=0,total,inventorySha256;const items=[],ids=new Set();let result;
   for(;;){result=await client.list({offset,limit:100},options);const p=result.page;
    if(total===undefined){total=p.total;inventorySha256=result.inventorySha256;}
    need(total===p.total&&inventorySha256===result.inventorySha256,'The preparation inventory changed between pages. Read it again.','OBSERVATION_CHANGED');
    for(const row of p.items){need(!ids.has(row.preparationId),'The preparation inventory repeats an original ID.','PAGE');ids.add(row.preparationId);items.push(row);}
    offset+=p.items.length;if(offset===total)return {...result,page:{offset:0,limit:100,total,items}};
    need(p.items.length>0,'The preparation inventory did not advance.','PAGE');
   }
  },
  async viewAll(args,options){
   need(plain(args)&&args.offset===undefined&&args.limit===undefined,'Let the complete view reader advance offsets.');
   const selected=accountingBankSourcesArguments('view',args),before=await client.request({preparationId:selected.preparationId},options);
   need(before.state==='COMPLETE','Complete output paging requires the original completed preparation.');
   let offset=0,total,stamp,result;const items=[];
   for(;;){result=await client.view({...selected,offset,limit:100},options);const {page,...meta}=result.view;
    if(total===undefined){total=page.total;stamp=canonicalHash(meta);}
    need(total===page.total&&stamp===canonicalHash(meta),'The complete output changed between pages.','OBSERVATION_CHANGED');
    items.push(...page.items);offset+=page.items.length;
    if(offset===total)break;need(page.items.length>0,'The complete output view did not advance.','PAGE');
   }
   const after=await client.request({preparationId:selected.preparationId},options);
   need(same(before,after),'The retained completed output changed during paging.','OBSERVATION_CHANGED');
   return {...result,view:{...result.view,page:{offset:0,limit:100,total,items}}};
  },
  async *fileChunks(receipt,name,options={}){
   accepting();const selected=validateAccountingBankSourceReceipt(receipt,{workspaceId:identity});
   need(selected.workspace===workspace,'Use this configured workspace receipt.','WORKSPACE');
   basename(name);const pin=selected.files.find(x=>x.name===name);need(pin,'Choose an exact retained receipt filename.');
   const iterator=maintenance.fileChunks({kind:'bank-sources',bankSourcePreparationId:selected.preparationId,file:name},
    {...options,expectedSha256:pin.sha256});
   let size=0,problem;
   try{for(;;){accepting();const next=await iterator.next();if(next.done){need(size===pin.bytes,'The original retained file ended early.','FILE');return;}
    need(next.value.file.bytes===pin.bytes&&next.value.file.name===name,'The retained file metadata changed.','FILE');
    size+=next.value.bytes.length;need(size<=pin.bytes,'The retained file grew during reading.','FILE');yield next.value;}
   }catch(error){problem=error;throw error;}
   finally{try{await iterator.return?.();}catch(error){if(problem)problem.releaseError={code:error.code,message:error.message};else throw error;}}
  },
  async fileBytes(receipt,name,{maximumBytes=BANK_SOURCE_MAX_BYTES,...options}={}){
   integer(maximumBytes,1,BANK_SOURCE_MAX_BYTES);const selected=validateAccountingBankSourceReceipt(receipt,{workspaceId:identity});
   const pin=selected.files.find(x=>x.name===name);need(pin&&pin.bytes<=maximumBytes,'The complete file exceeds the selected byte limit.','FILE_SIZE');
   const parts=[];let bytes=0,file;for await(const chunk of client.fileChunks(selected,name,options)){parts.push(chunk.bytes);bytes+=chunk.bytes.length;file??=chunk.file;}
   return {bytes:Buffer.concat(parts,bytes),file};
  },
  registerFileRead:id=>maintenance.registerFileRead(id),
  releaseFile:(id,options)=>maintenance.releaseFile(id,options),
  drainFileReads:()=>transition(()=>maintenance.drainFileReads()),
  disconnect:()=>closeAfter(()=>maintenance.drainFileReads()),
  closeWorkspace:options=>closeAfter(()=>maintenance.closeWorkspace(options))
 };
 for(const action of ACCOUNTING_BANK_SOURCES_METHODS)client[action]=(args={},options)=>client.callOperation(action,args,options);
 return Object.freeze(client);
}
export async function connectAccountingBankSourcesClient({
 workspace,bearerToken,tokenEnv='MCP_ACCESS_TOKEN',environment=process.env,maximumResponseBytes=128*1024*1024,...options
}={}){
 const selectedEnvironment=bearerToken===undefined?environment:{...environment,[tokenEnv]:bearerToken};
 const connection=await openMerchantFileClient({...options,tokenEnv,environment:selectedEnvironment,maximumResponseBytes,
  errorPrefix:'ACCOUNTING_BANK_SOURCES',clientName:'starforge-accounting-bank-sources'});
 return Object.freeze({...createAccountingBankSourcesClient({workspace,call:connection.call}),endpoint:connection.endpoint});
}
