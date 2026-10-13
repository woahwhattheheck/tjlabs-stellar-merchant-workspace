/** Lazy metadata only; the original host loads native attachments on demand. */
const alias={type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const object={type:'object'};
const integer={type:'integer',minimum:0};
export function zarrWorkspaceTools(tool){
 const row=(name,description,properties,required)=>tool(name,description,properties,required);
 return [
 row('merchant_zarr_status','List host-declared original Zarr workspaces, or read complete native status for one connected alias.',{workspace:alias},[]),
 row('merchant_zarr_connect','Attach to the current original Applications/operator instance; never starts another server.',{workspace:alias,expectedInstanceId:uuid},['workspace']),
 row('merchant_zarr_disconnect','Drain and close this MCP attachment to the exact current instance; the application retains native ownership.',{workspace:alias,instanceId:uuid},['workspace','instanceId']),
 row('merchant_zarr_browser','Return the private browser link of the currently attached original operator.',{workspace:alias},['workspace']),
 row('merchant_zarr_prepare','Prepare and inspect an exact original native intent using host-declared source aliases; retain the returned complete envelope before Apply.',{workspace:alias,intent:object},['workspace','intent']),
 row('merchant_zarr_apply','Apply the exact retained prepared envelope. Same UUID and input reopen the native receipt after response loss.',{workspace:alias,prepared:object},['workspace','prepared']),
 row('merchant_zarr_operation','Read one complete original native operation by UUID, including its saved request and outcome.',{workspace:alias,operationId:uuid},['workspace','operationId']),
 row('merchant_zarr_resume','Resume the exact saved native request. Completed operations return their original receipt.',{workspace:alias,operationId:uuid},['workspace','operationId']),
 row('merchant_zarr_result_page','Read a complete page of an immutable typed native result, including source coordinates and total row population.',{workspace:alias,resultId:hash,offset:integer,limit:{type:'integer',minimum:1,maximum:500}},['workspace','resultId','offset','limit']),
 row('merchant_zarr_frozen','Verify the complete original reviewed scalar source selected for publication.',{workspace:alias,frozenId:hash},['workspace','frozenId']),
 row('merchant_zarr_export','Retain the original complete source-workspace ZIP with this UUID. Publisher/dataset stores belong to the separate full merchant handover.',{workspace:alias,operationId:uuid},['workspace','operationId']),
 row('merchant_zarr_receive','Receive one host-declared complete packet into a separate declared root using the retained receiving UUID.',{workspace:alias,operationId:uuid,inputId:alias,destinationId:alias},['workspace','operationId','inputId','destinationId']),
 row('merchant_zarr_files','List complete original source-workspace ZIPs with byte counts and SHA-256.',{workspace:alias},['workspace']),
 row('merchant_zarr_file_read','Read an exact range of a complete immutable ZIP; bind every range to the expected whole-file SHA and verify its returned chunk SHA.',{workspace:alias,fileId:uuid,expectedSha256:hash,offset:integer,limit:{type:'integer',minimum:1,maximum:1048576}},['workspace','fileId','expectedSha256','offset','limit']),
 row('merchant_zarr_publisher','Use the one original publisher for a frozen source. Writes require a retained UUID; plan/review/buyer retries use original durable receipts.',{
  workspace:alias,frozenId:hash,action:{type:'string',enum:['source','status','target','plan','run','inspect','buyer-offer','save-plan','extract','cancel','review','publish','recover','prepare-buyer']},
  input:object,requestId:uuid},['workspace','frozenId','action','input']),
 row('merchant_zarr_publisher_requests','Read original operator publisher request receipts and any unresolved response.',{workspace:alias},['workspace']),
 row('merchant_zarr_publisher_request_recover','Continue the same retained publisher request, preserving exact action, input, run and request UUID.',{workspace:alias,requestId:uuid},['workspace','requestId']),
 row('merchant_zarr_publisher_request_close','Explicitly close an inactive unknown transport response with a reason. This does not modify native publisher history.',{workspace:alias,requestId:uuid,reason:{type:'string',minLength:1,maxLength:4000}},['workspace','requestId','reason'])
 ];
}
