// MIT. Pure closed Merchant schemas for the original Econdb workspace.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'};
const hash={type:'string',pattern:'^[0-9a-f]{64}$'};
const count={type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
const page={offset:count,limit:{type:'integer',minimum:1,maximum:100}};
const bound={workspace:alias,workspaceId:uuid};
const read={readId:uuid,offset:count,limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}};
const member={type:'string',minLength:1,maxLength:4096};
const ro={readOnly:true,idempotent:true};
export const definitions=[
 ['workspaces','List configured original Econdb workspace aliases and their bound IDs.',{},[],ro],
 ['status','Read the original workspace revision, pending command and a complete paged record history.',{...bound,...page},['workspace','workspaceId'],ro],
 ['inputs','List host-declared exact command-file aliases; paths stay with the host.',{...bound},['workspace','workspaceId'],ro],
 ['input_inspect','Inspect one complete original command file and its exact bytes, SHA256, request UUID and expected revision.',{...bound,input:alias},['workspace','workspaceId','input'],ro],
 ['command','Apply the selected complete original command file. Repeat the same input bytes/SHA and UUID after uncertainty. Original operator.lock, revision, pending journal and engine checks remain authoritative.',{...bound,input:alias,expectedSha256:hash},['workspace','workspaceId','input','expectedSha256'],{idempotent:true}],
 ['request','Inspect one original command receipt/pending status and the complete retained request file identity.',{...bound,id:uuid},['workspace','workspaceId','id'],ro],
 ['request_file','Read complete original request bytes by SHA and offset; unchanged raw source and caller inputs remain in this file.',{...bound,id:uuid,expectedSha256:hash,...read},['workspace','workspaceId','id','expectedSha256'],ro],
 ['preserve_failed','Preserve all bytes of an original failed incomplete command with an explicit note. Never closes a completed or merely uncertain command.',{...bound,id:uuid,expectedRevision:count,note:{type:'string',minLength:1,maxLength:4000}},['workspace','workspaceId','id','expectedRevision','note'],{idempotent:true}],
 ['files','List all original artifact files in pages, including exact native manifest hashes.',{...bound,id:uuid,...page},['workspace','workspaceId','id'],ro],
 ['file_read','Read one complete original artifact through the maintained descriptor reader; repeat its hash and offset on resume.',{...bound,id:uuid,file:member,expectedSha256:hash,...read},['workspace','workspaceId','id','file','expectedSha256'],ro],
 ['file_release','Release an original file read without altering its source or operation.',{...bound,readId:uuid},['workspace','workspaceId','readId'],{idempotent:true}],
 ['handover','Export the complete original workspace and every original source, request, report, publication and buyer-return file. Reuse the same named export after interruption.',{...bound,exportId:alias},['workspace','workspaceId','exportId'],{idempotent:true}],
 ['handover_manifest','Inspect a named original complete handover without rerunning its exporter.',{...bound,exportId:alias},['workspace','workspaceId','exportId'],ro],
 ['handover_file','Read the exact handover manifest or member by original manifest/file hashes; supports independent complete download and restart.',{...bound,exportId:alias,file:member,expectedManifestSha256:hash,expectedSha256:hash,...read},['workspace','workspaceId','exportId','file','expectedManifestSha256','expectedSha256'],ro],
 ['handover_file_release','Release a read of this original handover.',{...bound,exportId:alias,readId:uuid},['workspace','workspaceId','exportId','readId'],{idempotent:true}],
 ['receive','Receive the complete selected handover into a host-declared independent destination using the original Econdb receiver. Existing advanced destinations are preserved.',{...bound,exportId:alias,expectedManifestSha256:hash,destination:alias},['workspace','workspaceId','exportId','expectedManifestSha256','destination'],{idempotent:true}]
];
export function econdbWorkspaceTools(tool){return definitions.map(([suffix,description,properties,required,annotations])=>tool('merchant_econdb_'+suffix,description,properties,required,annotations));}
export function validateArguments(name,args){
 const d=definitions.find(x=>'merchant_econdb_'+x[0]===name);
 if(!d)throw Object.assign(new Error('Select an advertised Econdb tool.'),{code:'TOOL_NOT_FOUND'});
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(d[2],k))||d[3].some(k=>!Object.hasOwn(args,k)))throw Object.assign(new Error('Use only the declared tool fields and include every required value.'),{code:'INVALID_PARAMS'});
 for(const [key,value]of Object.entries(args)){const s=d[2][key];
  if(s.type==='integer'&&(!Number.isSafeInteger(value)||value<s.minimum||value>s.maximum)||s.type==='string'&&(typeof value!=='string'||value.length<(s.minLength??0)||value.length>(s.maxLength??Infinity)||s.pattern&&!new RegExp(s.pattern).test(value)))throw Object.assign(new Error('Invalid '+key+'.'),{code:'INVALID_PARAMS'});
 }return d;
}
