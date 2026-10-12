// MIT. Lazy provider's declared operations; complete files use original chunk reads.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'},object={type:'object'},text={type:'string',minLength:1};
const workspace={workspace:alias},read={readOnly:true,idempotent:true},change={idempotent:true};
export const DBT_QUERY_ACTIONS=['status','artifacts','artifact','editions','edition','nodes','node','lineage','compare','reviews','review','object.describe'];
export function dbtProjectTools(tool){return[
  tool('merchant_dbt_projects','List the host-configured original dbt projects and source-file aliases.',{},[],read),
  tool('merchant_dbt_query','Inspect original editions, paged resources, exact SQL/context, lineage, comparisons and saved reviews. nodes uses edition, offset and limit; follow next_offset. Artifact observations retain their own invocation IDs.',{...workspace,action:{type:'string',enum:DBT_QUERY_ACTIONS},input:object},['workspace','action'],read),
  tool('merchant_dbt_input','Read metadata and current SHA-256 of one complete host-selected artifact or project archive.',{...workspace,input:alias},['workspace','input'],read),
  tool('merchant_dbt_import','Retain and index one complete host-selected original artifact. Unknown schemas remain exact opaque source files.',{...workspace,input:alias,expectedSha256:hash},['workspace','input','expectedSha256'],change),
  tool('merchant_dbt_edition','Create an immutable explicit artifact edition. Include title, manifest, optional catalog, runs and freshness arrays in input; id is its stable request ID.',{...workspace,id,input:object},['workspace','id','input'],change),
  tool('merchant_dbt_review','Save the complete selected resource review with original expected_revision, baseline, selection, decisions, reviewer and note. Reuse id after a lost response.',{...workspace,id,input:object},['workspace','id','input'],change),
  tool('merchant_dbt_bind_result','Bind complete host-selected result, original SQL and provenance to an existing dbt resource. These are explicit original files, not a new SQL execution.',{...workspace,id,edition:hash,uid:text,result:alias,query:alias,provenance:alias,sourceKind:text,originalRequestId:text},['workspace','id','edition','uid','result','query','provenance','sourceKind','originalRequestId'],change),
  tool('merchant_dbt_report','Retain a complete JSON, CSV or HTML project report. Receive every byte with the returned digest and original chunk read.',{...workspace,edition:hash,review:hash,format:{type:'string',enum:['json','csv','html']}},['workspace','edition','format'],change),
  tool('merchant_dbt_export','Create a complete editable source/project ZIP under the host-selected exports directory. Reuse id for the same completed output.',{...workspace,id},['workspace','id'],change),
  tool('merchant_dbt_receive','Receive the exact host-selected project ZIP into a new named directory under the host-selected receiving root. Repeating the same archive and name recovers the same editable project.',{...workspace,input:alias,expectedSha256:hash,name:id},['workspace','input','expectedSha256','name'],change),
  tool('merchant_dbt_file_read','Read complete retained source or report bytes by SHA-256 and offset. Continue until next_offset is null; verify the full original digest after assembly.',{...workspace,sha256:hash,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:65536}},['workspace','sha256'],read)
];}
