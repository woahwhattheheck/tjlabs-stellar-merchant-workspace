// MIT. Operating plans inside the original Grist database and operation lifetime.
import {fileURLToPath} from 'node:url';
import {loadCommandCatalog} from '../../../distribution/discovery/load.mjs';
import {operatingPlanDraft} from '../../../distribution/discovery/operating-plan.mjs';
import {identity,bytes,digest,fault,stamp} from '../../postgres/publisher/files.mjs';
import {SOURCE_KINDS,inspectProcedure,createGristProcedure,captureGristProcedure,saveGristProcedure,
 receiveGristPlan,reviewGristReturn,applyGristReturn,exportGristProcedure} from './operating-plan.mjs';

const ROOT=fileURLToPath(new URL('../../../../../',import.meta.url));
const MAX=24*1024*1024,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const need=(v,code,message,status=422)=>{if(!v)throw fault(code,message,status);};
const exact=(v,keys)=>need(plain(v)&&Object.keys(v).every(k=>keys.includes(k)),'GRIST_PROCEDURE_FIELDS','Use documented procedure fields.');
const id=v=>need(typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v),'GRIST_PROCEDURE_ID','Use the original procedure or source ID.');
const uuid=v=>need(typeof v==='string'&&UUID.test(v),'GRIST_PROCEDURE_REQUEST','Retain one original request UUID.');
const size=v=>need(bytes(v).length<=MAX,'GRIST_PROCEDURE_LIMIT','Keep the complete procedure within 24 MiB; export its history before selecting another procedure.',413);
const view=p=>({procedure:p,draft:operatingPlanDraft(p.plan),version:p.version,planRevision:p.plan.revisions.length});
function checked(value){const p=inspectProcedure(value);for(const b of p.bindings)need(identity(b.identity)===b.identitySha256,
 'GRIST_PROCEDURE_SOURCE_CHANGED','The retained source identity and its digest differ.');return p;}
const PRIVATE=new Set(['directory','sourceFile','targetDirectory','publisherDirectory','manifestFile','captureFile','resourceFile',
 'oauthDirectory','tokenEnv','accessTokenEnv','root','releaseDirectory','packageDirectory','datasetDirectory','path','folder']);
