// MIT. Source-owned complete BLS analyst customer tools.
export const OPERATION_KINDS=Object.freeze(['capture','import','select','note','report','compare','regional','export','publisher-open','publisher-stop','receive','native-receive']);
export const VIEW_QUERIES=Object.freeze({
 state:{keys:['offset','limit'],required:[]},'default-selection':{keys:[],required:[]},
 edition:{keys:['id'],required:['id']},observations:{keys:['edition','projection','filters','offset','limit'],required:['edition','projection']},
 note:{keys:['subject'],required:['subject']},report:{keys:['id','offset','limit'],required:['id']},
 'regional-definition':{keys:['id'],required:['id']},'native-state':{keys:['id'],required:['id']}
});
export function blsAnalystTools(tool){
 const workspace={type:'string',description:'Configured original BLS analyst workspace alias.'};
 const identifier={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$'};
 const object={type:'object',additionalProperties:true};
 const read={workspace};
 return [
  tool('merchant_bls_analyst_workspaces','List configured original BLS analyst projects and current attachment state.',{},[]),
  tool('merchant_bls_analyst_open','Attach to the exact running Applications workspace or start its configured original Python owner.',read,['workspace']),
  tool('merchant_bls_analyst_view','Read the original paged source editions, full observations, saved regional definitions, reports, notes or native publication state.',
   {...read,view:{type:'string',enum:Object.keys(VIEW_QUERIES)},query:object},['workspace','view']),
  tool('merchant_bls_analyst_save','Save one exact original analyst operation. Source import and project receive use configured file aliases; receive also uses a configured independent destination. Retain original ID and expected revision.',
   {...read,request:{type:'object',properties:{id:identifier,kind:{type:'string',enum:OPERATION_KINDS},input:object,expected_revision:{type:'integer',minimum:0}},required:['id','kind','input','expected_revision'],additionalProperties:false},sourceFile:{type:'string'},destination:{type:'string'}},['workspace','request']),
  tool('merchant_bls_analyst_definition_preview','Reopen a complete original regional definition against its retained source edition before saving the next analysis revision.',
   {...read,document:object},['workspace','document']),
  tool('merchant_bls_analyst_operation','Inspect the complete immutable agent input and actual original workspace operation/request.',{...read,operationId:identifier},['workspace','operationId']),
  tool('merchant_bls_analyst_resume','Continue the same original retained operation and complete source upload after an uncertain response; reuse its original ID.',{...read,operationId:identifier},['workspace','operationId']),
  tool('merchant_bls_analyst_stop','Request interruption of only the selected original native-receive subprocess. The saved publication state remains available for the same-operation continuation.',{...read,operationId:identifier},['workspace','operationId']),
  tool('merchant_bls_analyst_export','Retain a complete original source/report file or completed editable project ZIP for streaming customer receiving. Reuse the same export ID and original file selection.',
   {...read,exportId:identifier,kind:{type:'string',enum:['source','report','export']},id:identifier,name:{type:'string'}},['workspace','exportId','kind','id']),
  tool('merchant_bls_analyst_file_read','Read complete retained original bytes in chunks. After restart use the same export ID, SHA and offset without the earlier process read ID.',
   {...read,exportId:identifier,readId:{type:'string'},expectedSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608}},['workspace','exportId']),
  tool('merchant_bls_analyst_file_release','Close one owned original retained file descriptor.',{...read,readId:{type:'string'}},['workspace','readId']),
  tool('merchant_bls_analyst_close','Close this exact current attachment. Managed mode detaches; owned mode drains and closes only the Python child it started. A failed close can be continued with the same instance ID.',
   {...read,instanceId:{type:'string',pattern:'^[a-f0-9]{32}$'}},['workspace','instanceId'])
 ];
}
