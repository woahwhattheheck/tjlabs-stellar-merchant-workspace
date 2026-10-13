// SPDX-License-Identifier: MIT
// Metadata only; the original Python operator remains behind the provider's lazy runtime.
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const alias={type:'string',pattern:'^[a-z][a-z0-9-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const text={type:'string'};
const offset={type:'integer',minimum:0};
const limit={type:'integer',minimum:1,maximum:250};
const pageLimit={type:'integer',minimum:1,maximum:100};
const workspace={workspace:alias};
export const PROJECT_PORTFOLIO_AGENT_ACTIONS=Object.freeze({
 intake:'Capture the complete original project and selected companion files with MPXJ.',
 source_review:'Review native source fields, explicit mappings, decisions and corrections.',
 source_apply:'Apply the exact saved source review to a new native edition.',
 mspdi_export:'Write the selected native edition to a complete Microsoft-compatible project XML file.',
 probe:'Read the selected original target profile and its actual native metadata.',
 prepare:'Prepare the selected edition for its original Project Operations or MSPDI target.',
 prepare_adjustment:'Prepare a reviewed correction against the selected original deployment revision.',
 review:'Record the operator and exact current migration plan review.',
 continue:'Continue the same reviewed native operation and recover its saved provider calls.',
 adopt_detail:'Bind the exact observed native operation detail to its unresolved original call.',
 capture_target:'Read the actual native target and save the complete source-to-target comparison.',
 receive_target_file:'Receive a returned project file through the original native reader and comparison.',
 accept:'Accept the exact current comparison and record any explicit retained differences.',
 handover:'Create the complete accepted migration report and source/target handover.',
 archive:'Export the complete original portable workspace and saved operation history.',
 abandon_set:'Apply the original explicit abandonment operation to the selected native set.',
 archive_save:'Save the named portfolio cohort, original editions, reporting fields and metric rules.',
 archive_review:'Review the current saved cohort projection, field coverage, relationships and totals.',
 archive_publish:'Publish the exact reviewed cohort as complete SQLite, CSV, report and Power Query files.',
 archive_query_export:'Export the complete read-only SQL query from the original publication.',
 archive_inspect:'Inspect a complete uploaded portable workspace before receiving it.',
 archive_receive:'Receive the selected complete portable workspace through its original archive engine.'
});
export function projectPortfolioTools(tool){
 const reads={readOnly:true,idempotent:true,openWorld:false};
 const writes={readOnly:false,idempotent:true,openWorld:false};
 return [
  tool('merchant_project_portfolio_workspaces','List the configured Project Portfolio workspaces and original source-file aliases.',{},[],reads),
  tool('merchant_project_portfolio_status','Open the current saved connection and read the original workspace state.',
   {...workspace,cursor:text,limit:pageLimit},['workspace'],reads),
  tool('merchant_project_portfolio_list','Page the original saved requests, editions or reporting cohorts.',
   {...workspace,collection:{enum:['requests','editions','cohorts']},cursor:text,limit:pageLimit},['workspace','collection'],reads),
  tool('merchant_project_portfolio_read','Read a complete saved original record, object or one page of native edition rows.',
   {...workspace,kind:{enum:['request','edition','source_review','deployment','object','cohort']},id:hash,
    family:{enum:['tasks','resources','assignments','dependencies','calendars']},offset,limit},
   ['workspace','kind','id'],reads),
  tool('merchant_project_portfolio_source_fields','Read the exact native field catalogue retained in the selected original edition.',
   {...workspace,editionId:hash,family:{enum:['project','tasks','resources','assignments']}},['workspace','editionId','family'],reads),
  tool('merchant_project_portfolio_companions','Read all retained companion definitions or a page of their original captured rows.',
   {...workspace,editionId:hash,ordinal:offset,offset,limit},['workspace','editionId'],reads),
  tool('merchant_project_portfolio_archive_fields','Read complete native reporting field coverage across selected original editions.',
   {...workspace,editions:{type:'array',items:hash,minItems:1}},['workspace','editions'],reads),
  tool('merchant_project_portfolio_archive_table','Read one exact publication table with original offset, total and filter semantics.',
   {...workspace,cohortId:hash,publicationId:hash,table:text,offset,limit,filterColumn:text,filterText:text},
   ['workspace','cohortId','publicationId','table'],reads),
  tool('merchant_project_portfolio_archive_query','Run read-only SQL against the selected original published database.',
   {...workspace,cohortId:hash,publicationId:hash,sql:text,parameters:{},limit},['workspace','cohortId','publicationId','sql'],reads),
  tool('merchant_project_portfolio_upload','Upload the complete host-configured original file using its declared SHA-256.',
   {...workspace,file:alias,archive:{type:'boolean'}},['workspace','file'],writes),
  ...Object.entries(PROJECT_PORTFOLIO_AGENT_ACTIONS).map(([kind,description])=>tool(
   'merchant_project_portfolio_'+kind,description+' Use one stable requestId and the original native arguments; read that request after an interrupted reply.',
   {...workspace,requestId:hash,arguments:{type:'object',description:'Original '+kind+' arguments, as declared in the typed client and original operator guide.'}},
   ['workspace','requestId','arguments'],{...writes,
    destructive:['continue','abandon_set'].includes(kind),
    openWorld:['probe','prepare','prepare_adjustment','continue','adopt_detail','capture_target','abandon_set'].includes(kind)})),
  tool('merchant_project_portfolio_resume','Continue the same saved request and arguments; retryFailed explicitly permits its failed local action to retry.',
   {...workspace,requestId:hash,retryFailed:{type:'boolean'}},['workspace','requestId'],writes),
  tool('merchant_project_portfolio_wait','Read the same original request until it completes, fails, or the selected local wait expires.',
   {...workspace,requestId:hash,timeoutMs:{type:'integer',minimum:0},intervalMs:{type:'integer',minimum:50,maximum:60000}},
   ['workspace','requestId'],reads),
  tool('merchant_project_portfolio_pause','Pause the selected original deployment before its next native call.',
   {...workspace,deploymentId:hash,requestId:hash},['workspace','deploymentId','requestId'],writes),
  tool('merchant_project_portfolio_cancel_wait','Cancel this local agent wait while retaining the original saved native request.',
   {...workspace,requestId:hash},['workspace','requestId'],writes),
  tool('merchant_project_portfolio_download','Retain every byte of an original source/result blob or complete portable workspace.',
   {...workspace,sha256:hash,requestId:hash,expectedSha256:hash,expectedBytes:offset,filename:text},
   ['workspace','expectedSha256','expectedBytes'],reads),
  tool('merchant_project_portfolio_export_manifest','Read the complete manifest of one retained original result or customer file.',
   {exportId:hash},['exportId'],reads),
  tool('merchant_project_portfolio_export_file','Read a SHA-pinned original export through EOF; use nextOffset and the same readId, then release.',
   {exportId:hash,file:text,expectedManifestSha256:hash,expectedSha256:hash,readId:uuid,offset,
    limit:{type:'integer',minimum:1,maximum:65536}},
   ['exportId','expectedManifestSha256','expectedSha256'],reads),
  tool('merchant_project_portfolio_export_file_release','Release the original open export-file reader.',
   {exportId:hash,readId:uuid},['exportId','readId'],reads)
 ];
}
