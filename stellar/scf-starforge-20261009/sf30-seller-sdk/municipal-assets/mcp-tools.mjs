// MIT. Tools operate the original managed application and complete retained-file transport.
import { MAX_RETAINED_CHUNK_BYTES } from '../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
import { KINDS, INPUT_KINDS, FORMATS, PREFIX } from './agent-contracts.mjs';
const str=(maxLength=4000,minLength=1)=>({type:'string',minLength,maxLength});
const en=values=>({type:'string',enum:values});
const obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const id=str(100),rev={type:'integer',minimum:0},bool={type:'boolean'},map={type:'object',additionalProperties:str(1000,0)};
const workspace={workspace:alias},project={...workspace,projectId:id},observed={...project,expectedRevision:rev};
const change={...observed,requestId:id},paging={offset:rev,limit:{type:'integer',minimum:1,maximum:200}};
const input={input:alias,expectedSha256:hash},read={readOnly:true,idempotent:true},write={idempotent:true};
export const municipalFileSelection={
  kind:en(['project','report','export','backup','refresh','maximo-capture','maximo-load','maximo-result','refresh-status','maximo-status','operation']),
  projectId:id,expectedRevision:rev,releaseId:id,operationId:id,
  name:en(['capture','source_archive','report','handoff','workspace','geometry','result']),requestId:id
};
export const actionSchemas={
  mapping:obj({kind:en(KINDS),mapping:obj({fields:map,status_aliases:map,trim_ids:bool},['fields'])},['kind','mapping']),
  select_input:obj({kind:en(INPUT_KINDS),input_id:{...id,type:['string','null']},reason:str()},['kind','input_id','reason']),
  settings:obj({settings:obj({
    comparison_fields:{type:'array',minItems:1,uniqueItems:true,items:en(['label','status','parent_id','location_id','geometry','updated_at','attributes'])},
    transitions:{type:'object',additionalProperties:{type:'array',items:str(200)}},
    attestation:obj({supplier_reviewer:str(1000,0),city_data_authorization_ref:str(1000,0),vendor_sow_ref:str(1000,0)},['supplier_reviewer','city_data_authorization_ref','vendor_sow_ref']),
    expected_source_rows:{type:['integer','null'],minimum:1},expected_target_rows:{type:['integer','null'],minimum:1},
    expected_correlation_ids:{type:'array',items:str(1000),uniqueItems:true}
  },['comparison_fields','transitions','attestation','expected_source_rows','expected_target_rows'])},['settings']),
  review:obj({finding_id:id,decision:en(['repair_requested','reviewed','keep_separate']),note:str()},['finding_id','decision','note']),
  exclude:obj({asset_id:str(10000),reason:str(),remove:bool},['asset_id','reason']),
  repair:obj({kind:en(KINDS),row_number:{type:'integer',minimum:1},field:str(100),value:str(100000,0),reason:str()},['kind','row_number','field','value','reason']),
  request_status:obj({work_order_id:str(10000),desired_status:str(200),note:str()},['work_order_id','desired_status','note']),
  apply_returns:obj({}),
  withdraw_change:obj({change_id:id,reason:str()},['change_id','reason']),
  native_check:obj({}),
  release:obj({note:str()},['note']),
  restore_revision:obj({target_revision:rev,reason:str()},['target_revision','reason'])
};
export function municipalAssetTools(tool) {
  const make=(name,description,properties,required=[],annotations=read)=>tool(PREFIX+name,description,properties,required,annotations);
  const actions=Object.entries(actionSchemas).map(([name,schema])=>make(name,{
    mapping:'Confirm explicit original dataset fields, status aliases and identifier trimming.',
    select_input:'Select an existing original dataset edition and retain the stated reason.',
    settings:'Save complete comparison fields, allowed work-order transitions, engagement references and expected counts.',
    review:'Record a named disposition of one current original finding.',
    exclude:'Add or remove an explicitly explained original asset exclusion.',
    repair:'Prepare a source-bound correction proposal for one original input row and field.',
    request_status:'Prepare a work-order transition against its exact original native revision.',
    apply_returns:'Apply the selected complete original returned work-order results once.',
    withdraw_change:'Withdraw an original pending work-order request with an explanation.',
    native_check:'Run the original native relationship and round-trip checker against selected inputs and mappings.',
    release:'Retain a named internal handoff of the current checked project.',
    restore_revision:'Restore an original project state as a new revision while preserving subsequent history.'
  }[name],{...change,...schema.properties},['workspace','projectId','expectedRevision','requestId',...schema.required],write));
  return [
    make('workspaces','List configured original managed workspace aliases and complete host input identities.',{},[]),
    make('status','Read the authenticated instance, stable workspace and selected source identity plus original project summaries.',workspace,['workspace']),
    make('project','Read original project metadata, counts, selected input IDs and collection sizes at one observed revision.',observed,['workspace','projectId','expectedRevision']),
    make('project_section','Page original findings, input editions, mappings, decisions, proposals, changes, exclusions, settings, release history or recent native checks.',{...observed,section:en(['findings','inputs','mappings','decisions','repairs','changes','exclusions','work_order_overrides','history','releases','native_runs','settings']),query:str(2000,0),...paging},['workspace','projectId','expectedRevision','section']),
    make('records','Search and page original mapped records in one selected dataset and exact project revision.',{...observed,kind:en(KINDS),query:str(2000,0),page:rev,pageSize:{type:'integer',minimum:1,maximum:200},recordId:str(10000)},['workspace','projectId','expectedRevision','kind']),
    make('input','Inspect the complete configured host input identity and actual file SHA-256.',{...workspace,input:alias},['workspace','input']),
    make('create_project','Create an original project with its named mode and durable request identity.',{...workspace,requestId:id,title:str(150),mode:en(['development','vendor-authorized','public-reference'])},['workspace','requestId','title','mode'],write),
    make('import_input','Import one complete original host-selected dataset; preserve its exact bytes, native operation and expected project revision.',{...change,...input},['workspace','projectId','expectedRevision','requestId','input','expectedSha256'],write),
    ...actions,
    make('refresh_status','Page current original public-source refresh operations.',{...project,...paging},['workspace','projectId']),
    make('refresh_start','Start a complete original source and geometry refresh against the observed project revision.',{...change,requestId:str(64),pageWidth:{type:'integer',minimum:1,maximum:2000},geometryWidth:{type:'integer',minimum:1,maximum:2000},sourceOperation:str(64)},['workspace','projectId','expectedRevision','requestId'],write),
    make('refresh_resume','Continue the original saved refresh as its original actor; retain a distinct durable client request for this resume.',{...project,requestId:id,refreshOperation:str(64)},['workspace','projectId','requestId','refreshOperation'],write),
    make('maximo_status','Page configured target profiles, original capture operations or compact load/result summaries.',{...project,section:en(['profiles','captures','loads']),...paging},['workspace','projectId','section']),
    make('maximo_start','Start the original complete schema-bound Maximo target read with the configured tenant profile.',{...change,profileId:id},['workspace','projectId','expectedRevision','requestId','profileId'],write),
    make('maximo_resume','Continue an original saved target capture as its original actor.',{...project,requestId:id,captureOperation:id},['workspace','projectId','requestId','captureOperation'],write),
    make('maximo_receive','Receive a complete original target capture into this same project at its observed revision.',{...change,captureOperation:id},['workspace','projectId','expectedRevision','requestId','captureOperation'],write),
    make('maximo_prepare_load','Prepare the original Maximo load from the retained target capture and explicit field mapping.',{...change,captureOperation:id,mapping:{type:'object',additionalProperties:true}},['workspace','projectId','expectedRevision','requestId','captureOperation','mapping'],write),
    make('maximo_receive_load','Receive the complete original returned target envelope from a pinned host file and retain its original wire bytes.',{...project,requestId:id,loadId:id,...input},['workspace','projectId','requestId','loadId','input','expectedSha256'],write),
    make('maximo_result','Page every original target load row, its actual outcome and original retained result selection.',{...project,operationId:id,offset:rev,limit:{type:'integer',minimum:1,maximum:250}},['workspace','projectId','operationId']),
    make('operation','Inspect the original durable client request, native response metadata and continuation state.',{...workspace,requestId:id},['workspace','requestId']),
    make('replay_operation','Continue exactly the retained original request without rebuilding its input or changing its native operation/revision.',{...workspace,requestId:id},['workspace','requestId'],write),
    make('file_read','Read the complete original project JSON, HTML report, release ZIP, SQLite backup, refresh artifact, Maximo file or request journal through a retained byte snapshot.',{...workspace,...municipalFileSelection,readId:str(128),expectedSha256:hash,offset:rev,limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}},['workspace','kind']),
    make('file_release','Release an original retained download after completion or cancellation.',{...workspace,readId:str(128)},['workspace','readId'],write)
  ];
}