function publicNative(value){
 if(Array.isArray(value))return value.map(publicNative);
 if(!plain(value))return value;
 return Object.fromEntries(Object.entries(value).filter(([k,v])=>!PRIVATE.has(k)&&
  !['token','accessToken','authorization','credential','credentials','rows','sample','samples','records'].includes(k)&&
  !(k==='file'&&typeof v==='string'&&v.startsWith('/'))).map(([k,v])=>[k,['filter','queries'].includes(k)?structuredClone(v):publicNative(v)]));
}
function metadata(kind,record){
 const out={};
 for(const key of ['id','requestId','title','tableTitle','createdAt','startedAt','completedAt','observedAt','source',
  'document','tableRef','catalogSha256','catalogSelection','connectionAlias','connectionSha256','selection','selectionSha256',
  'schemaSha256','manifestSha256','sourceBytes','rowCount','pageCount','countVerified','documentStateVerified',
  'repeatReadVerified','documentState','atomicSourceSnapshot','responseKind','completeness','imported',
  'reviewer','note','draftRevision','previewId','sourceSha256','captureId','observationSha256','mode','queries'])
  if(record[key]!==undefined)out[key]=key==='queries'?structuredClone(record[key]):publicNative(record[key]);
 if(plain(out.document))out.document=Object.fromEntries(['id','name'].filter(k=>out.document[k]!==undefined).map(k=>[k,out.document[k]]));
 if(kind==='documents'&&Array.isArray(record.tables)){
  out.tableCount=record.tables.length;
  out.tables=record.tables.map(t=>({id:t.id,tableRef:t.tableRef??null}));
 }
 if(kind==='discoveries'){
  const columns=Array.isArray(record.columns)?record.columns:plain(record.columns)?Object.values(record.columns):[];
  out.columns=columns.map(c=>({id:c.id??c.colId??null,type:c.type??null,label:c.label??null}));
  out.columnCount=columns.length;
 }
 return out;
}
function resultSummary(result){
 if(!plain(result))return {present:result!==null,type:result===null?'null':Array.isArray(result)?'array':typeof result};
 const out={present:true,fields:Object.keys(result)};
 for(const key of ['id','requestId','kind','mode','state','status','action','runId','reviewRequestId','reviewSha256','packageRequestId',
  'sourceSha256','releaseId','digest','generation','instanceId','consoleInstanceId','versionId','selectedVersion','sourceVersion',
  'rowCount','pageCount','draftRevision','draftSaved','running','commandReplayed','observedOwnership'])
  if(result[key]===null||['string','number','boolean'].includes(typeof result[key]))out[key]=result[key];
 return out;
}
export const OPERATING_MUTATIONS=Object.freeze(['create','adopt','save','capture','receive','return_apply']);
export const OPERATING_METHODS=Object.freeze(['source','list','read','request','export','return_preview',...OPERATING_MUTATIONS]);
const methodKeys={
 source:['kind','offset','limit'],list:['offset','limit'],read:['planId'],request:['requestId'],export:['planId','format'],
 return_preview:['planId','incoming','reviewId','reviewer','notes','decisions'],
 create:['planId','requestId','expectedVersion','title','customer','purpose','period','owner','receiving','notes','selection'],
 adopt:['planId','requestId','expectedVersion','procedure'],save:['planId','requestId','expectedVersion','draft'],
 capture:['planId','requestId','expectedVersion','captureId','stepIds'],receive:['planId','requestId','expectedVersion','incoming'],
 return_apply:['planId','requestId','expectedVersion','review']
};
export function validateOperatingInput(method,args){
 need(OPERATING_METHODS.includes(method),'GRIST_PROCEDURE_METHOD','Choose a documented operating-plan method.');
 exact(args,methodKeys[method]);size(args);
 if(!['source','list','request'].includes(method))id(args.planId);
 if(method==='request'||OPERATING_MUTATIONS.includes(method))uuid(args.requestId);
 if(OPERATING_MUTATIONS.includes(method))need(Number.isSafeInteger(args.expectedVersion)&&args.expectedVersion>=0,
  'GRIST_PROCEDURE_VERSION','Supply the exact current procedure version; use zero only for creation.');
 if(method==='capture')uuid(args.captureId);
}
function page(args){
 const offset=args.offset??0,limit=args.limit??25;
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,
  'GRIST_PROCEDURE_PAGE','Use a nonnegative offset and a page limit from 1 to 100.');
 return {offset,limit};
}
/** Borrowed capabilities are the already-open source database and its transaction. No second lock or owner. */
export function openOperatingProcedures({db,transaction,settings,current,operation,assertOpen}){
 db.exec('CREATE TABLE IF NOT EXISTS operating_plans(id TEXT PRIMARY KEY,data TEXT NOT NULL);'+
  'CREATE TABLE IF NOT EXISTS operating_plan_requests(id TEXT PRIMARY KEY,input_sha256 TEXT NOT NULL,result TEXT NOT NULL);');
 const origin={settingsSha256:digest(db.prepare('SELECT data FROM settings WHERE id=1').get().data),createdAt:settings.createdAt};
 let catalogPromise;
 const catalog=()=>catalogPromise??=(loadCommandCatalog({sourceRoot:ROOT}).catch(e=>{catalogPromise=null;throw e;}));
 const get=planId=>{
  id(planId);const row=db.prepare('SELECT data FROM operating_plans WHERE id=?').get(planId);
  need(row,'GRIST_PROCEDURE_NOT_FOUND','Open an existing saved procedure.',404);
  const value=checked(JSON.parse(row.data));need(value.id===planId,'GRIST_PROCEDURE_ID','The saved procedure identity differs.');return value;
 };
 const table={documents:'document_catalogs',discoveries:'discoveries',captures:'captures',versions:'versions',operations:'operations'};
 function sourceRow(kind,selected){
  need(SOURCE_KINDS.includes(kind),'GRIST_PROCEDURE_SOURCE','Choose a documented saved source kind.');
  selected=String(selected);id(selected);
  if(kind==='versions')need(/^[1-9][0-9]*$/.test(selected)&&Number.isSafeInteger(Number(selected)),
   'GRIST_PROCEDURE_SOURCE','Use the exact positive source version.');
  else uuid(selected);
  const row=db.prepare('SELECT * FROM '+table[kind]+' WHERE id=?').get(kind==='versions'?Number(selected):selected);
  need(row,'GRIST_PROCEDURE_SOURCE_MISSING','The selected original source item is absent.',404);
  if(kind==='operations'){
   need(row.kind!=='OPERATING_PLAN','GRIST_PROCEDURE_SOURCE','Select an original source, publisher or deployment operation.');
   const bound={requestId:row.id,kind:row.kind,inputSha256:row.payload_hash,createdAt:row.created};
   return {kind,id:selected,title:row.kind+' · '+selected,identity:bound,identitySha256:identity(bound),
    observation:{kind:'SAVED_ORIGINAL_OPERATION',requestId:row.id,operationKind:row.kind,status:row.status,
     createdAt:row.created,updatedAt:row.updated,inputSha256:row.payload_hash,
     error:row.error?{code:JSON.parse(row.error).code,status:JSON.parse(row.error).status}:null,
     resultSha256:row.result?identity(JSON.parse(row.result)):null,
     resultSummary:resultSummary(row.result?JSON.parse(row.result):null),providerRefreshed:false}};
  }
  const raw=JSON.parse(row.data),record={...raw,id:selected,...(kind==='versions'?{requestId:row.request_id}:{})};
  // The digest pins the entire original record; readable context retains the actual provider/source identities.
  const context={recordSha256:identity(record)};
  for(const key of ['source','document','tableRef','catalogSha256','catalogSelection','connectionAlias','connectionSha256',
   'selection','selectionSha256','schemaSha256','manifestSha256','sourceSha256','observationSha256','captureId','requestId'])
   if(record[key]!==undefined)context[key]=publicNative(record[key]);
  const publicRecord=metadata(kind,record);
  return {kind,id:selected,title:String(record.title??record.tableTitle??record.document?.name??record.source?.tableId??selected),
   identity:context,identitySha256:identity(context),observation:{kind:'RETAINED_SOURCE_RECORD',record:publicRecord,
    sourceRead:false,reviewOrAcceptanceInferred:false}};
 }
 function selectionRows(selection){
  exact(selection,SOURCE_KINDS);const rows=[];
  for(const kind of SOURCE_KINDS){
   need(Array.isArray(selection[kind])&&selection[kind].length<=200&&new Set(selection[kind].map(String)).size===selection[kind].length,
    'GRIST_PROCEDURE_SELECTION','Supply every source-kind array, with at most 200 unique original IDs each.');
   rows.push(...selection[kind].map(selected=>sourceRow(kind,selected)));
  }
  return rows; // An empty original selection creates a manual procedure.
 }
 function snapshot(rows){
  const state=current();
  return {origin,rows,authoringState:{draftRevision:state.draftRevision,selectedVersion:state.selectedVersion,
   selectionRevision:state.selectionRevision}};
 }
 function source(args){
  const {offset,limit}=page(args),kind=args.kind;
  need(SOURCE_KINDS.includes(kind),'GRIST_PROCEDURE_SOURCE','Choose documents, discoveries, captures, versions or operations.');
  const where=kind==='operations'?" WHERE kind <> 'OPERATING_PLAN'":'';
  const rows=db.prepare('SELECT id FROM '+table[kind]+where+' ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limit,offset);
  return {origin,kind,items:rows.map(row=>sourceRow(kind,row.id)),
   total:db.prepare('SELECT count(*) AS n FROM '+table[kind]+where).get().n,offset,limit,nativeDispatch:false};
 }
 async function perform(method,args){
  assertOpen();validateOperatingInput(method,args);
  need(OPERATING_MUTATIONS.includes(method),'GRIST_PROCEDURE_METHOD','Use an original journaled mutation.');
  const inputSha256=identity({method,args}),prior=db.prepare('SELECT * FROM operating_plan_requests WHERE id=?').get(args.requestId);
  if(prior){
   need(prior.input_sha256===inputSha256,'GRIST_REQUEST_REUSED','This request UUID already binds another complete input.',409);
   return JSON.parse(prior.result); // Exact original edition, even after later edits.
  }
  const exists=db.prepare('SELECT data FROM operating_plans WHERE id=?').get(args.planId);
  const saved=exists?checked(JSON.parse(exists.data)):null;
  need((saved?.version??0)===args.expectedVersion,'GRIST_PROCEDURE_VERSION_CONFLICT','Preserve this edit and read the current procedure version.',409);
  const savedAt=stamp();let procedure;
  if(method==='create'){
   need(!saved,'GRIST_PROCEDURE_EXISTS','Edit or receive the existing procedure.',409);
   const selected=selectionRows(args.selection);
   procedure=createGristProcedure({id:args.planId,...Object.fromEntries(['title','customer','purpose','period','owner','receiving','notes'].map(k=>[k,args[k]])),
    snapshot:snapshot(selected),catalog:await catalog(),savedAt});
  }else if(method==='adopt'){
   need(!saved,'GRIST_PROCEDURE_EXISTS','Receive into the existing procedure.',409);
   procedure=checked(args.procedure);
   need(procedure.id===args.planId,'GRIST_PROCEDURE_ID','Retain the original received procedure ID.');
  }else{
   need(saved,'GRIST_PROCEDURE_NOT_FOUND','Open an existing original procedure.',404);
   if(method==='save')procedure=saveGristProcedure(saved,{draft:args.draft,savedAt});
   if(method==='capture'){
    need(Array.isArray(args.stepIds)&&args.stepIds.length>0,'GRIST_PROCEDURE_SELECTION','Choose original source steps.');
    const bindings=args.stepIds.map(step=>saved.bindings.find(b=>b.stepId===step));
    need(bindings.every(Boolean),'GRIST_PROCEDURE_SELECTION','Choose bound source steps.');
    procedure=captureGristProcedure(saved,{snapshot:snapshot(bindings.map(b=>sourceRow(b.kind,b.id))),
     captureId:args.captureId,stepIds:args.stepIds,observedAt:savedAt});
   }
   if(method==='receive')procedure=receiveGristPlan(saved,{incoming:args.incoming,savedAt});
   if(method==='return_apply')procedure=applyGristReturn(saved,{review:args.review,savedAt});
  }
  procedure=checked(procedure);size(procedure);
  const receipt={schema:'stellar-forge.grist-operating-request.v1',requestId:args.requestId,method,planId:args.planId,inputSha256,
   previousVersion:args.expectedVersion,version:procedure.version,planRevision:procedure.plan.revisions.length,
   procedureSha256:identity(procedure),savedAt,nativeDispatch:false};
  const result={...view(procedure),receipt};
  // The request result and plan commit together. Original run() records its public operation receipt afterward.
  return transaction(()=>{
   const latest=db.prepare('SELECT data FROM operating_plans WHERE id=?').get(args.planId);
   need((latest?JSON.parse(latest.data).version:0)===args.expectedVersion,
    'GRIST_PROCEDURE_VERSION_CONFLICT','The procedure advanced during preparation. Keep the original edit.',409);
   db.prepare('INSERT INTO operating_plans(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
    .run(args.planId,JSON.stringify(procedure));
   db.prepare('INSERT INTO operating_plan_requests(id,input_sha256,result) VALUES(?,?,?)').run(args.requestId,inputSha256,JSON.stringify(result));
   return result;
  });
 }
 async function read(method,args){
  assertOpen();validateOperatingInput(method,args);
  if(method==='source')return source(args);
  if(method==='list'){
   const {offset,limit}=page(args);
   return {origin,offset,limit,total:db.prepare('SELECT count(*) AS n FROM operating_plans').get().n,
    procedures:db.prepare('SELECT data FROM operating_plans ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limit,offset).map(row=>{
     const p=checked(JSON.parse(row.data));return {id:p.id,title:p.plan.revisions.at(-1).title,version:p.version,
      planRevision:p.plan.revisions.length,updatedAt:p.updatedAt,captures:p.captures.length};
    }),nativeDispatch:false};
  }
  if(method==='request'){
   const receipt=operation(args.requestId);
   need(!receipt||receipt.kind==='OPERATING_PLAN','GRIST_PROCEDURE_REQUEST','This UUID belongs to another original source operation; use its original operation reader.',409);
   return receipt;
  }
  const saved=get(args.planId);
  if(method==='read')return view(saved);
  if(method==='export'){
   const file=exportGristProcedure(saved,args.format);return {...file,version:saved.version,
    bytes:Buffer.byteLength(file.content),sha256:digest(Buffer.from(file.content))};
  }
  if(method==='return_preview')return {version:saved.version,...reviewGristReturn(saved,{
   incoming:args.incoming,reviewId:args.reviewId,reviewer:args.reviewer,notes:args.notes,decisions:args.decisions,savedAt:stamp()})};
  throw fault('GRIST_PROCEDURE_METHOD','Use a documented operating-plan read.');
 }
 return {perform,read};
}
