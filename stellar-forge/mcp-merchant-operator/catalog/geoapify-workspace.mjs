// MIT. Geoapify operator metadata loads without its filesystem or HTTP runtime.
import {MAX_RETAINED_CHUNK_BYTES} from '../retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const text={type:'string',minLength:1,maxLength:200};
const object={type:'object',additionalProperties:true};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const read={readOnly:true,idempotent:true};
const revision={type:'integer',minimum:0};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$'};
const queryId={type:'string',pattern:'^q_[a-f0-9]{64}$'};
const count=(minimum,maximum)=>({type:'integer',minimum,maximum});
const fields=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const mapping=fields(Object.fromEntries(['text','name','housenumber','street','postcode','city','state','country','identity','latitude','longitude'].map(k=>[k,{type:'string',maxLength:200}])));
const options=fields({limit:count(1,20),lang:{type:'string',pattern:'^[a-z]{2}$'},
 filter:{type:'string',maxLength:1000},bias:{type:'string',maxLength:1000},
 type:{enum:['country','state','city','postcode','street','amenity','locality']},priority:{type:'number',minimum:0.5,maximum:1},
 endpoint:{enum:['https://api.geoapify.com/v1/batch','https://api-eu.geoapify.com/v1/batch']}});
const providerPayload={
 prepare:fields({expectedRevision:revision,maximumInputs:count(1,1000),queryIds:{type:'array',minItems:1,maxItems:1000,uniqueItems:true,items:queryId},refresh:{type:'boolean'},options},['expectedRevision']),
 request:fields({id,offset:count(0,1000),limit:count(1,250),eventOffset:count(0,Number.MAX_SAFE_INTEGER),eventLimit:count(1,100)},['id']),
 run:fields({id,expectedRequestSha256:hash,expectedRevision:revision},['id','expectedRequestSha256','expectedRevision']),
 poll:fields({id,expectedRequestSha256:hash,expectedRevision:revision},['id','expectedRequestSha256','expectedRevision']),
 import:fields({id,sourceImport:alias,expectedRequestSha256:hash,expectedRevision:revision},['id','sourceImport','expectedRequestSha256','expectedRevision']),
 abandon:fields({id,reviewer:text,reason:{type:'string',minLength:1,maxLength:4000},expectedRevision:revision},['id','reviewer','reason','expectedRevision'])
};
const reviewPayload={
 list:fields({status:text,search:{type:'string',maxLength:2000},offset:count(0,1000000),limit:count(1,250)}),
 query:fields({queryId,sourceOffset:count(0,1000000),sourceLimit:count(1,100)},['queryId']),
 decide:fields({expectedRevision:revision,queryId,action:{enum:['accept','keep-source']},candidateId:{anyOf:[hash,{type:'null'}]},
   coordinateChoice:{enum:['preserve-source','fill-missing','use-provider']},reviewer:text,
   note:{type:'string',minLength:1,maxLength:4000},expectedResponseSha256:{anyOf:[hash,{type:'null'}]}},
   ['expectedRevision','queryId','action','reviewer','note'])
};
reviewPayload.decide.allOf=[{if:{properties:{action:{const:'accept'}},required:['action']},then:{properties:{candidateId:hash,expectedResponseSha256:hash},required:['candidateId','expectedResponseSha256']}}];
const editionPayload={
 build:fields({expectedRevision:revision,name:{type:'string',minLength:1,maxLength:128},
   scope:{enum:['all-source','reviewed-only']},sourceColumns:{type:'array',maxItems:32,items:fields({
     name:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,47}$'},source:{type:'string',minLength:1,maxLength:200}},['name','source'])}},['expectedRevision','name']),
 activate:fields({expectedRevision:revision,editionId:id},['expectedRevision','editionId'])
};
const publisherActions=new Set([
 'publisher.status','publisher.prepare','publisher.preview','publisher.reviewDraft','publisher.publish','publisher.activateSnapshot','publisher.collect',
 'publisher.release.stage','publisher.release.inspect','publisher.release.activate','publisher.release.rollback','publisher.release.start','publisher.release.stop',
 'publisher.buyer.review','publisher.buyer.prepare','publisher.buyer.session','publisher.buyer.run','publisher.buyer.recover','publisher.buyer.account','publisher.buyer.export',
 'publisher.facilitators.history','publisher.facilitators.inspect','publisher.facilitators.review','publisher.facilitators.stage'
]);
function actionTool(tool,name,description,actions,hints={}){
 const result=tool(name,description,{workspace:alias,action:{enum:Object.keys(actions)},payload:{anyOf:Object.values(actions)}},['workspace','action','payload'],hints);
 result.inputSchema.allOf=Object.entries(actions).map(([name,payload])=>({if:{properties:{action:{const:name}},required:['action']},then:{properties:{payload}}}));
 return result;
}
function geoapifyWorkspaceTools(tool){
 const scoped=p=>({workspace:alias,...p});
 const chunk={expectedSha256:hash,readId:uuid,offset:count(0,Number.MAX_SAFE_INTEGER),limit:count(1,MAX_RETAINED_CHUNK_BYTES)};
 return [
 tool('merchant_geoapify_status','List declared Geoapify workspaces or read an opened operator. Jobs, editions, exports and job events have explicit history pages. Credentials appear only as a configured flag. Reading status makes no provider request.',scoped({offset:count(0,Number.MAX_SAFE_INTEGER),limit:count(1,100)}),[],read),
 tool('merchant_geoapify_open','Open the declared private Geoapify workspace once under its original writer lease. Subsequent opens reuse this process instance.',scoped({}),['workspace'],{idempotent:true}),
 tool('merchant_geoapify_close','Drain accepted actions and close this process-owned Geoapify operator, its borrowed browser and retained chunk reads. Saved source, provider jobs and customer work remain available.',scoped({instanceId:uuid}),['workspace','instanceId'],{destructive:true}),
 tool('merchant_geoapify_intake','Import a host-declared original CSV or JSON source. Retains every original row and identity while grouping identical address queries. Mapping chooses free-form text or structured fields and optional original coordinates.',scoped({sourceImport:alias,expectedRevision:revision,mapping}),['workspace','sourceImport','expectedRevision']),
 tool('merchant_geoapify_source','Inspect exact original source records, mapping and duplicate identities with explicit offsets. Makes no external request.',scoped({offset:count(0,1000000),limit:count(1,250)}),['workspace'],read),
 actionTool(tool,'merchant_geoapify_provider','Prepare a saved generic /v1/batch request, inspect its inputs/events, explicitly submit or poll, import a declared full response, or abandon an original job with a reason. Run and poll use the exact saved request hash and revision. A batch selects at most1000 query IDs. Native jobs preserve SENDING/UNCERTAIN and never repeat an uncertain POST. Poll waits at least60seconds and respects Retry-After; each submission and poll consumes provider quota. Request inspection and chunk downloads are read-only.',providerPayload,{openWorld:true}),
 actionTool(tool,'merchant_geoapify_review','Inspect full candidates and record explicit reviewer decisions. Query inspection pages original rows, source ordinals and candidate/source-coordinate comparisons. List returns initial source pages. Accept binds the chosen candidate to the actual response SHA; keep-source retains original coordinates. Full original history is in the complete export.',reviewPayload),
 actionTool(tool,'merchant_geoapify_edition','Build a frozen native SF30 CSV/GeoJSON/review edition from all source rows or the reviewed subset, or activate a retained edition. Coordinate selection follows explicit decisions. Source columns retain original scalar fields.',editionPayload),
 tool('merchant_geoapify_editor','Read or save unfinished browser forms in the original workspace and complete backup. Save requires expectedRevision; raw forms do not submit provider requests or create review decisions.',scoped({action:{enum:['read','save']},expectedRevision:revision,editor:object}),['workspace','action']),
 tool('merchant_geoapify_query','Query the selected native dataset with projection, filters, sort and snapshot-bound cursor; retain the query against expectedRevision.',scoped({expectedRevision:revision,query:object}),['workspace','expectedRevision','query']),
 tool('merchant_geoapify_merchant','Configure the selected edition using a host-declared public seller/payment profile and the original SF30 compiler.',scoped({profile:alias,expectedRevision:revision}),['workspace','profile','expectedRevision']),
 tool('merchant_geoapify_export','Export the complete workspace with original source, prepared requests, retained responses, decisions, unfinished forms and editions. A selected edition additionally exports native CSV/GeoJSON, review, query, provenance and configured seller files.',scoped({expectedRevision:revision}),['workspace','expectedRevision']),
 tool('merchant_geoapify_restore','Restore a host-declared complete .json.gz package into an empty original Geoapify workspace. Verify original files and dataset identities, then continue retained provider job IDs.',scoped({sourceImport:alias,expectedRevision:revision}),['workspace','sourceImport','expectedRevision']),
 tool('merchant_geoapify_file','Read original source exports, exact prepared provider requests or native publisher/customer files in retained byte chunks. Continue with readId/expectedSha256/nextOffset; EOF releases the snapshot.',scoped({kind:{enum:['source-export','provider-request','draft-csv','draft-review','buyer-config','session-manifest','session-csv','session-jsonl','session-review','facilitator-review','facilitator-response']},id,filename:{type:'string',maxLength:500},...chunk}),['workspace','kind','id'],read),
 tool('merchant_geoapify_file_release','Release an unfinished process-owned chunk read while retaining its original file.',scoped({readId:uuid}),['workspace','readId'],{idempotent:true}),
 tool('merchant_geoapify_publisher','Continue the original dataset publisher, release, facilitator and buyer workflows. Prepare selects this source exportId. Release staging uses declared runtime settings; buyer sessions use declared buyer workspaces. Original generations, saved reviews, payment limits and page-attempt records remain authoritative.',scoped({action:{enum:[...publisherActions]},payload:object}),['workspace','action'],{openWorld:true}),
 tool('merchant_geoapify_browser','Open or close a local industrial browser on the same original operator. Borrowed browser close leaves the MCP workspace and its original writer lease open.',scoped({action:{enum:['open','close']},port:count(0,65535)}),['workspace','action'])
 ];
}
export {geoapifyWorkspaceTools,publisherActions};
