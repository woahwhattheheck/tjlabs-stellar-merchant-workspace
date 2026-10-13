// MIT. Source-owned metadata for the complete original TIND workspace.
export const APPLY_KINDS=Object.freeze(['create','edition','profile','review','review-many','destination','destination-file','files','file-root','verify-files','prepare','receipt','file-receipt','reconcile','withdraw-batch','source-cases','source-case-review','source-download-plan','source-download-adopt','source-download-import','production-plan','production-review','production-disposition','production-prepare','production-reconcile','native-job-bind','native-job-import','native-job-receive']);
export const VIEW_ROUTES=Object.freeze({
 state:{path:'/api/state',required:[],allowed:['project']},
 history:{path:'/api/history',required:['kind'],allowed:['kind','offset','limit']},
 records:{path:'/api/records',required:['project'],allowed:['project','offset','limit','query']},
 record:{path:'/api/record',required:['project','identifier'],allowed:['project','identifier']},
 original:{path:'/api/original',required:['observation'],allowed:['observation']},
 'production-collections':{path:'/api/production-collections',required:['project'],allowed:['project']},
 'production-plans':{path:'/api/production-plans',required:['project'],allowed:['project','id','offset','limit']},
 'production-wave':{path:'/api/production-wave',required:['project','id'],allowed:['project','id','offset','limit']},
 'source-downloads':{path:'/api/source-downloads',required:['project'],allowed:['project','id','offset','limit']},
 files:{path:'/api/files',required:['project'],allowed:['project','offset','limit','query']},
 'file-history':{path:'/api/file-history',required:['project','identifier','file'],allowed:['project','identifier','file','offset','limit']},
 'source-cases':{path:'/api/source-cases',required:['project'],allowed:['project','offset','limit']},
 'source-case':{path:'/api/source-case',required:['project','id'],allowed:['project','id']},
 'source-case-reviews':{path:'/api/source-case-reviews',required:['project','id'],allowed:['project','id','offset','limit']},
 'destination-jobs':{path:'/api/destination-jobs',required:['project'],allowed:['project','id','offset','limit']},
 'job-observation':{path:'/api/job-observation',required:['project','id'],allowed:['project','id']}
});
export const DOWNLOAD_QUERIES=Object.freeze({
 record:{required:['project','identifier'],allowed:['project','identifier']},
 batch:{required:['batch'],allowed:['batch']},
 'batch-file':{required:['batch','file'],allowed:['batch','file']},
 handover:{required:[],allowed:['files']},
 'production-plan':{required:['project','id'],allowed:['project','id']},
 'source-acquisition':{required:['project','id'],allowed:['project','id']},
 'source-document':{required:['project','id','file'],allowed:['project','id','file']},
 'source-cases':{required:['project','id'],allowed:['project','id']},
 'source-case-review':{required:['project','id'],allowed:['project','id']},
 'file-receipt':{required:['project','id'],allowed:['project','id']},
 'destination-job':{required:['project','id'],allowed:['project','id']},
 'job-response':{required:['project','id'],allowed:['project','id']}
});
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const identity={type:'string',minLength:1,maxLength:256};
const operation={type:'string',pattern:'^[A-Za-z0-9._:-]{1,128}$'};
const uuid={type:'string',format:'uuid'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const object={type:'object'};
const query={type:'object',additionalProperties:false,properties:{
 project:identity,id:identity,identifier:{type:'string',minLength:1,maxLength:8192},file:identity,batch:identity,
 observation:identity,kind:identity,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:500},
 query:{type:'string',maxLength:4096},files:{type:'boolean'}}};
const request={type:'object',additionalProperties:false,required:['operationId','kind','projectId','expectedRevision','input'],properties:{
 operationId:operation,kind:{type:'string',enum:APPLY_KINDS},projectId:{anyOf:[identity,{type:'null'}]},
 expectedRevision:{anyOf:[{type:'integer',minimum:0},{type:'null'}]},input:object}};
const native={type:'object',additionalProperties:false,required:['operationId','task','projectId','expectedRevision','input'],properties:{
 operationId:operation,task:{enum:['search','send','source-download','job-read']},projectId:identity,
 expectedRevision:{type:'integer',minimum:0},input:object}};
