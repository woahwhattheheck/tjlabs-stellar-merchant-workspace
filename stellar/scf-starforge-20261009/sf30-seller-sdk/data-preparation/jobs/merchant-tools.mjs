// MIT. Original pipeline commissioning through the existing preparation attachment.
import {MAX_RETAINED_CHUNK_BYTES} from '../../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const text=(max,min=1)=>({type:'string',minLength:min,maxLength:max});
const integer=(min=0,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max});
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const scoped=value=>({workspace:alias,...value});
const job={type:'object',additionalProperties:false,required:['id','functionId','inputSha256','publicOrigin','nativeSettlement'],
 properties:{id:text(200),functionId:{const:'executePipeline'},inputSha256:hash,configSha256:hash,applicationSha256:hash,
 publicOrigin:text(2048),attemptId:text(200),nativeSettlement:{type:'object',additionalProperties:false,required:['id','at'],
 properties:{id:text(200),at:text(200)}}}};
const expected={expectedBytes:integer(1,64*1024*1024),expectedSourceSha256:hash,expectedFilename:text(255)};
const read={readOnly:true,idempotent:true};
export function preparationCommissioningTools(tool){
 return [
  tool('merchant_preparation_job_catalog','Read the actual executePipeline merchant catalog through a host-declared existing private Request customer. Retain its full catalog SHA and original payment/output declarations before seeding that reviewed order.',
   scoped({customer:alias,merchantOrigin:text(2048)}),['workspace','customer','merchantOrigin'],read),
  tool('merchant_preparation_job_request','Continue one complete prepared order into its original Request customer: retain the deterministic original reference, stage and seal both exact project/selection files, then return its existing Request page. Partial retries resume the same request and original upload IDs. Checkout preparation and payment remain explicit actions on that original page.',
   scoped({customer:alias,orderDestination:alias,expectedOrderSha256:hash,merchantOrigin:text(2048),
    expectedCatalogSha256:hash,reference:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'},label:text(300)}),
   ['workspace','customer','orderDestination','expectedOrderSha256','merchantOrigin','expectedCatalogSha256','reference','label'],{idempotent:true}),

  tool('merchant_preparation_job_prepare','Freeze a complete original saved pipeline order. Select a declared project source or retained pipeline-project delivery, exact saved definition/source bindings, optional original reuse, and an unused declared order destination. Exact retries verify and reopen that original order; this operation prepares no payment.',
   scoped({sourceInput:alias,fileId:hash,expectedSourceSha256:hash,orderDestination:alias,
    pipelineId:{type:'string',pattern:'^p_[a-f0-9]{32}$'},revision:integer(1),reportName:text(120),
    inputs:{type:'object',additionalProperties:text(200)},reuseExecution:{type:'string',pattern:'^e_[a-f0-9]{32}$'}}),
   ['workspace','expectedSourceSha256','orderDestination','pipelineId','revision','reportName'],{idempotent:true}),
  tool('merchant_preparation_job_order','Verify and read the complete retained prepared order, original request input, file slots, exact source/pipeline editions and every full-file identity. Read the complete review and selection with merchant_preparation_job_file before the original Request/Buyer purchase.',
   scoped({orderDestination:alias,expectedOrderSha256:hash}),['workspace','orderDestination'],read),
  tool('merchant_preparation_job_receive','Receive a complete original paid executePipeline result through the original package verifier and independently editable pipeline receiver. Select exactly one declared result sourceInput or Buyer download directory, the complete original download descriptor, original job/native settlement and two separate declared destinations. Repeat the same original receiving after interruption.',
   scoped({sourceInput:alias,downloadDestination:alias,packageDestination:alias,destination:alias,...expected,job}),
   ['workspace','packageDestination','destination','expectedBytes','expectedSourceSha256','expectedFilename','job'],{idempotent:true}),
  tool('merchant_preparation_job_reopen','Verify the complete original result and reopen its independent editable project through the original receiver. Preserve later valid customer edits and original unfinished-execution Resume history. Optional download fields must be supplied together.',
   scoped({packageDestination:alias,destination:alias,...expected,job}),['workspace','packageDestination','destination'],{idempotent:true}),
  tool('merchant_preparation_job_result_files','Verify the complete original result package and list its report, editable project, execution record, successful-result files and whole package. Keep every returned file SHA when reading its complete original bytes.',
   scoped({packageDestination:alias,job}),['workspace','packageDestination'],read),
  tool('merchant_preparation_job_file','Read one complete prepared-order or received-result file in original SHA-bound chunks. After restart retain expectedSha256 and nextOffset; omit expired readId. Prepared selections are project.zip, selection.json, input.json and review.html. Results select package, report, project, execution or results.',
   scoped({kind:{enum:['order','result']},orderDestination:alias,packageDestination:alias,
    selection:text(80),expectedSha256:hash,job,readId:uuid,offset:integer(),limit:integer(1,MAX_RETAINED_CHUNK_BYTES)}),
   ['workspace','kind','selection','expectedSha256'],read),
  tool('merchant_preparation_job_file_release','Release an unfinished commissioning file descriptor. The complete original order and paid result remain available for independent resumed reading.',
   scoped({readId:uuid}),['workspace','readId'],{idempotent:true}),
 ];
}
