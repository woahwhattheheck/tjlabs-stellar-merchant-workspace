// MIT. One atomic procedure record; original commissioning workspace remains borrowed.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir} from 'node:fs/promises';
import {loadCommandCatalog} from '../../stellar/scf-starforge-20261009/distribution/discovery/load.mjs';
import {operatingPlanDraft} from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
import {
 inspectProcedure,createCommissioningProcedure,captureCommissioningProcedure,saveCommissioningProcedure,
 receiveCommissioningPlan,reviewCommissioningReturn,applyCommissioningReturn,exportCommissioningProcedure
} from './operating-plan.mjs';
import {identifier,uuid,need,exact,json,exists,privateDirectory,acquireWorkspace,saveJson,
 objectDigest,jsonBytes,digest,publicValue,APP} from './common.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const SCHEMA='stellar-forge.lightdash-operating-store.v1';
const MAX=24*1024*1024;
let catalogPromise;
async function catalog(){
 if(!catalogPromise)catalogPromise=loadCommandCatalog({sourceRoot:ROOT}).catch(e=>{catalogPromise=null;throw e;});
 return catalogPromise;
}
function check(store,workspaceId,planId){
 exact(store,['schema','workspaceId','procedure','requests'],['schema','workspaceId','procedure','requests']);
 need(store.schema===SCHEMA&&store.workspaceId===workspaceId,'LIGHTDASH_PROCEDURE_WORKSPACE','Retain this original workspace.');
 store.procedure=inspectProcedure(store.procedure);
 need(store.procedure.id===planId&&Array.isArray(store.requests),
  'LIGHTDASH_PROCEDURE_CHANGED','Procedure storage identity changed.');
 need(new Set(store.requests.map(x=>x.requestId)).size===store.requests.length,'LIGHTDASH_PROCEDURE_CHANGED','Repeated retained request.');
 return store;
}
async function nativeSnapshot(e,{full=false}={}){
 const raw=await e.model.state(),revision=e.model.metadata().revision;
 need(raw.metadata.id===e.definition.identity.workspaceId&&raw.metadata.revision===revision,
  'LIGHTDASH_PROCEDURE_SOURCE_CHANGED','The source workspace advanced during its local read. Read it again.');
 if(full)raw.operations=raw.operations.map(row=>{
  const operation=e.model.operation(row.id);
  return {...operation,resultSha256:operation.nativeResult?objectDigest(operation.nativeResult):null};
 });
 // This is a local observation, not a provider refresh or an atomic provider snapshot.
 return publicValue(raw);
}
async function paths(e){
 const root=path.join(e.definition.controlDirectory,'operating-plans');
 await privateDirectory(root,true);return root;
}
const view=(e,store)=>({workspace:e.alias,receivingWorkspaceId:e.definition.identity.workspaceId,procedure:store.procedure,draft:operatingPlanDraft(store.procedure.plan),
 version:store.procedure.version,planRevision:store.procedure.plan.revisions.length});