export function tindWorkspaceTools(tool){
 return [
 tool('merchant_tind_workspaces','List the configured original TIND workspace aliases, ownership modes and current attachments.',{},[],{readOnly:true,idempotent:true}),
 tool('merchant_tind_open','Open the existing original TIND workspace. Managed mode attaches to the selected Applications listener; owned mode starts its original Python server. Returns the exact live instance and current original projects.',{workspace:alias},['workspace'],{idempotent:true}),
 tool('merchant_tind_view','Read the original project, paged records/files, staff cases, acquisition, production wave or native job observation. Select query fields from the original view; retained identifiers and original metadata remain complete.',{workspace:alias,view:{enum:Object.keys(VIEW_ROUTES)},query},['workspace','view'],{readOnly:true,idempotent:true}),
 tool('merchant_tind_save','Apply one complete original migration operation with its stable operationId and exact expectedRevision. Original operations cover source editions, record/access/file reviews, staff cases, production waves, native batches and result reconciliation. Supply a configured sourceFile alias for destination-file/source-download-import, or fileDirectory for file-root; omit host paths from input. The engine retains original membership and current revision.',{workspace:alias,request,sourceFile:alias,fileDirectory:alias},['workspace','request'],{idempotent:true}),
 tool('merchant_tind_preview','Preview the actual staff collection choices or original native job response before applying its reviewed result. source-case input is {projectId,collectionId,choices}; destination-job input is {projectId,input}.', {workspace:alias,kind:{enum:['source-case','destination-job']},input:object},['workspace','kind','input'],{readOnly:true,idempotent:true}),
 tool('merchant_tind_native_start','Start the saved original source acquisition, documented native export, exact frozen-batch send or original job GET. Use only configured authorization environment names. A send can change the institution destination. Retain the original operationId/request and inspect merchant_tind_operation after acceptance or an uncertain response; destination completion requires its original returned observation and reconciliation.',{workspace:alias,request:native},['workspace','request'],{idempotent:true,destructive:true}),
 tool('merchant_tind_operation','Read the exact retained agent request and original persisted outcome after a lost response or restart. kind=native may select an existing task/project/acquisition when the operation originated in the browser.',{workspace:alias,kind:{enum:['apply','native']},operationId:operation,projectId:identity,task:{enum:['search','send','source-download','job-read']},acquisitionId:identity},['workspace','kind','operationId'],{readOnly:true,idempotent:true}),
 tool('merchant_tind_resume','Continue the saved exact request with its original operation ID and inputs. It reads the retained request from this original project; it never substitutes a new ID or current revision. Original native engines decide whether interrupted work is safe to continue.',{workspace:alias,kind:{enum:['apply','native']},operationId:operation},['workspace','kind','operationId'],{idempotent:true,destructive:true}),
 tool('merchant_tind_source_pause','Request a checkpointed pause of the selected original acquisition while another native operation is running. The actual original worker retains complete and partial file identities.',{workspace:alias,projectId:identity,acquisitionId:identity},['workspace','projectId','acquisitionId'],{idempotent:true}),
 tool('merchant_tind_export','Prepare and retain the exact original customer file or complete editable handover under a stable exportId. The full file is streamed and hashed, with the original workspace revision selection retained. Handover includes original files by default; files=false is an explicit metadata-only handover. Reusing an exportId returns its frozen existing file.',{workspace:alias,exportId:operation,kind:{enum:Object.keys(DOWNLOAD_QUERIES)},query,expectedSelectionSha256:digest},['workspace','exportId','kind'],{idempotent:true}),
 tool('merchant_tind_file_read','Read a bounded base64 chunk of the already prepared complete original export. Use the returned readId/nextOffset and expectedSha256. After a host restart, omit readId and resume the same exportId/SHA/offset; the frozen file is retained on disk.',{workspace:alias,exportId:operation,readId:uuid,expectedSha256:digest,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608}},['workspace','exportId'],{readOnly:true,idempotent:true}),
 tool('merchant_tind_file_release','Release this attachment’s original retained-file read descriptor; the complete prepared export remains available for later receiving.',{workspace:alias,readId:uuid},['workspace','readId'],{idempotent:true}),
 tool('merchant_tind_close','Close this exact live instance. Managed mode detaches the agent and leaves Applications running. Owned mode stops only its original child, drains accepted work and releases retained descriptors. Supply the actual instanceId returned by open.',{workspace:alias,instanceId:uuid},['workspace','instanceId'],{idempotent:true})
 ];
}
