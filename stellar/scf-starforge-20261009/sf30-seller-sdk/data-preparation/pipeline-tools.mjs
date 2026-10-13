// MIT. Complete original pipeline operations through the declared preparation host.
const text=(max,min=1)=>({type:'string',minLength:min,maxLength:max});
const integer=(min=0,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max});
const choice=values=>({type:'string',enum:values});
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const sourceId={type:'string',pattern:'^s_[a-f0-9]{64}$'};
const recipeId={type:'string',pattern:'^q_[a-f0-9]{32}$'};
const pipelineId={type:'string',pattern:'^p_[a-f0-9]{32}$'};
const executionId={type:'string',pattern:'^e_[a-f0-9]{32}$'};
const receivedId={type:'string',pattern:'^r_[a-f0-9]{64}$'};
const stageId={type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,47}$'};
const operationId={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'};
const page={offset:integer(),limit:integer(1,200)};
const read={readOnly:true,idempotent:true};
const sourceBindings={type:'object',additionalProperties:sourceId,minProperties:1,maxProperties:128};
const selection={oneOf:[
 {type:'object',properties:{input:stageId},required:['input'],additionalProperties:false},
 {type:'object',properties:{stage:stageId},required:['stage'],additionalProperties:false}
]};
const definition={type:'object',additionalProperties:false,required:['label','inputs','stages'],
 properties:{label:text(128),description:text(20000,0),inputs:sourceBindings,
  outputs:{type:'array',items:stageId,minItems:1,maxItems:128,uniqueItems:true},
  stages:{type:'array',minItems:1,maxItems:128,items:{type:'object',additionalProperties:false,
   required:['id','sql','bindings'],properties:{id:stageId,label:text(128),description:text(20000,0),
    sql:text(100000),parameters:{type:'object',additionalProperties:{type:['string','integer','boolean','null']}},
    bindings:{type:'object',minProperties:1,maxProperties:32,additionalProperties:selection}
   }}}
 }};
export function preparationPipelineTools(tool){
 const scoped=properties=>({workspace:alias,...properties});
 return [
  tool('merchant_preparation_pipeline_status','Inspect the original pipeline journal and both current preparation/pipeline state digests before full delivery.',
   scoped({}),['workspace'],read),
  tool('merchant_preparation_pipeline_browser','Open the original pipeline editor on the same private Applications listener.',
   scoped({}),['workspace'],read),
  tool('merchant_preparation_pipeline_list','Page complete saved pipeline editions or retained executions from the original journal.',
   scoped({collection:choice(['pipelines','executions']),...page}),['workspace','collection'],read),
  tool('merchant_preparation_pipeline_definition','Read the complete selected saved pipeline definition and topological stage order.',
   scoped({pipelineId,revision:integer(1)}),['workspace','pipelineId'],read),
  tool('merchant_preparation_pipeline_save','Save a complete pipeline edition over original source IDs with explicit stage bindings and the current expected revision.',
   scoped({definition,pipelineId,expectedRevision:integer()}),['workspace','definition'],{}),
  tool('merchant_preparation_pipeline_from_recipe','Prepare a pipeline definition from the original saved SQL recipe without executing or changing it.',
   scoped({recipeId,revision:integer(1)}),['workspace','recipeId'],read),
  tool('merchant_preparation_pipeline_enqueue','Retain the exact pipeline edition and named input selection under a stable request key. Select reuseExecution explicitly to reuse compatible completed stages.',
   scoped({pipelineId,requestKey:text(200),revision:integer(1),inputs:sourceBindings,reuseExecution:executionId}),
   ['workspace','pipelineId','requestKey'],{idempotent:true}),
  tool('merchant_preparation_pipeline_execute','Start the saved execution, or explicitly resume its unfinished native stages while preserving completed results and attempt history.',
   scoped({executionId,resume:{type:'boolean'}}),['workspace','executionId'],{idempotent:true}),
  tool('merchant_preparation_pipeline_execution','Read the complete original execution, stage results, retained attempts and reuse selections.',
   scoped({executionId}),['workspace','executionId'],read),
  tool('merchant_preparation_pipeline_events','Read the original execution event journal using its retained sequence cursor.',
   scoped({executionId,after:integer(),limit:integer(1,200)}),['workspace','executionId'],read),
  tool('merchant_preparation_pipeline_rows','Read complete original result rows for the selected execution and stage; preserve missing values separately from empty text.',
   scoped({executionId,stageId,...page}),['workspace','executionId','stageId'],read),
  tool('merchant_preparation_pipeline_cancel','Request cooperative cancellation through the original pipeline and native SQL engine.',
   scoped({executionId}),['workspace','executionId'],{idempotent:true}),
  tool('merchant_preparation_pipeline_recover','Recover abandoned original pipeline executions once their actual executor lease is available.',
   scoped({}),['workspace'],{idempotent:true}),
  tool('merchant_preparation_pipeline_review','Append the selected original stage-result decision at its expected review revision.',
   scoped({executionId,stageId,decision:choice(['accept','revise','withdraw']),reviewer:text(128),note:text(10000,0),expectedRevision:integer()}),
   ['workspace','executionId','stageId','decision','reviewer','note'],{}),
  tool('merchant_preparation_pipeline_compare','Compare two original complete executions, exact input changes and full ordered result digests.',
   scoped({beforeId:executionId,afterId:executionId}),['workspace','beforeId','afterId'],read),
  tool('merchant_preparation_pipeline_export','Retain the full pipeline project, all selected results, report, dataset or one complete result under a stable operation ID and both reviewed state digests. Use the existing preparation file tools to read every byte after restart.',
   scoped({operationId,kind:choice(['pipeline-project','pipeline-results','pipeline-report','pipeline-merchant','pipeline-result']),
    executionId,stageId,file:choice(['result.csv','result.jsonl','schema.json']),label:text(128),
    expectedStateSha256:hash,expectedPipelineSha256:hash}),
   ['workspace','operationId','kind','expectedStateSha256','expectedPipelineSha256'],{idempotent:true}),
  tool('merchant_preparation_pipeline_receive','Receive the complete declared pipeline project or retained pipeline-project file through the original create-only receiver. Reuse requestKey and SHA after a lost response; the returned project has its own private listener, connection file and editable workspace.',
   scoped({sourceInput:alias,fileId:hash,expectedSourceSha256:hash,requestKey:text(200)}),
   ['workspace','expectedSourceSha256','requestKey'],{idempotent:true}),
  tool('merchant_preparation_pipeline_received','List complete original received projects and retained archive identities.',
   scoped({}),['workspace'],read),
  tool('merchant_preparation_pipeline_open_received','Reopen the original received project on its own private managed listener. The parent Applications owner drains its owned child listeners on Stop.',
   scoped({receivedId}),['workspace','receivedId'],{idempotent:true}),
 ];
}