function mutationKeys(action){
 const shared=['workspace','planId','requestId','expectedVersion'];
 return {...Object.fromEntries(['create','adopt','save','capture','receive','return_apply'].map(x=>[x,shared])),
 create:[...shared,'title','customer','purpose','period','owner','receiving','notes','selection'],
 adopt:[...shared,'procedure'],save:[...shared,'draft'],capture:[...shared,'captureId','stepIds'],receive:[...shared,'incoming'],
 return_apply:[...shared,'review']}[action];
}
async function mutate(e,action,args,root){
 exact(args,mutationKeys(action),['workspace','planId','requestId','expectedVersion']);
 identifier(args.planId);uuid(args.requestId);
 need(Number.isSafeInteger(args.expectedVersion)&&args.expectedVersion>=0,'LIGHTDASH_PROCEDURE_VERSION','Supply the original procedure version.');
 const filename=path.join(root,args.planId+'.json'),release=await acquireWorkspace(root);
 try{
  let store=await exists(filename)?check(await json(filename,{maximum:MAX,privateFile:true}),e.definition.identity.workspaceId,args.planId):null;
  const inputSha256=objectDigest({action,args}),prior=store?.requests.find(x=>x.requestId===args.requestId);
  if(prior){
   need(prior.inputSha256===inputSha256,'LIGHTDASH_PROCEDURE_REQUEST_CONFLICT','This request UUID already binds another complete input.');
   return {...view(e,store),receipt:prior.receipt,replayed:true};
  }
  need((store?.procedure.version??0)===args.expectedVersion,'LIGHTDASH_PROCEDURE_VERSION_CONFLICT','Keep the pending edit and reopen this procedure version.');
  const savedAt=new Date().toISOString();let procedure;
  if(action==='create'){
   need(!store,'LIGHTDASH_PROCEDURE_EXISTS','Receive or edit this existing procedure.');
   const manifest=await json(path.join(ROOT,'../manifest.json'),{maximum:16*1024*1024});
   const appBytes=await import('node:fs/promises').then(fs=>fs.readFile(path.join(ROOT,APP,'source-manifest.json')));
   procedure=createCommissioningProcedure({id:args.planId,title:args.title,customer:args.customer,purpose:args.purpose,period:args.period,owner:args.owner,
    receiving:args.receiving,notes:args.notes,selection:args.selection,snapshot:await nativeSnapshot(e),catalog:await catalog(),
    sourceCommit:manifest.sourceCommit,applicationManifestSha256:digest(appBytes),savedAt});
  }else if(action==='adopt'){
   need(!store,'LIGHTDASH_PROCEDURE_EXISTS','Receive changes into the existing procedure.');procedure=inspectProcedure(args.procedure);
   need(procedure.id===args.planId,'LIGHTDASH_PROCEDURE_ID','Keep the original procedure ID.');
  }else{
   need(store,'LIGHTDASH_PROCEDURE_NOT_FOUND','Open an existing original procedure.');const value=store.procedure;
   if(action==='save')procedure=saveCommissioningProcedure(value,{draft:args.draft,savedAt});
   if(action==='capture')procedure=captureCommissioningProcedure(value,{snapshot:await nativeSnapshot(e,{full:true}),captureId:args.captureId,stepIds:args.stepIds,observedAt:savedAt});
   if(action==='receive')procedure=receiveCommissioningPlan(value,{incoming:args.incoming,savedAt});
   if(action==='return_apply')procedure=applyCommissioningReturn(value,{review:args.review,savedAt});
  }
  need(procedure,'LIGHTDASH_PROCEDURE_ACTION','Choose a documented procedure action.');
  const receipt={schema:'stellar-forge.lightdash-operating-request.v1',requestId:args.requestId,action,planId:args.planId,
   workspaceId:e.definition.identity.workspaceId,inputSha256,previousVersion:args.expectedVersion,version:procedure.version,
   planRevision:procedure.plan.revisions.length,procedureSha256:objectDigest(procedure),savedAt,nativeDispatch:false};
  store={schema:SCHEMA,workspaceId:e.definition.identity.workspaceId,procedure,requests:[...(store?.requests??[]),{requestId:args.requestId,inputSha256,receipt}]};
  need(jsonBytes(store).length<=MAX,'LIGHTDASH_PROCEDURE_LIMIT','Export the complete current procedure before creating another source selection.');
  await saveJson(filename,store); // Plan, observation and original request commit in the same atomic replacement.
  return {...view(e,store),receipt,replayed:false};
 }finally{await release();}
}
export async function callOperatingProcedure(e,name,args){
 const action=name.replace(/^merchant_lightdash_operating_/,'');
 const allowed=new Set(['list','read','source','create','adopt','save','capture','receive','return_preview','return_apply','export','request']);
 need(allowed.has(action),'TOOL_NOT_FOUND','Unknown operating procedure action.');
 const root=await paths(e);
 if(action==='source'){exact(args,['workspace'],['workspace']);return {workspace:e.alias,native:await nativeSnapshot(e),nativeDispatch:false};}
 if(action==='list'){
  exact(args,['workspace'],['workspace']);const files=(await readdir(root)).filter(x=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/.test(x)).sort(),procedures=[];
  for(const file of files){const s=check(await json(path.join(root,file),{maximum:MAX,privateFile:true}),e.definition.identity.workspaceId,file.slice(0,-5));
   procedures.push({id:s.procedure.id,version:s.procedure.version,title:s.procedure.plan.revisions.at(-1).title,updatedAt:s.procedure.updatedAt,
    planRevision:s.procedure.plan.revisions.length,captures:s.procedure.captures.length});}
  return {workspace:e.alias,procedures,nativeDispatch:false};
 }
 if(mutationKeys(action))return mutate(e,action,args,root);
 const keys={
  read:['workspace','planId'],request:['workspace','planId','requestId'],
  export:['workspace','planId','format'],return_preview:['workspace','planId','incoming','reviewId','reviewer','notes','decisions']
 }[action];exact(args,keys,['workspace','planId']);identifier(args.planId);
 const store=check(await json(path.join(root,args.planId+'.json'),{maximum:MAX,privateFile:true}),e.definition.identity.workspaceId,args.planId);
 if(action==='read')return view(e,store);
 if(action==='request'){uuid(args.requestId);return {workspace:e.alias,receipt:store.requests.find(x=>x.requestId===args.requestId)?.receipt??null,currentVersion:store.procedure.version};}
 if(action==='export'){const file=exportCommissioningProcedure(store.procedure,args.format);return {workspace:e.alias,version:store.procedure.version,...file,bytes:Buffer.byteLength(file.content),sha256:digest(Buffer.from(file.content))};}
 if(action==='return_preview')return {workspace:e.alias,version:store.procedure.version,
  ...reviewCommissioningReturn(store.procedure,{incoming:args.incoming,reviewId:args.reviewId,reviewer:args.reviewer,notes:args.notes,decisions:args.decisions,savedAt:new Date().toISOString()})};
}
