// SPDX-License-Identifier: MIT
// Complete original operator inputs; this module loads no runtime or network client.
export const CONNECTION_SCHEMA='stellar-forge.facilitator-customer-connection.v1';
export const CUSTOMER_SCHEMA='stellar-forge.facilitator-customer.v1';
export const TOOL_PREFIX='merchant_commissioning_';
export const MAX_SOURCE_BYTES=64*1024*1024, MAX_ARCHIVE_BYTES=8*1024*1024*1024;
export const MAX_CHUNK_BYTES=196608, MAX_JSON_BYTES=64*1024*1024;
export const ID=/^[a-z0-9][a-z0-9_-]{0,63}$/, UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/, SHA=/^[a-f0-9]{64}$/;
export const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const stable=x=>JSON.stringify(x,(_k,v)=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const failure=(code,message)=>Object.assign(new Error(message),{code});
export function need(ok,message,code='COMMISSIONING_CUSTOMER_INPUT'){if(!ok)throw failure(code,message);}
export const idSchema={type:'string',pattern:ID.source};
export const uuidSchema={type:'string',pattern:UUID.source};
export const shaSchema={type:'string',pattern:SHA.source};
const text=(maximum=4000)=>({type:'string',minLength:1,maxLength:maximum});
const integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum,maximum});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const array=(items,minItems=0,maxItems=1000)=>({type:'array',items,minItems,maxItems});
export const fileRef=object({sha256:shaSchema,bytes:integer(0,MAX_SOURCE_BYTES)});
const inputRequest=object({id:idSchema,routeId:idSchema,url:text(16000),method:{type:'string',pattern:'^[A-Z]{1,20}$'},body:fileRef,output:fileRef,mediaType:text(500)},['id','routeId','url','method','output','mediaType']);
const provider=object({alias:idSchema,releaseId:idSchema,operatorId:text(240),operatorName:text(240),authorityReference:text(2000),authority:fileRef,supportedResponse:fileRef},['alias','releaseId','operatorId','operatorName','authorityReference','authority']);
const service=object({purpose:text(),sourceReference:text(2000),sourceEdition:text(240),receiver:object({name:text(240),system:text(500),operator:text(240)}),scope:fileRef,schema:fileRef,acceptance:fileRef});
export const actionPayloads={
  initialize:object({id:idSchema,title:text(240),releaseId:idSchema,providers:array(provider,2,2),requests:array(inputRequest,1),service}),
  review:object({provider:idSchema,review:fileRef},['provider']),
  stage:object({reviewOperationId:uuidSchema}),
  select:object({provider:idSchema,expectedGeneration:integer(),reason:text()}),
  start:object({provider:idSchema,expectedGeneration:integer()}),
  stop:object({runOperationId:uuidSchema}),
  'receive-run':object({runOperationId:uuidSchema,nativeInstanceId:text(240)}),
  'buyer-plan':object({provider:idSchema,template:idSchema,requests:array(object({requestId:idSchema,intentId:text(240),paymentOption:integer()}),1)}),
  receive:object({provider:idSchema,requestId:idSchema,runOperationId:uuidSchema,summary:fileRef,evidence:fileRef,output:fileRef,
    receiving:object({operator:text(240),decision:{type:'string',enum:['ACCEPTED','CHANGES_REQUIRED','INCOMPLETE']},note:text(12000),receivedAt:text(80)}),
    supersedesOperationId:uuidSchema},['provider','requestId','runOperationId','summary','evidence','receiving']),
  export:object({})
};
export const commandSchema={anyOf:Object.entries(actionPayloads).map(([action,payload])=>object({operationId:uuidSchema,expectedRevision:integer(),action:{const:action},payload}))};
const instance={instance:idSchema}, original={...instance,jobId:idSchema};
const selectedFile=object({kind:{type:'string',enum:['input','blob','buyer','buyer-execution','command','report','transfer','archive']},id:text(300),name:text(1000)},['kind']);
const toolRows=[
 ['instances','List only host-declared original commissioning instances and exact job identities.',{},[],{readOnly:true,idempotent:true}],
 ['state','Inspect the same authenticated operator and complete retained customer selection.',instance,['instance'],{readOnly:true,idempotent:true}],
 ['release','Read the selected original native release before preparing the complete service.',{...instance,releaseId:idSchema},['instance','releaseId'],{readOnly:true,idempotent:true}],
 ['history','Read original results, runs or pending commands at the same exact revision; follow all pages.',{...original,kind:{type:'string',enum:['results','runs','pending']},offset:integer(),limit:integer(1,250),revision:integer()},['instance','jobId','revision'],{readOnly:true,idempotent:true}],
 ['source_begin','Retain an exact original source identity before the first upload; continue its UUID after interruption.',{...instance,upload:object({id:uuidSchema,name:text(240),bytes:integer(0,MAX_SOURCE_BYTES),sha256:shaSchema})},['instance','upload'],{idempotent:true}],
 ['source_status','Recover the original source upload and complete offset; never replace its original UUID.',{...instance,uploadId:uuidSchema},['instance','uploadId'],{readOnly:true,idempotent:true}],
 ['source_chunk','Append or compare exact base64 bytes at the original upload offset; each chunk is at most 192 KiB.',{...instance,uploadId:uuidSchema,offset:integer(),data:{type:'string',maxLength:Math.ceil(MAX_CHUNK_BYTES/3)*4}},['instance','uploadId','offset','data'],{idempotent:true}],
 ['source_complete','Verify the complete source against its original hash and publish that same file reference.',{...instance,uploadId:uuidSchema},['instance','uploadId'],{idempotent:true}],
 ['source_import','Stream a complete host-declared original input into its same saved upload; retains checksum and resumes the actual offset.',{...instance,source:idSchema,uploadId:uuidSchema},['instance','source','uploadId'],{idempotent:true}],
 ['prepare','Retain the complete native operator command locally before its first preparation. Its action/payload/revision/UUID remain fixed.',{...instance,command:commandSchema},['instance','command'],{idempotent:true}],
 ['apply','Deliberately apply the exact already retained original command. Native provider, selection, run and payment controls remain authoritative.',{...instance,operationId:uuidSchema},['instance','operationId'],{idempotent:true,openWorld:true,destructive:true}],
 ['receive','Read the original host outcome and retained full request after interruption. NOT_FOUND retains the same command for explicit prepare/apply.',{...instance,operationId:uuidSchema},['instance','operationId'],{readOnly:true,idempotent:true}],
 ['pending','List this customer connection’s complete locally saved commands and accepted receipts after process restart.',{...instance,offset:integer(),limit:integer(1,100)},['instance'],{readOnly:true,idempotent:true}],
 ['capture','Retain a complete original file or TAR with streamed hash verification and source identity. Use reportRevision for a current report.',{...original,captureId:uuidSchema,file:selectedFile,reportRevision:integer(),expectedSha256:shaSchema,expectedBytes:integer(0,MAX_ARCHIVE_BYTES)},['instance','jobId','captureId','file'],{idempotent:true}],
 ['manifest','Reopen the exact completed captured-file manifest and original source selection without requiring a live operator.',{...instance,captureId:uuidSchema},['instance','captureId'],{readOnly:true,idempotent:true}],
 ['file','Read the complete captured original in SHA-pinned chunks through EOF; reopen the same offset/hash after a read handle expires.',{...instance,captureId:uuidSchema,expectedManifestSha256:shaSchema,expectedSha256:shaSchema,readId:text(240),offset:integer(),limit:integer(1,MAX_CHUNK_BYTES)},['instance','captureId','expectedManifestSha256','expectedSha256'],{readOnly:true,idempotent:true}],
 ['file_release','Release only the temporary original-file read handle; keep the complete retained file and manifest.',{...instance,captureId:uuidSchema,readId:text(240)},['instance','captureId','readId'],{readOnly:true,idempotent:true}],
 ['receive_archive','Receive the complete saved original TAR through its original native receiver into a host-declared private destination.',{...original,captureId:uuidSchema,expectedManifestSha256:shaSchema,expectedSha256:shaSchema,receiver:idSchema},['instance','jobId','captureId','expectedManifestSha256','expectedSha256','receiver'],{idempotent:true}]
];
export function commissioningCustomerTools(tool){return toolRows.map(([name,description,properties,required,annotations])=>tool(TOOL_PREFIX+name,description,properties,required,annotations));}
function matches(value,s){
  if(s.anyOf)return s.anyOf.some(v=>matches(value,v));
  if(Object.hasOwn(s,'const')&&value!==s.const)return false;
  if(s.enum&&!s.enum.includes(value))return false;
  if(s.type==='string')return typeof value==='string'&&(s.minLength===undefined||value.length>=s.minLength)&&(s.maxLength===undefined||value.length<=s.maxLength)&&(!s.pattern||new RegExp(s.pattern).test(value));
  if(s.type==='integer')return Number.isSafeInteger(value)&&(s.minimum===undefined||value>=s.minimum)&&(s.maximum===undefined||value<=s.maximum);
  if(s.type==='array')return Array.isArray(value)&&value.length>=(s.minItems??0)&&value.length<=(s.maxItems??Infinity)&&value.every(v=>matches(v,s.items));
  if(s.type==='object')return plain(value)&&(s.required??[]).every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>Object.hasOwn(s.properties,k)&&matches(value[k],s.properties[k]));
  return true;
}
export function validateCommissioningCustomerTool(name,args){
  const row=toolRows.find(v=>TOOL_PREFIX+v[0]===name);need(row,'Choose a declared commissioning customer tool.');
  need(matches(args,object(row[2],row[3])),'Use the complete typed input fields for '+name+'.');
  return row[0];
}
export function validateCustomerCommand(command){need(matches(command,commandSchema),'Retain a complete typed original operator command.');return command;}
