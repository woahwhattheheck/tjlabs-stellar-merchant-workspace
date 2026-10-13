// MIT. SDP desk borrowed from the original invoice operator and source journal.
import {createHash} from "node:crypto";
import {promises as fs} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve,isAbsolute,relative,dirname,basename,sep} from "node:path";
import {createSDPWorkspace} from "./sdp-workspace.mjs";
import {prepareBatch,validateScope,SDPContractError} from "./sdp-contract.mjs";
import {strictJSON} from "./sdp-native.mjs";
import {normalizeNetwork} from "../../settlement-audit/native-http.mjs";
import {readInvoicePrivateJSON} from "../operator.mjs";

const SCHEMA="stellar-forge.invoice-sdp-desk.v1";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const body=value=>Buffer.from(JSON.stringify(value,null,2)+"\n");
const hash=value=>createHash("sha256").update(value).digest("hex");
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const plain=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
function need(ok,code,message){if(!ok)throw new SDPContractError(code,message);}
const entries=[
 ["sdp.desks",false,[],"Read named original programme and provider scopes."],
 ["sdp.list",false,["desk"],"List every retained source in the selected SDP programme scope."],
 ["sdp.read",false,["desk","sourceId"],"Read a complete saved batch, snapshot, receiving or provider observation."],
 ["sdp.preview",false,["desk","batch"],"Normalize the complete batch and exact instruction CSV without saving."],
 ["sdp.request",false,["desk","command"],"Reconcile a complete original desk command against its retained source result."],
 ["sdp.prepare",true,["desk","batch"],"Retain the prepared batch and complete original instruction CSV."],
 ["sdp.receive",true,["desk","preparedSourceId","snapshot"],"Receive the complete provider snapshot and save its native report."],
 ["sdp.capture",true,["desk","preparedSourceId","disbursementId"],"Capture all selected provider pages and retain a complete receiving."],
 ["sdp.inspect",true,["desk","disbursementId"],"Read and retain the original provider disbursement observation."],
 ["sdp.create-draft",true,["desk","preparedSourceId"],"Create the original provider draft using durable customer mutation admission."],
 ["sdp.upload",true,["desk","preparedSourceId","disbursementId","observationSourceId"],"Upload the exact saved instructions against the reviewed provider observation."],
 ["sdp.status",true,["desk","preparedSourceId","snapshotSourceId","status"],"Apply an explicit provider status intent against its complete reviewed snapshot."],
 ["sdp.project-payments",true,["desk","observationSourceId"],"Project the original payment observation through the existing invoice source writer."]
];
export const SDP_DESK_METHODS=Object.freeze(entries.map(([method,mutates,required,description])=>Object.freeze({
 method,mutates,required:Object.freeze(required),description,...(mutates?{requestId:"UUID",expectedRevision:"nonnegative integer"}:{})
})));
export async function readSDPDeskConfiguration({file,workspaceDirectory}){
 if(!file)return {schema:SCHEMA+".configuration",desks:{}};
 need(typeof file==="string"&&isAbsolute(file),"INVALID_CONFIGURATION","Select an absolute private SDP desk configuration.");
 const actual=await fs.realpath(file);
 async function resolveNearest(path){
  try{return await fs.realpath(path);}catch(error){if(error.code!=="ENOENT")throw error;}
  const parent=dirname(path);need(parent!==path,"INVALID_DIRECTORY","Resolve the original workspace parent.");
  return resolve(await resolveNearest(parent),basename(path));
 }
 const workspace=await resolveNearest(resolve(workspaceDirectory)),r=relative(workspace,actual);
 need(r===".."||r.startsWith(".."+sep)||isAbsolute(r),"PRIVATE_CONFIGURATION_LOCATION","Keep SDP adapter configuration outside the exported invoice workspace.");
 const selected=await readInvoicePrivateJSON(actual,{maximumBytes:2*1024*1024});
 need(selected.schema===SCHEMA+".configuration"&&plain(selected.desks),"INVALID_CONFIGURATION","Select the complete original SDP desk configuration.");
 return selected;
}
export async function openSDPDeskOperator({operator,configuration={schema:SCHEMA+".configuration",desks:{}},connections={},signal}){
 need(operator?.workspace&&typeof operator.invoke==="function","ORIGINAL_OPERATOR_REQUIRED","Borrow the original invoice settlement operator.");
 need(configuration.schema===SCHEMA+".configuration"&&plain(configuration.desks),"INVALID_CONFIGURATION","Select the original SDP desk configuration.");
 const controller=new AbortController(),forward=()=>controller.abort(signal?.reason);
 if(signal?.aborted)forward();else signal?.addEventListener("abort",forward,{once:true});
 const contexts=new Map(),opened=[],active=new Set(),queues=new Map();let closing=false,closePromise=null;
 function stopped(){need(!controller.signal.aborted,"INTERRUPTED","The SDP desk is draining its original work.");}
 async function tracked(work){need(!closing,"OPERATOR_DRAINING","The SDP desk is finishing its accepted requests.");const p=Promise.resolve().then(work);active.add(p);try{return await p;}finally{active.delete(p);}}
 async function releaseAdapters(){
  let first=null;
  for(const owner of [...opened].reverse()){
   if(owner.closed)continue;
   try{await owner.value.close();owner.closed=true;}catch(error){first??=error;}
  }
  if(first)throw first;
 }
 try{
  for(const [alias,selected] of Object.entries(configuration.desks)){
   need(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(alias)&&plain(selected),"INVALID_CONFIGURATION","Use named original SDP desk configurations.");
   const scope=validateScope(selected.scope);
   const programme=await operator.invoke({method:"programme.read",args:{programmeId:selected.programmeId,version:selected.programmeVersion}});
   need(programme.id===selected.programmeId&&programme.version===selected.programmeVersion,"ORIGINAL_PROGRAMME_REQUIRED","Select the exact saved invoice programme version.");
   const connection=selected.connectionAlias?connections[selected.connectionAlias]:null;
   if(connection){
    need(connection.provider==="sdp","ORIGINAL_CONNECTION_REQUIRED","Select the existing named SDP connection.");
    const headers=new Headers(connection.headers??{});
    need(new URL(connection.baseUrl).href.replace(/\/+$/,"")===new URL(scope.origin).href.replace(/\/+$/,"")&&
     normalizeNetwork(connection.network)===scope.networkPassphrase&&
     (connection.tenantName??headers.get("SDP-Tenant-Name"))===scope.tenantName&&
     (connection.walletId??headers.get("X-Wallet-Id"))===scope.sourceWalletId,
     "CONNECTION_SCOPE_MISMATCH","The original connection differs from the selected tenant, wallet, network or origin.");
   }else need(!selected.connectionAlias,"ORIGINAL_CONNECTION_REQUIRED","The named original SDP connection is unavailable.");
   let adapter={};
   if(selected.adapterModule){
    need(isAbsolute(selected.adapterModule),"INVALID_CONFIGURATION","Select the absolute original transaction adapter module.");
    adapter=await import(pathToFileURL(selected.adapterModule).href);
   }
   let transactions=adapter.transactions;
   if(typeof adapter.openTransactions==="function"){
    stopped();
    try{transactions=await adapter.openTransactions({workspace:operator.workspace,scope,signal:controller.signal});}
    catch(error){if(typeof error.close==="function")opened.push({value:{close:error.close},closed:false});throw error;}
    if(typeof transactions?.close==="function")opened.push({value:transactions,closed:false});
   }
   const getToken=connection?async()=>{
    if(typeof adapter.getToken==="function")return adapter.getToken({connectionAlias:selected.connectionAlias});
    if(connection.token!==undefined||connection.apiKey!==undefined)return connection.token??connection.apiKey;
    const value=new Headers(connection.headers??{}).get("authorization");
    need(value?.startsWith("Bearer "),"CREDENTIAL_REQUIRED","Use the original SDP Bearer credential.");
    return value.slice(7);
   }:undefined;
   const desk=createSDPWorkspace({workspace:operator.workspace,programmeId:selected.programmeId,programmeVersion:selected.programmeVersion,
    scope,connectionAlias:selected.connectionAlias??null,getToken,transactions,validateAddress:adapter.validateAddress,
    allowLoopback:selected.allowLoopback===true});
   contexts.set(alias,{alias,desk,validateAddress:adapter.validateAddress,description:{
    alias,label:typeof selected.label==="string"?selected.label:alias,...desk.describe(),programmeName:programme.name??alias,
    connectionAlias:selected.connectionAlias??null,providerRead:!!getToken,
    providerWrite:!!getToken&&(typeof transactions?.executeMutation==="function"||(typeof transactions?.admitMutation==="function"&&typeof transactions?.recordMutation==="function")),
    addressRegistration:typeof adapter.validateAddress==="function"}});
  }
 }catch(error){controller.abort(error);try{await close();}catch(cleanup){error.cleanupError={code:cleanup.code??cleanup.name,message:cleanup.message};Object.defineProperty(error,"sdpOperator",{value:{close},enumerable:false});}throw error;}
 function context(alias){const value=contexts.get(alias);need(value,"DESK_NOT_FOUND","Select a configured SDP desk.");return value;}
 async function sourceRows(c){
  const state=await operator.describe(),s=c.desk.describe();
  return {workspaceId:state.workspaceId,revision:state.revision,desk:c.description,sources:Object.values(state.sources??{})
   .filter(row=>row.provider==="document"&&row.programmeId===s.programmeId&&row.programmeVersion===s.programmeVersion&&row.sourceScope===s.sourceScope&&row.kind?.startsWith("sdp."))
   .sort((a,b)=>String(b.observedAt??b.createdAt??"").localeCompare(String(a.observedAt??a.createdAt??""))||a.id.localeCompare(b.id))};
 }
 function command(input){
  need(plain(input)&&typeof input.method==="string"&&plain(input.args),"INVALID_COMMAND","Supply the complete original SDP command.");
  const entry=SDP_DESK_METHODS.find(x=>x.method===input.method);
  need(entry?.mutates,"INVALID_COMMAND","Select an original SDP mutation command.");
  for(const name of entry.required)need(Object.hasOwn(input.args,name),"MISSING_ARGUMENT","Supply "+name+".");
  need(UUID.test(input.args.requestId??"")&&Number.isSafeInteger(input.args.expectedRevision)&&input.args.expectedRevision>=0,"INVALID_COMMAND","Keep the original UUID and workspace revision.");
  const copy=JSON.parse(JSON.stringify(input));
  need(body(copy).length<=32*1024*1024,"REQUEST_TOO_LARGE","Keep the complete SDP desk command within 32 MiB.");
  return copy;
 }
 async function recover(c,original){
  const selected=command(original);need(selected.args.desk===c.alias,"DESK_SCOPE_MISMATCH","The original command belongs to another desk.");
  const rows=await sourceRows(c),label="Desk request "+selected.args.requestId;
  const matches=rows.sources.filter(x=>x.kind==="sdp.desk-request"&&x.label===label);
  need(matches.length<=1,"REQUEST_SOURCE_CONFLICT","More than one retained original request has this identity.");
  if(matches.length){
   const saved=await c.desk.read(matches[0].id);
   need(same(saved.value.command,selected),"REQUEST_ID_CONFLICT","This request ID belongs to different complete SDP arguments.");
  }
  const results=rows.sources.filter(x=>x.kind==="sdp.desk-result"&&x.label==="Desk result "+selected.args.requestId);
  need(results.length<=1,"REQUEST_SOURCE_CONFLICT","More than one retained final result has this identity.");
  if(results.length){
   const saved=await c.desk.read(results[0].id);
   need(same(saved.value.command,selected)&&saved.value.status==="COMPLETED","REQUEST_SOURCE_CONFLICT","The retained complete result differs from its original command.");
   return {found:true,status:"COMPLETED",requestSourceId:matches[0]?.id??null,resultSourceId:results[0].id,result:saved.value.result};
  }
  return {found:matches.length>0,status:matches.length?"RETAINED":"ABSENT",requestSourceId:matches[0]?.id??null,result:null};
 }
 async function dispatch(c,method,args){
  const signal=controller.signal;stopped();
  switch(method){
   case "sdp.prepare":return c.desk.prepare(args.batch);
   case "sdp.receive":return c.desk.receiveSnapshot({preparedSourceId:args.preparedSourceId,snapshot:args.snapshot});
   case "sdp.capture":return c.desk.capture({preparedSourceId:args.preparedSourceId,disbursementId:args.disbursementId,maxPages:args.maxPages??1000,signal});
   case "sdp.inspect":return c.desk.inspect({disbursementId:args.disbursementId,signal});
   case "sdp.create-draft":return c.desk.createDraft({preparedSourceId:args.preparedSourceId,signal});
   case "sdp.upload":return c.desk.uploadInstructions({preparedSourceId:args.preparedSourceId,disbursementId:args.disbursementId,observationSourceId:args.observationSourceId,signal});
   case "sdp.status":return c.desk.status({preparedSourceId:args.preparedSourceId,snapshotSourceId:args.snapshotSourceId,status:args.status,signal});
   case "sdp.project-payments":return c.desk.projectPaymentObservation({observationSourceId:args.observationSourceId});
   default:throw new SDPContractError("UNKNOWN_METHOD","Select a supported SDP desk operation.");
  }
 }
 async function mutate(c,input){
  const original=command(input),prior=await recover(c,original);
  if(prior.status==="COMPLETED")return prior.result;
  const receipt=await c.desk.save("desk-request",body({schema:SCHEMA+".request",command:original}),{
   label:"Desk request "+original.args.requestId,identity:"desk-request:"+original.args.requestId,request:{command:original.method,requestId:original.args.requestId},
   ...(prior.status==="ABSENT"?{expectedRevision:original.args.expectedRevision}:{})});
  let result;
  try{result=await dispatch(c,original.method,original.args);}
  catch(error){
   const failure={code:error.code??error.name??"SDP_OPERATION_FAILED",message:error.message,
    detail:error.detail??null,providerOutcome:error.result??null};
   try{await c.desk.save("desk-attempt",body({schema:SCHEMA+".attempt",command:original,requestSourceId:receipt.sourceId,
    observedAt:new Date().toISOString(),status:"FAILED_OR_UNCERTAIN",error:failure}),{label:"Desk attempt "+original.args.requestId});}
   catch(recording){error.recordingError={code:recording.code??recording.name,message:recording.message};}
   throw error;
  }
  await c.desk.save("desk-result",body({schema:SCHEMA+".result",command:original,requestSourceId:receipt.sourceId,status:"COMPLETED",result}),{
   label:"Desk result "+original.args.requestId,identity:"desk-result:"+original.args.requestId,request:{requestSourceId:receipt.sourceId}});
  return result;
 }
 async function invoke(input={}){
  return tracked(async()=>{
   const entry=SDP_DESK_METHODS.find(x=>x.method===input.method);need(entry,"UNKNOWN_METHOD","Select an available SDP desk method.");
   const args=input.args??{};need(plain(args),"INVALID_ARGUMENT","Supply complete SDP arguments.");
   for(const name of entry.required)need(Object.hasOwn(args,name),"MISSING_ARGUMENT","Supply "+name+".");
   if(input.method==="sdp.desks")return {schema:SCHEMA,desks:[...contexts.values()].map(x=>x.description)};
   const c=context(args.desk);
   if(input.method==="sdp.list")return sourceRows(c);
   if(input.method==="sdp.read"){
    const saved=await c.desk.read(args.sourceId,{json:args.json!==false});
    return {source:saved.source,value:saved.value,...(args.json===false?{bodyBase64:saved.body.toString("base64")}:{})};
   }
   if(input.method==="sdp.preview"){
    const prepared=prepareBatch(args.batch,{validateAddress:c.validateAddress});
    need(same(prepared.scope,c.desk.describe().scope),"SCOPE_MISMATCH","Preview must use the selected original scope.");
    return {schema:SCHEMA+".preview",prepared,sha256:hash(body(prepared))};
   }
   if(input.method==="sdp.request")return recover(c,args.command);
   const previous=queues.get(c.alias)??Promise.resolve();
   const pending=previous.then(()=>mutate(c,input));queues.set(c.alias,pending.catch(()=>{}));return pending;
  });
 }
 async function close(){
  if(closePromise)return closePromise;
  closing=true;controller.abort(new Error("SDP desk draining"));
  const pending=(async()=>{while(active.size)await Promise.allSettled([...active]);await releaseAdapters();signal?.removeEventListener("abort",forward);})();
  closePromise=pending;try{await pending;}catch(error){if(closePromise===pending)closePromise=null;throw error;}
 }
 return {schema:SCHEMA,methods:()=>SDP_DESK_METHODS.map(x=>({...x,required:[...x.required]})),invoke,close,
  describe:()=>({schema:SCHEMA,desks:[...contexts.values()].map(x=>x.description)})};
}
