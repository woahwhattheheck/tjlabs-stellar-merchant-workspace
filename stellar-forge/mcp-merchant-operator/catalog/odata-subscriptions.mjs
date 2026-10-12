// MIT. Lazy metadata for the complete source-owned collection subscription operator.
import {MAX_RETAINED_CHUNK_BYTES} from '../retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const requestId={type:'string',minLength:1,maxLength:200};
const revision={type:'integer',minimum:1,maximum:10000};
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}};
const reading={readOnly:true,idempotent:true};
const writing={readOnly:false,idempotent:true};
const input={input:alias,artifact:alias};
export const SUBSCRIPTION_TOOL_PREFIX='merchant_odata_subscription_';
export function odataSubscriptionTools(tool){
 const make=(name,description,properties,required=[],annotations=reading)=>tool(SUBSCRIPTION_TOOL_PREFIX+name,description,properties,required,annotations);
 return [
  make('status','List configured subscription publishers, customers, complete collection selections and declared receiving inputs. Paths are host owned.',{}),
  make('publisher_create','Create a subscription from a complete original collection and fixed selected fields plus every entity key. Retain requestId and the exact body for resume.',{publisher:alias,collection:alias,requestId,title:{type:'string',minLength:1,maxLength:160},fields:{type:'array',items:{type:'string',minLength:1,maxLength:1024},maxItems:32,minItems:1}},['publisher','collection','requestId','title'],writing),
  make('publisher_append','Append a fully retained original collection. The same selected keys and fields are required; query scope changes require explicit allowScopeChange and a note. Removed means outside this selected collection.',{publisher:alias,collection:alias,requestId,expectedRevision:revision,note:{type:'string',minLength:1,maxLength:4000},allowScopeChange:{type:'boolean'}},['publisher','collection','requestId','expectedRevision','note'],writing),
  make('publisher_inspect','Read the original subscription definition, current edition, source query and pending request.',{publisher:alias},['publisher']),
  make('publisher_editions','Page original published edition identities, source selections and exact change counts.',{publisher:alias,...page},['publisher']),
  make('publisher_rows','Page the complete rows or keyed membership changes of one selected publisher edition.',{publisher:alias,revision,kind:{type:'string',enum:['rows','changes']},...page},['publisher']),
  make('publisher_cancel','Cancel the selected unpublished request, retain its terminal ID and isolate its unfinished edition files. Reusing that ID stays cancelled after backup/restore.',{publisher:alias,requestId},['publisher','requestId'],writing),
  make('publisher_delivery','Retain a complete selected customer baseline (fromRevision0) or ordered incremental delivery (positive original customer revision). Export ID and selected editions are durable.',{publisher:alias,artifact:alias,fromRevision:{type:'integer',minimum:0,maximum:10000},toRevision:revision},['publisher','artifact','toRevision'],writing),
  make('publisher_source','Retain the full original supplier collection and Analysis source for one published edition.',{publisher:alias,artifact:alias,revision},['publisher','artifact','revision'],writing),
  make('publisher_backup','Retain the complete publisher state, original sources, edition chain and terminal request history at the reviewed current revision.',{publisher:alias,artifact:alias,expectedRevision:{type:'integer',minimum:0,maximum:10000}},['publisher','artifact','expectedRevision'],writing),
  make('publisher_restore','Receive a complete publisher backup through original source replay into a configured empty publisher. Choose exactly one input or retained artifact.',{publisher:alias,...input},['publisher'],writing),
  make('customer_receive','Apply a complete baseline or ordered incremental transfer to the configured customer. Verify prior row hashes and each full published result. Repeating an earlier delivery preserves newer selected work.',{customer:alias,...input},['customer'],writing),
  make('customer_inspect','Read the complete retained customer head, applied transfer identities and any selected pending delivery.',{customer:alias},['customer']),
  make('customer_rows','Page current full customer rows with exact key and original scalar/null values.',{customer:alias,...page},['customer']),
  make('customer_export','Retain the selected customer edition as full CSV, original Analysis source document and complete replayable delivery proof.',{customer:alias,artifact:alias,expectedRevision:revision,expectedEditionSha256:hash,title:{type:'string',minLength:1,maxLength:160}},['customer','artifact','expectedRevision','expectedEditionSha256'],writing),
  make('customer_backup','Retain the entire selected customer with its starting baseline, all applied deliveries and intermediate full snapshots.',{customer:alias,artifact:alias,expectedRevision:revision,expectedEditionSha256:hash},['customer','artifact','expectedRevision','expectedEditionSha256'],writing),
  make('customer_restore','Restore a declared complete customer backup or original analytical source by replaying the original delivery chain. Choose one input or retained artifact.',{customer:alias,...input},['customer'],writing),
  make('analysis_mapping','Produce the native Analysis import mapping using the actual registered source alias and returned source revision. Value and null-state columns remain distinct.',{customer:alias,source:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_-]{0,63}$'},sourceRevision:{type:'integer',minimum:1}},['customer','source','sourceRevision']),
  make('artifacts','Page retained delivery, backup, supplier-source and customer-analysis output selections and states.',page),
  make('artifact','Verify and inspect one entire completed output with every relative member path, byte count and SHA256.',{artifact:alias},['artifact']),
  make('file','Read a declared retained output file through the original bounded immutable-file reader. Repeat artifact/path/expectedSha256 for every range and select all manifest members for complete receiving.',
   {artifact:alias,path:{type:'string',minLength:1,maxLength:1024},expectedSha256:hash,readId:{type:'string',format:'uuid'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['artifact','path','expectedSha256']),
  make('file_release','Release the original process-local file read. Completed reads close automatically.',{readId:{type:'string',format:'uuid'}},['readId'])
 ];
}
