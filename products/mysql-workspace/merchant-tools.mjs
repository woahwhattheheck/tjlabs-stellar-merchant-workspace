// MIT. Original merchant tool metadata for the complete MySQL product.
import { publisherTools } from '../../stellar-forge/mcp-merchant-operator/catalog/publisher.mjs';
import { MAX_RETAINED_CHUNK_BYTES } from '../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const alias={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const release={type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]{0,63}$'};
const revision={type:'integer',minimum:0};
const selection={workspace:alias};
const page={offset:revision,limit:{type:'integer',minimum:1,maximum:100}};
const read={readOnly:true,idempotent:true};
export const publisherName=name=>'merchant_mysql_product_publish_'+name.slice('merchant_publisher_'.length);
export const sourceActions=Object.freeze({
  merchant_mysql_product_status:'status',merchant_mysql_product_catalog:'source_catalog',
  merchant_mysql_product_review:'source_review',merchant_mysql_product_preview:'source_preview',
  merchant_mysql_product_prepare:'source_prepare',merchant_mysql_product_releases:'releases',
  merchant_mysql_product_release:'release',merchant_mysql_product_seller_start:'seller_start',
  merchant_mysql_product_seller_stop:'seller_stop',merchant_mysql_product_seller_status:'seller_status',
  merchant_mysql_product_client_export:'client_export',merchant_mysql_product_client_info:'client_get',merchant_mysql_product_drafts:'drafts',
  merchant_mysql_product_draft:'draft_get',merchant_mysql_product_draft_save:'draft_save',
  merchant_mysql_product_draft_versions:'draft_versions',merchant_mysql_product_action:'action',
  merchant_mysql_product_actions:'actions',merchant_mysql_product_publications:'publications',
  merchant_mysql_product_publication_create:'publication_create',merchant_mysql_product_publication_open:'publication_open',
  merchant_mysql_product_publication_close:'publication_close',merchant_mysql_product_dataset_status:'dataset_status',
  merchant_mysql_product_dataset_configure:'dataset_configure',merchant_mysql_product_dataset_start:'dataset_start',
  merchant_mysql_product_dataset_stop:'dataset_stop',merchant_mysql_product_archive:'archive',
  merchant_mysql_product_archive_get:'archive_get',
});
export function mysqlProductTools(tool){
  const result=[
    tool('merchant_mysql_products','List host-declared complete MySQL products and their original open owners. No source query or schedule starts.',{},[],read),
    tool('merchant_mysql_product_open','Open the original MySQL editor and complete product under one kernel lease. Returns the same original browser on repeat.',selection,['workspace'],{idempotent:true}),
    tool('merchant_mysql_product_close','Close this exact MySQL product instance, drain its browsers, original publishers/schedules and sellers, and retain all state.',{...selection,instanceId:uuid},['workspace','instanceId'],{destructive:true}),
    tool('merchant_mysql_product_status','Read source identity, native editor runtime, saved drafts, publication bindings and original action history.',selection,['workspace'],read),
    tool('merchant_mysql_product_catalog','Read actual MySQL information_schema tables or one table with its exact column/scalar contract.',{...selection,table:{type:'string',maxLength:256}},['workspace'],read),
    tool('merchant_mysql_product_review','Review the original full mysql-workspace-plan.v1 choices against current database schema and payment terms. This uses the original compiler.',{...selection,choices:{type:'object'}},['workspace','choices'],{readOnly:true,openWorld:true}),
    tool('merchant_mysql_product_preview','Run the original private approved-query example for one endpoint in a current reviewed plan.',{...selection,reviewId:uuid,planId:hash,endpointId:release},['workspace','reviewId','planId','endpointId'],{readOnly:true,openWorld:true}),
    tool('merchant_mysql_product_prepare','Prepare or reopen the original reviewed MySQL package and generated customer SDK. Original release ID/plan guards govern retries.',{...selection,reviewId:uuid,planId:hash},['workspace','reviewId','planId'],{idempotent:true}),
    tool('merchant_mysql_product_releases','Page all prepared releases from the original workspace.',{...selection,page:revision},['workspace'],read),
    tool('merchant_mysql_product_release','Verify and reopen the complete selected original prepared release.',{...selection,releaseId:release},['workspace','releaseId'],read),
    tool('merchant_mysql_product_seller_start','Start the exact original query seller and operations/availability controls from a reviewed prepared manifest.',{...selection,releaseId:release,manifestSha256:hash},['workspace','releaseId','manifestSha256'],{idempotent:true,openWorld:true}),
    tool('merchant_mysql_product_seller_stop','Stop the exact original query seller run and retain its availability/history.',{...selection,runId:uuid},['workspace','runId'],{destructive:true}),
    tool('merchant_mysql_product_seller_status','Read the current original query seller run and operations URL.',selection,['workspace'],read),
    tool('merchant_mysql_product_client_export','Retain the complete original generated Node customer client/OpenAPI archive for chunked delivery. Select its exact prepared release manifest.',{...selection,releaseId:release,manifestSha256:hash},['workspace','releaseId','manifestSha256'],{idempotent:true}),
    tool('merchant_mysql_product_client_info','Verify and read the exact retained original customer SDK archive.',{...selection,sha256:hash},['workspace','sha256'],read),
    tool('merchant_mysql_product_drafts','Page saved working drafts, including unfinished endpoint editor fields.',{...selection,...page},['workspace'],read),
    tool('merchant_mysql_product_draft','Read the exact saved draft version. Its original fields stay intact when the current schema changes.',{...selection,draftId:uuid,revision:{type:'integer',minimum:1}},['workspace','draftId'],read),
    tool('merchant_mysql_product_draft_save','Save a complete mysql-editor-draft.v1 working draft as an immutable version with expectedRevision and original request UUID.',{
      ...selection,requestId:uuid,draftId:uuid,expectedRevision:revision,label:{type:'string',minLength:1,maxLength:160},
      note:{type:'string',minLength:1,maxLength:2000},draft:{type:'object'}},['workspace','requestId','draftId','expectedRevision','label','note','draft'],{idempotent:true}),
    tool('merchant_mysql_product_draft_versions','Page every retained version of this original draft.',{...selection,draftId:uuid,...page},['workspace','draftId'],read),
    tool('merchant_mysql_product_action','Read the exact saved product request and result after a lost reply.',{...selection,requestId:uuid},['workspace','requestId'],read),
    tool('merchant_mysql_product_actions','Page saved product requests/results with original identities.',{...selection,...page},['workspace'],read),
    tool('merchant_mysql_product_publications','List prepared-release publication bindings without opening a publisher or starting a schedule.',selection,['workspace'],read),
    tool('merchant_mysql_product_publication_create','Bind the exact prepared MySQL source to its original publication ledger and versioned dataset target. Repeats retain the same release and request.',{...selection,requestId:uuid,releaseId:release,manifestSha256:hash},['workspace','requestId','releaseId','manifestSha256'],{idempotent:true}),
    tool('merchant_mysql_product_publication_open','Open the original retained MySQL publisher and scheduler for this exact prepared release. Previously enabled native recurrence resumes; optional browser opens its original console.',{...selection,releaseId:release,manifestSha256:hash,browser:{type:'boolean'}},['workspace','releaseId','manifestSha256'],{idempotent:true,openWorld:true}),
    tool('merchant_mysql_product_publication_close','Close this exact owned publication, original schedule and dataset seller while retaining native plans/candidates and history.',{...selection,releaseId:release,instanceId:uuid},['workspace','releaseId','instanceId'],{destructive:true}),
    tool('merchant_mysql_product_dataset_status','Inspect the original dataset snapshot/revision and exact reviewed native seller configurations.',{...selection,releaseId:release},['workspace','releaseId'],read),
    tool('merchant_mysql_product_dataset_configure','Review and retain the original snapshot-selectable dataset seller configuration while its target is offline. Payment index selects an exact prepared MySQL payment option; origin remains the reviewed release origin.',{
      ...selection,requestId:uuid,releaseId:release,manifestSha256:hash,expectedSnapshot:hash,expectedRevision:revision,
      paymentIndex:revision,path:{type:'string',minLength:2,maxLength:181},reviewer:{type:'string',minLength:1,maxLength:128},
      note:{type:'string',minLength:1,maxLength:2000}},
      ['workspace','requestId','releaseId','manifestSha256','expectedSnapshot','expectedRevision','paymentIndex','path','reviewer','note'],{idempotent:true}),
    tool('merchant_mysql_product_dataset_start','Start the original versioned dataset seller from exact reviewed config and current snapshot/revision, using the same native facilitator and private loopback control. Reattaches the original publisher buyer handoff.',{
      ...selection,releaseId:release,instanceId:uuid,configId:uuid,configSha256:hash,expectedSnapshot:hash,expectedRevision:revision,
      port:{type:'integer',minimum:0,maximum:65535}},['workspace','releaseId','instanceId','configId','configSha256','expectedSnapshot','expectedRevision'],{idempotent:true,openWorld:true}),
    tool('merchant_mysql_product_dataset_stop','Stop the exact original dataset seller run and reopen its retained publisher offline.',{...selection,releaseId:release,instanceId:uuid,runId:uuid},['workspace','releaseId','instanceId','runId'],{destructive:true}),
    tool('merchant_mysql_product_archive','Quiesce all owned native work, retain the complete portable product archive, then reopen the editor. Includes source/CA, SQL packages, drafts, original publisher candidates/reviews/history and version files. This request UUID owns one complete handover.',{...selection,requestId:uuid},['workspace','requestId'],{idempotent:true}),
    tool('merchant_mysql_product_archive_get','Verify the complete retained handover and read its original identity/hash. A restored product retains its original receiving receipt.',{...selection,requestId:uuid},['workspace','requestId'],read),
    tool('merchant_mysql_product_file_read','Read a retained whole-product handover or original customer SDK through the existing verified byte-chunk reader. Continue readId/nextOffset until complete.',{
      ...selection,kind:{enum:['archive','client']},requestId:uuid,sha256:hash,readId:uuid,offset:revision,
      limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['workspace','kind','sha256'],read),
    tool('merchant_mysql_product_file_release','Release one original temporary file-read snapshot while keeping the retained complete handover or customer client.',{...selection,readId:uuid},['workspace','readId'],{idempotent:true}),
  ];
  publisherTools((name,description,properties,required=[],annotations={})=>{
    if(['merchant_publishers','merchant_publisher_open','merchant_publisher_close'].includes(name))return null;
    const{publisher,...native}=properties;
    result.push(tool(publisherName(name),description+' Uses the selected product’s original prepared-release publisher.',
      {...selection,releaseId:release,instanceId:uuid,...native},
      ['workspace','releaseId','instanceId',...required.filter(key=>key!=='publisher')],annotations));return null;
  });
  return result;
}
