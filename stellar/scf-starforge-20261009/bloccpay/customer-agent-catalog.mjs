// MIT. Source-owned customer-agent tools for the existing Bloccpay host.
const text={type:'string',minLength:1,maxLength:4096};
const id={type:'string',minLength:1,maxLength:199};
const alias={type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'};
const object={type:'object',additionalProperties:true};
const nonnegative={type:'integer',minimum:0};
const read={readOnly:true,idempotent:true};
export function bloccpayTools(tool){
 const scoped=fields=>({workspace:alias,...fields});
 return [
  tool('merchant_bloccpay_status','List configured original host aliases and this agent’s retained work. Does not open a writer or stop the application.',{},[],read),
  tool('merchant_bloccpay_bootstrap','Read the actual original workspace identity, connection scopes, method schemas, native action catalogue and summary.',scoped({}),['workspace'],read),
  tool('merchant_bloccpay_list','Page original records or exact native requests. Pass nextCursor unchanged until null. Uses the current original host.',scoped({table:text,cursor:text,limit:{type:'integer',minimum:1,maximum:500},filters:object}),['workspace','table'],read),
  tool('merchant_bloccpay_item','Read one original native record, including a request’s retained status/result/error.',scoped({table:text,id}),['workspace','table','id'],read),
  tool('merchant_bloccpay_command','Retain and execute one explicitly selected complete original command. Supply the actual requestId, expectedRevision, method and args from bootstrap. Provider operations retain original prepare/dispatch, scope, approval and reconciliation behavior. An uncertain result keeps this exact request.',scoped({command:{type:'object',required:['requestId','method','args'],properties:{requestId:id,expectedRevision:nonnegative,method:text,args:object},additionalProperties:false}}),['workspace','command'],{openWorld:true}),
  tool('merchant_bloccpay_request','Inspect a retained original request and local exact input/result. resume:true explicitly replays the SAME frozen native command or declared upload; it never makes a replacement request ID.',scoped({requestId:id,resume:{type:'boolean'}}),['workspace','requestId'],{openWorld:true}),
  tool('merchant_bloccpay_upload','Upload one host-declared exact file to original file.retain, source.import or payroll.import. The original native command owns the resulting file and request. Credentials remain in private host configuration.',scoped({sourceImport:alias,requestId:id,expectedRevision:nonnegative,method:{enum:['file.retain','source.import','payroll.import']},args:object}),['workspace','sourceImport','requestId','method'],{openWorld:true}),
  tool('merchant_bloccpay_download','Download an original visible file or complete existing export archive into the private customer export area, verify full bytes, then read bounded base64 chunks. Retain expectedSha256 for subsequent offsets. Export creation is a separately selected original workspace.export or report.export command.',scoped({kind:{enum:['file','archive']},id,expectedSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},offset:nonnegative,limit:{type:'integer',minimum:1,maximum:1048576}}),['workspace','kind','id'],read),
 ];
}
