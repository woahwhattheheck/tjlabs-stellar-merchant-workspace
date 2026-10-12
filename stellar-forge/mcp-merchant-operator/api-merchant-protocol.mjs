// MIT. Source-owned agent contracts for the original API merchant console.
export const API_MERCHANT_PREFIX='merchant_api_console_';
export const API_MERCHANT_CONNECTION_SCHEMA='stellar-forge.sf101.api-merchant-mcp-connection.v1';
export const API_MERCHANT_NATIVE_EXPORT_SCHEMA='stellar-forge.sf101.api-merchant-export.v1';
export const API_MERCHANT_MANIFEST='manifest.json';
export const API_MERCHANT_MAX_FILE_BYTES=4*1024**3;
export const API_MERCHANT_MAX_MANIFEST_BYTES=1024*1024;
export const API_MERCHANT_ALIAS=/^[a-z0-9][a-z0-9_-]{0,63}$/;
export const API_MERCHANT_UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const API_MERCHANT_HASH=/^[a-f0-9]{64}$/;
export const API_MERCHANT_FILE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const apiMerchantPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const apiMerchantError=(code,message,extra={})=>Object.assign(new Error(message),{code,apiMerchantPublic:true,...extra});
export function apiMerchantNeed(value,message,code='API_MERCHANT_AGENT_ARGUMENTS_REQUIRED'){
 if(!value)throw apiMerchantError(code,message);
}
export function apiMerchantExact(value,keys,required=[]){
 apiMerchantNeed(apiMerchantPlain(value)&&Object.keys(value).every(key=>keys.includes(key))&&
  required.every(key=>Object.hasOwn(value,key)),'Supply exactly the declared fields and all required fields.');
 return value;
}
const string=(max=240,pattern)=>({type:'string',minLength:1,maxLength:max,...(pattern?{pattern:pattern.source}:{})});
const integer=(min=1,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max});
const alias=string(64,API_MERCHANT_ALIAS),uuid=string(36,API_MERCHANT_UUID),sha=string(64,API_MERCHANT_HASH);
const reference=string(80,/^[A-Za-z0-9._:-]{1,80}$/),requestId=string(128,/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const revision=integer(),mutation={operationId:uuid,expectedRevision:revision};
const page={offset:integer(0),limit:integer(1,50),expectedRevision:revision};
const route={type:'object',additionalProperties:false,properties:{
 id:string(80,/^[A-Za-z0-9_-]{1,80}$/),functionId:string(160),units:integer(),timeoutSeconds:integer(1,120)},
 required:['id','functionId','units','timeoutSeconds']};
const offer={title:string(160),allowanceUnits:integer(),routes:{type:'array',minItems:1,maxItems:64,items:route},
 workerPort:integer(1,65535),apiPort:integer(0,65535)};
const call={offerId:uuid,orderReference:reference,requestId,callRevision:revision,reason:string(500)};
const definitions=[];
function define(kind,description,properties={},required=[],annotations={readOnly:true,idempotent:true}){
 definitions.push({name:API_MERCHANT_PREFIX+kind,kind,description,properties,required,annotations});
}
function action(kind,description,properties={},required=Object.keys(properties),annotations={}){
 define(kind,description,{workspace:alias,...mutation,...properties},
  ['workspace','operationId','expectedRevision',...required],{idempotent:true,openWorld:true,...annotations});
}
define('workspaces','List configured original merchant console aliases, original workspace IDs and named application/receiving selections.');
define('new_id','Generate a new operation UUID. Retain it with the reviewed request before any mutation.',{},[],{readOnly:true,idempotent:false});
define('view','Read the original merchant workspace revision, source description, service status and complete inventory counts. Page every collection with inventory.',{workspace:alias},['workspace']);
define('inventory','Page offers, orders, saved operations, exports, backups or selected application functions from one original workspace revision. Carry expectedRevision across pages.',
 {workspace:alias,collection:{type:'string',enum:['offers','orders','operations','exports','backups','functions']},...page},['workspace','collection']);
define('selections','Inspect host-declared existing application and extracted-backup handles with their reviewed full source hashes. These handles select native paths on this host.',
 {workspace:alias},['workspace']);
define('preview','Compile an offer from the actual selected Jobs functions and checkout terms. Use the returned sourceSha256 when preparing that offer.',
 {workspace:alias,...offer},['workspace',...Object.keys(offer)]);
action('source_refresh','Refresh the original selected Jobs and checkout source for future offers.');
action('offer_prepare','Save the reviewed offer, exact purchased routes and application preparation under the original operation.',
 {expectedSourceSha256:sha,...offer});
action('offer_publish','Publish the selected prepared application through the original native materializer.',{offerId:uuid});
action('offer_adopt','Adopt a host-declared existing application and its exact original purchased plan.',{application:alias,label:string()});
action('order_prepare','Enroll the original plan for a stable order reference and prepare the complete private customer handoff.',
 {offerId:uuid,orderReference:reference,label:string()});
action('order_adopt','Adopt the original enrolled or funded order without creating another purchase.',
 {offerId:uuid,orderReference:reference,label:string()});
action('start','Start the selected original application worker and API gateway as one console-owned service.',{offerId:uuid});
action('stop','Drain the original worker and gateway through the existing service owner.',{},[],{destructive:true});
action('attach_pass','Attach the original checkout entitlement to its purchased API pass.',{orderReference:reference});
action('access','Apply an original access revision: suspend, resume, expire or clear expiry.',
 {orderReference:reference,accessRevision:integer(0,2147483646),action:{type:'string',enum:['suspend','resume','expire','clear-expiry']},
 reason:string(500),expiresAt:{type:['string','null'],minLength:1,maxLength:128}},
 ['orderReference','accessRevision','action','reason'],{destructive:true});
action('recover_call','Recover the same original call using its request ID and current access-call revision.',call);
action('release_call','Release the same original call through the native recovery engine.',call,Object.keys(call),{destructive:true});
action('export_usage','Export the original complete order usage, route prices and allowance accounting.',{orderReference:reference});
action('export_result','Retain the complete original execution response and metadata.',
 {offerId:uuid,executionId:string(70,/^sf101-[a-f0-9]{64}$/)});
action('backup','Drain and capture the complete original application, merchant state, executions and checkout outbox, then encrypt the full receiving bundle.',
 {offerId:uuid,label:string(),resumeService:{type:'boolean'}});
action('restore','Restore the selected original backup through the console operation. Matching captured orders map to the restored offer; newer or changed orders retain their current offer.',
 {backupId:uuid,label:string()});
define('operation','Reopen the exact saved operation request, attempts and result before retrying an interrupted response.',
 {workspace:alias,operationId:uuid},['workspace','operationId']);
define('resume','Resume the same saved operation using its original request SHA256.',
 {workspace:alias,operationId:uuid,requestSha256:sha},['workspace','operationId','requestSha256'],{idempotent:true,openWorld:true});
define('cancel','Cancel an original queued operation using its retained request SHA256.',
 {workspace:alias,operationId:uuid,requestSha256:sha},['workspace','operationId','requestSha256'],{idempotent:true,destructive:true});
define('offer','Read one original offer and its complete exported member descriptions.',{workspace:alias,offerId:uuid},['workspace','offerId']);
define('order','Read an original order, purchased allowance and actual call page. Continue with the returned nextAfter.',
 {workspace:alias,orderReference:reference,after:string(512),limit:integer(1,100)},['workspace','orderReference']);
define('executions','Page the selected original application executions using the native cursor.',
 {workspace:alias,offerId:uuid,after:string(512),limit:integer(1,100)},['workspace','offerId']);
define('execution','Reopen the exact original execution request/result metadata without executing it.',
 {workspace:alias,offerId:uuid,executionId:string(70,/^sf101-[a-f0-9]{64}$/)},['workspace','offerId','executionId']);
define('manifest','Read the original immutable export manifest and full member identities. Available after the serving console stops.',
 {workspace:alias,exportId:uuid},['workspace','exportId']);
define('file','Read an original exported file or its manifest in exact SHA-pinned base64 chunks through the existing retained descriptor owner. Resume at the same offset after a client or MCP restart.',
 {workspace:alias,exportId:uuid,file:string(128,API_MERCHANT_FILE),expectedManifestSha256:sha,expectedSha256:sha,
 readId:uuid,offset:integer(0,API_MERCHANT_MAX_FILE_BYTES),limit:integer(1,196608)},
 ['workspace','exportId','file','expectedManifestSha256','expectedSha256']);
define('file_release','Release the selected original file-read descriptor; its complete native file remains retained.',
 {workspace:alias,exportId:uuid,readId:uuid},['workspace','exportId','readId'],{idempotent:true});
define('restore_bundle','Receive one host-declared extracted encrypted backup into its selected runtime using the original complete restore command. A repeated completed selection reopens the same snapshot.',
 {workspace:alias,receiving:alias,expectedMetadataSha256:sha},['workspace','receiving','expectedMetadataSha256'],{idempotent:true,openWorld:true});
export const API_MERCHANT_TOOL_DEFINITIONS=Object.freeze(definitions);
export const API_MERCHANT_ACTIONS=Object.freeze(definitions.filter(d=>Object.hasOwn(d.properties,'expectedRevision')&&Object.hasOwn(d.properties,'operationId')).map(d=>d.kind));
export function apiMerchantWorkspaceTools(tool){
 return definitions.map(d=>tool(d.name,d.description,structuredClone(d.properties),[...d.required],{...d.annotations}));
}
function checked(value,schema,path){
 if(Array.isArray(schema.type)){apiMerchantNeed(schema.type.some(type=>value===null?type==='null':typeof value===type),'Supply the declared value for '+path+'.');if(value===null)return;}
 else if(schema.type==='object'){
  apiMerchantExact(value,Object.keys(schema.properties),schema.required??[]);
  for(const [key,item] of Object.entries(value))checked(item,schema.properties[key],path+'.'+key);
  return;
 }else if(schema.type==='array'){
  apiMerchantNeed(Array.isArray(value)&&value.length>=(schema.minItems??0)&&value.length<=(schema.maxItems??Number.MAX_SAFE_INTEGER),'Supply the declared array for '+path+'.');
  value.forEach((item,index)=>checked(item,schema.items,path+'['+index+']'));return;
 }else if(schema.type==='integer'){
  apiMerchantNeed(Number.isSafeInteger(value)&&value>=(schema.minimum??0)&&value<=(schema.maximum??Number.MAX_SAFE_INTEGER),'Supply an integer in range for '+path+'.');return;
 }else apiMerchantNeed(typeof value===schema.type,'Supply the declared value for '+path+'.');
 if(schema.type==='string'||Array.isArray(schema.type)&&typeof value==='string'){
  apiMerchantNeed(value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??Number.MAX_SAFE_INTEGER)&&
   !/[\x00-\x1f\x7f]/.test(value)&&(!schema.pattern||new RegExp(schema.pattern).test(value)),'Supply the original value for '+path+'.');
 }
 if(schema.enum)apiMerchantNeed(schema.enum.includes(value),'Select a declared value for '+path+'.');
}
export function apiMerchantArguments(name,input={}){
 const kind=name.startsWith(API_MERCHANT_PREFIX)?name.slice(API_MERCHANT_PREFIX.length):name;
 const definition=definitions.find(d=>d.kind===kind);
 apiMerchantNeed(definition,'Choose a declared API merchant tool.','TOOL_NOT_FOUND');
 checked(input,{type:'object',properties:definition.properties,required:definition.required},kind);
 if(kind==='access')apiMerchantNeed(input.action==='expire'?typeof input.expiresAt==='string':input.expiresAt===undefined||input.expiresAt===null,
  'Supply expiresAt only for the original expiry action.');
 return structuredClone(input);
}
export function parseApiMerchantExport(bytes,selectedId){
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw apiMerchantError('API_MERCHANT_AGENT_EXPORT_INVALID','The original manifest must be complete UTF-8 JSON.');}
 apiMerchantNeed(apiMerchantPlain(value)&&value.schema===API_MERCHANT_NATIVE_EXPORT_SCHEMA&&API_MERCHANT_UUID.test(value.id??'')&&
  (selectedId===undefined||selectedId===value.id)&&Array.isArray(value.files)&&value.files.length>0&&value.files.length<=64,
  'Select the original complete API merchant export manifest.','API_MERCHANT_AGENT_EXPORT_INVALID');
 const names=new Set();
 for(const file of value.files){
  apiMerchantNeed(apiMerchantPlain(file)&&API_MERCHANT_FILE.test(file.name??'')&&file.name!==API_MERCHANT_MANIFEST&&!names.has(file.name)&&
   Number.isSafeInteger(file.bytes)&&file.bytes>=0&&file.bytes<=API_MERCHANT_MAX_FILE_BYTES&&API_MERCHANT_HASH.test(file.sha256??'')&&
   typeof file.contentType==='string'&&file.contentType.length<=255&&!/[^\x20-\x7e]/.test(file.contentType),
   'Use each original unique file, byte count and SHA256.','API_MERCHANT_AGENT_EXPORT_INVALID');names.add(file.name);
 }
 return {...value,exportId:value.id};
}
