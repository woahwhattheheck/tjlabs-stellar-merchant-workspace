// MIT. The complete original preparation workflow through typed merchant tools.
import {MAX_RETAINED_CHUNK_BYTES} from '../../../../stellar-forge/mcp-merchant-operator/retained-file-contracts.mjs';
const text=(max,min=1)=>({type:'string',minLength:min,maxLength:max});
const integer=(min=0,max=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:min,maximum:max});
const choice=values=>({type:'string',enum:values});
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'};
const sourceId={type:'string',pattern:'^s_[a-f0-9]{64}$'};
const recipeId={type:'string',pattern:'^q_[a-f0-9]{32}$'};
const runId={type:'string',pattern:'^r_[a-f0-9]{32}$'};
const operationId={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'};
const page={offset:integer(),limit:integer(1,200)};
const read={readOnly:true,idempotent:true};
export function preparationWorkspaceTools(tool){
  const scoped=properties=>({workspace:alias,...properties});
  return [
    tool('merchant_preparation_status','List configured original workspaces and declared inputs/destinations, or inspect a connected workspace and its coherent state SHA.',
      scoped({}),[],read),
    tool('merchant_preparation_connect','Attach to the exact Applications-owned Python listener and its original workspace identity.',
      scoped({expectedInstanceId:uuid}),['workspace'],{idempotent:true}),
    tool('merchant_preparation_disconnect','Detach this merchant client and drain its file handles. Original Applications jobs continue.',
      scoped({instanceId:uuid}),['workspace','instanceId'],{idempotent:true}),
    tool('merchant_preparation_browser','Open the current private browser link for this same original listener.',
      scoped({}),['workspace'],read),
    tool('merchant_preparation_records','Page complete retained source, recipe, run or review records. Keep the returned state SHA across pages.',
      scoped({collection:choice(['sources','recipes','runs','reviews']),...page,expectedStateSha256:hash}),
      ['workspace','collection'],read),
    tool('merchant_preparation_source_page','Read original retained source cells with exact text and null values.',
      scoped({sourceId,...page}),['workspace','sourceId'],read),
    tool('merchant_preparation_result_page','Read complete result editions in original row pages; use the full result delivery for large cells or all bytes.',
      scoped({runId,...page}),['workspace','runId'],read),
    tool('merchant_preparation_import_source','Import a complete declared CSV or JSONL file at its reviewed SHA. The original engine retains the bytes before parsing.',
      scoped({sourceInput:alias,expectedSourceSha256:hash,alias:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,47}$'}}),
      ['workspace','sourceInput','expectedSourceSha256','alias'],{idempotent:true}),
    tool('merchant_preparation_save_recipe','Save an original SQL recipe edition over selected retained source IDs. Existing recipes require their current expected revision.',
      scoped({label:text(128),sql:text(100000),bindings:{type:'object',additionalProperties:sourceId,minProperties:1,maxProperties:256},
        parameters:{type:'object',additionalProperties:{type:['string','number','boolean','null']}},
        id:recipeId,expected_revision:integer(),note:text(10000,0)}),
      ['workspace','label','sql','bindings'],{}),
    tool('merchant_preparation_run','Enqueue and start the original selected recipe edition. Retain the returned run ID before inspecting its progress.',
      scoped({recipeId,revision:integer(1)}),['workspace','recipeId'],{}),
    tool('merchant_preparation_start','Start the existing queued native run without replacing its saved recipe or input editions.',
      scoped({runId}),['workspace','runId'],{idempotent:true}),
    tool('merchant_preparation_rerun','Create a new attempt from an original run’s frozen recipe and source editions.',
      scoped({runId}),['workspace','runId'],{}),
    tool('merchant_preparation_cancel','Request cooperative cancellation of the selected original SQL run.',
      scoped({runId}),['workspace','runId'],{idempotent:true}),
    tool('merchant_preparation_recover','Let the original engine mark abandoned running jobs interrupted once no original writer is active.',
      scoped({}),['workspace'],{idempotent:true}),
    tool('merchant_preparation_review','Append an accept, revise or withdraw decision to the exact result edition and expected review revision.',
      scoped({runId,decision:choice(['accept','revise','withdraw']),reviewer:text(128),note:text(10000,0),expectedRevision:integer()}),
      ['workspace','runId','decision','reviewer','note'],{}),
    tool('merchant_preparation_export','Create a complete durable project, merchant dataset, report or result delivery from the reviewed original state. Reuse the same operation ID and arguments to reopen its exact completed bytes.',
      scoped({operationId,kind:choice(['project','merchant','report','result']),runId,
        file:choice(['result.csv','result.jsonl','schema.json']),label:text(128),expectedStateSha256:hash}),
      ['workspace','operationId','kind','expectedStateSha256'],{idempotent:true}),
    tool('merchant_preparation_exports','Page completed native deliveries after Applications stops. Retain inventorySha256 across pages.',
      scoped({...page,expectedInventorySha256:hash}),['workspace'],read),
    tool('merchant_preparation_file','Read complete immutable delivery bytes in SHA-bound chunks. After restart, omit the old readId and keep the original SHA and nextOffset.',
      scoped({fileId:hash,readId:uuid,expectedSha256:hash,offset:integer(),limit:integer(1,MAX_RETAINED_CHUNK_BYTES)}),
      ['workspace','fileId'],read),
    tool('merchant_preparation_file_release','Release an unfinished native file reader while retaining the complete original delivery.',
      scoped({readId:uuid}),['workspace','readId'],{idempotent:true}),
    tool('merchant_preparation_receive','Receive a complete project archive from exactly one declared sourceInput or retained fileId. The original transfer engine verifies every file and reconstructs independently editable native tables.',
      scoped({sourceInput:alias,fileId:hash,expectedSourceSha256:hash,destination:alias}),
      ['workspace','expectedSourceSha256','destination'],{idempotent:true}),
    tool('merchant_preparation_received','Inspect the complete received customer project, current native counts and saved archive identity before opening it in Applications.',
      scoped({destination:alias}),['workspace','destination'],read),
  ];
}
