// MIT. Original scientific selections, reviews and complete source-owned receiving.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'};
const object={type:'object'},workspace={workspace:alias};
const read={readOnly:true,idempotent:true},write={idempotent:true};
export const NETCDF_QUERY_ACTIONS=['overview','sources','source','variables','variable','preview','selections','selection','runs','run.get','reviews','object.describe'];
export function netCDFTools(tool){return [
  tool('merchant_netcdf_workspaces','List configured NetCDF workspace and complete input aliases. Host paths and keys remain in configuration.',{},[],read),
  tool('merchant_netcdf_query','Read source-native groups, dimensions, types and metadata; inspect exact original-index selections, saved results and reviews. Collection queries return explicit complete pagination. preview raw values preserve native tags; decode_cf adds selected CF context.',
    {...workspace,action:{type:'string',enum:NETCDF_QUERY_ACTIONS},input:object,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:250}},['workspace','action'],read),
  tool('merchant_netcdf_import','Retain one complete declared original NetCDF input at its exact SHA-256. Keep id for exact lost-response recovery. No caller-supplied host path is accepted.',
    {...workspace,id,input:alias,expectedSha256:hash,name:{type:'string',maxLength:1000},reference:{type:'string',maxLength:16000}},['workspace','id','input','expectedSha256'],write),
  tool('merchant_netcdf_selection','Save explicit original variable paths and dimension slices with title, decode_cf and include_coordinates choices. Retain source_id and expected_revision in input; id names the original mutation.',
    {...workspace,id,input:object},['workspace','id','input'],write),
  tool('merchant_netcdf_run','Materialize the complete immutable selection as native NetCDF, every JSONL/CSV value, original manifest and readable report. Retain the same id to recover its original files.',
    {...workspace,id,selectionId:id},['workspace','id','selectionId'],write),
  tool('merchant_netcdf_review','Retain a source-bound result review with reviewer, notes, expected_revision and explicit accepted, needs-work, observed or excluded disposition.',
    {...workspace,id,input:object},['workspace','id','input'],write),
  tool('merchant_netcdf_report','Select the complete retained scientific result report. Receive its entire SHA-addressed bytes through file_read.',
    {...workspace,runId:id},['workspace','runId'],read),
  tool('merchant_netcdf_export','Export the complete independently editable scientific project through the native writer, then receive and verify every archive byte into the declared private export directory. Retain the same id for the same completed handover.',
    {...workspace,id},['workspace','id'],write),
  tool('merchant_netcdf_receive','Receive a whole declared original project archive into a new named directory under the configured receiving parent. Verify its complete SHA and native member manifest; keep its original project and source identities.',
    {...workspace,input:alias,expectedSha256:hash,name:id},['workspace','input','expectedSha256','name'],write),
  tool('merchant_netcdf_file_read','Receive the complete original source, result, report or project archive at the selected SHA and exact offset. Follow next_offset through EOF and verify the whole digest.',
    {...workspace,sha256:hash,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:262144}},['workspace','sha256','offset','limit'],read),
];}
