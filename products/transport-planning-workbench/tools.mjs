// SPDX-License-Identifier: MIT
// These operations preserve the original transportation workspace, evaluator and stable command journal.
import {MAX_RETAINED_CHUNK_BYTES} from '../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
export const COMMANDS=Object.freeze(['configure','document_add','dataset_import','service_save','service_review','metric_publish','scenario_save','scenario_publish','action_save','plan_publish','report_publish','delivery_record']);
export const SOURCE_KINDS=Object.freeze(['trip','coupon','cost','observation']);
export const ARTIFACT_KINDS=Object.freeze(['source','document','edition','guide','recovery','application']);
export function transportPlanningTools(tool){
 const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},sha={type:'string',pattern:'^[a-f0-9]{64}$'},id={type:'string',minLength:1,maxLength:500},requestId={type:'string',minLength:1,maxLength:150},object={type:'object'},offset={type:'integer',minimum:0},write={readOnly:false,idempotent:false};
 const t=(name,description,properties={},required=['workspace'],annotations={readOnly:true,idempotent:true})=>tool('merchant_transport_planning_'+name,description,{workspace:alias,...properties},required,annotations);
 const input={sourceInput:alias,expectedSourceSha256:sha},full={fileId:sha,expectedSha256:sha};
 return[
 t('connections','List declared original transportation installations and complete input identities without starting the application.',{},[]),
 t('connect','Attach to the selected managed original listener and source authority.',{expectedLaunchId:id},['workspace'],write),
 t('disconnect','Close this attached client and retained range readers for the selected launch; Applications retains the server lifetime.',{launchId:id},['workspace','launchId'],write),
 t('info','Retain complete original installation, runtime and workspace identity.'),
 t('browser','Return the original private operator opening route without placing its capability in retained artifacts.'),
 t('state','Retain the original workspace overview, configuration, record selections and counts. Complete histories and native commands remain in the original recovery archive.'),
 t('catalogue','Retain the five original service-rule, source, metric, site and published-observation catalogues. Public observations do not establish current operating results.'),
 t('record','Retain a complete original record, its history metadata and one dataset row page; follow total/offset using limit at most1000.',{recordId:id,offset,limit:{type:'integer',minimum:1,maximum:1000}},['workspace','recordId']),
 t('preview','Preview original CSV mapping through the unchanged intake, preserving its documented40-row/100-error preview limits. This does not save a source edition.',{csv:{type:'string'},kind:{enum:SOURCE_KINDS},mapping:object,defaults:object},['workspace','csv','kind']),
 t('preview_input','Preview complete host-declared CSV bytes with the original mapping/defaults and retain the complete selected input.',{...input,kind:{enum:SOURCE_KINDS},mapping:object,defaults:object},['workspace','sourceInput','expectedSourceSha256','kind']),
 t('command','Dispatch one of the12 original commands with exact stable ID, full args and the host-selected named staff profile. Native transactions own validation, revisions and exact replay.',{requestId,command:{enum:COMMANDS},payload:object},['workspace','requestId','command','payload'],write),
 t('command_input','Dispatch a complete host-declared JSON object {id?,command,args?}; its optional id must equal the selected requestId. Preserve full source and native request before dispatch.',{requestId,...input},['workspace','requestId','sourceInput','expectedSourceSha256'],write),
 t('import_csv','Import complete original host-declared CSV bytes using the native dataset_import command. Payload retains title, family, predecessor, kind, mapping/defaults and source notes; csv is supplied from the selected file.',{requestId,...input,payload:object},['workspace','requestId','sourceInput','expectedSourceSha256','payload'],write),
 t('add_document','Add complete host-declared original document bytes with their original filename and MIME. Payload supplies title and any original URL/retrieval/locator fields; bytes are supplied from the selected file.',{requestId,...input,payload:object},['workspace','requestId','sourceInput','expectedSourceSha256','payload'],write),
 t('receive','Receive a complete original application or workspace recovery archive into a declared independent destination through the original reader. Preserve an uncertain receive for exact destination inspection.',{requestId,...input,destination:alias,kind:{enum:['application','recovery']}},['workspace','requestId','sourceInput','expectedSourceSha256','destination','kind'],write),
 t('artifact','Retain complete original source/document bytes, published edition, operating guide, full recovery or full installed application ZIP. Archive creation follows the original snapshot at dispatch, without invented revision CAS.',{kind:{enum:ARTIFACT_KINDS},recordId:id,format:{enum:['zip','html','json','csv']},expectedSha256:sha,expectedBytes:{type:'integer',minimum:0},filename:{type:'string',minLength:1,maxLength:240}},['workspace','kind']),
 t('files','Page complete retained descriptors authorized for this original workspace, named operator and source edition.',{offset,limit:{type:'integer',minimum:1,maximum:100}}),
 t('file','Read exact retained bytes through the maintained range reader; retain readId and continue offset through EOF.',{...full,readId:id,offset,limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['workspace','fileId','expectedSha256']),
 t('file_release','Release the selected original retained range reader.',{readId:id},['workspace','readId'],write),
 t('file_inspect','Navigate a retained JSON pointer/page within32MiB; larger original artifacts remain completely readable by byte ranges.',{...full,pointer:{type:'string',maxLength:4000},offset,limit:{type:'integer',minimum:1,maximum:50}},['workspace','fileId','expectedSha256']),
 t('requests','Page full selected host requests and all observed native HTTP responses for this same authority. HTTP_OBSERVED is transport evidence; only the original transactional command journal owns mutation replay.',{offset,limit:{type:'integer',minimum:1,maximum:100}})
 ];
}
