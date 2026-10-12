// MIT. Complete original-workspace tool catalog; credentials and paths stay host-owned.
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const sha={type:'string',pattern:'^[a-f0-9]{64}$'};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const selected={workspace:alias,workspaceId:uuid};
const read={readOnly:true,idempotent:true};
export const COUCHDB_ACTION_TOOLS=Object.freeze([
  {
    "name": "merchant_couchdb_connection_save",
    "command": "connection.save",
    "description": "Retain a secret-free native connection profile and its complete selected document IDs."
  },
  {
    "name": "merchant_couchdb_capture",
    "command": "capture",
    "description": "Capture actual CouchDB pages, opaque sequences, winning document revisions, conflicts and selected revision-pinned attachments."
  },
  {
    "name": "merchant_couchdb_capture_fields",
    "command": "capture.fields",
    "description": "Inspect full original JSON pointers, value kinds, missing fields and original examples for the retained capture."
  },
  {
    "name": "merchant_couchdb_mapping_save",
    "command": "mapping.save",
    "description": "Retain typed queries against the exact capture SHA. Explicit review covers conflicts, missing documents, deletions and concurrent changes."
  },
  {
    "name": "merchant_couchdb_product_create",
    "command": "product.create",
    "description": "Create a retained publisher product from its original mapping."
  },
  {
    "name": "merchant_couchdb_product_select",
    "command": "product.select",
    "description": "Select a new mapping with the original product revision guard."
  },
  {
    "name": "merchant_couchdb_publisher_plan",
    "command": "publisher.plan",
    "description": "Save the complete original dataset extraction plan with exact mapping/source hash and bounded rows/bytes/order."
  },
  {
    "name": "merchant_couchdb_publisher_extract",
    "command": "publisher.extract",
    "description": "Run the original retained-source CSV extraction with this same UUID as the native publisher run."
  },
  {
    "name": "merchant_couchdb_publisher_review",
    "command": "publisher.review",
    "description": "Review the exact native candidate digest and original publication target revision."
  },
  {
    "name": "merchant_couchdb_publisher_publish",
    "command": "publisher.publish",
    "description": "Publish the exact candidate under its saved review through the original dataset writer."
  },
  {
    "name": "merchant_couchdb_publisher_recover",
    "command": "publisher.recover",
    "description": "Reconcile this original publisher run and its retained candidate/publication before continuing."
  },
  {
    "name": "merchant_couchdb_deployment_review",
    "command": "deployment.review",
    "description": "Review the complete source-backed published dataset and original merchant payment terms."
  },
  {
    "name": "merchant_couchdb_deployment_prepare",
    "command": "deployment.prepare",
    "description": "Prepare the same reviewed source package through original SF82 dataset release validation."
  },
  {
    "name": "merchant_couchdb_deployment_rebind",
    "command": "deployment.rebind",
    "description": "Bind a received retained package to this host's original dataset versions while preserving its prior source and execution identities."
  },
  {
    "name": "merchant_couchdb_release_stage",
    "command": "release.stage",
    "description": "Stage the verified prepared source in this workspace's original SF82 release store."
  },
  {
    "name": "merchant_couchdb_release_console_open",
    "command": "release.console.open",
    "description": "Open the original SF82 release console for current inspect/compare/activate/run/settlement."
  },
  {
    "name": "merchant_couchdb_release_console_close",
    "command": "release.console.close",
    "description": "Drain this workspace's original SF82 console."
  },
  {
    "name": "merchant_couchdb_release_command",
    "command": "release.command",
    "description": "Send a reviewed native SF82 command with its original generation and release identity; uncertain replies reopen observed state."
  },
  {
    "name": "merchant_couchdb_client_generate",
    "command": "client.generate",
    "description": "Generate an original public customer client from the selected native seller metadata."
  },
  {
    "name": "merchant_couchdb_client_adopt",
    "command": "client.adopt",
    "description": "Adopt the complete original public customer export against its reviewed file-set digest."
  },
  {
    "name": "merchant_couchdb_project_export",
    "command": "project.export",
    "description": "Retain the complete private workspace, publisher decisions, source, dataset versions and release packages in one original transfer ZIP."
  }
]);
export const COUCHDB_QUERIES=Object.freeze(['connections','captures','capture','document','compare','mappings','mapping','products','product',
  'publisher.status','publisher.inspect','publisher.target','deployment','release.status','release.compare','clients','client','client.manifest','client.file','client.file.close']);
export const COUCHDB_FILE_KINDS=Object.freeze(['document','attachment','capture','mapping','deployment','connection','export']);
export function couchdbWorkspaceTools(tool){
  return [
    tool('merchant_couchdb_workspaces','List configured original CouchDB owners and the selected host import/download/receiving aliases.',{},[],read),
    tool('merchant_couchdb_status','Read the original authenticated workspace identity, active operations and release owner.',selected,['workspace','workspaceId'],read),
    tool('merchant_couchdb_query','Read an original retained source, mapping, publication, release or customer view. Native pagination and field names remain unchanged.',
      {...selected,query:{type:'string',enum:COUCHDB_QUERIES},input:{type:'object'}},['workspace','workspaceId','query'],read),
    tool('merchant_couchdb_operations','Page compact saved operations without loading full original connection selections or results.',
      {...selected,after:uuid,limit:{type:'integer',minimum:1,maximum:100}},['workspace','workspaceId'],read),
    tool('merchant_couchdb_operation','Reopen one original complete request, result and publication/receiving outcome.',
      {...selected,operationId:uuid,includeResult:{type:'boolean'}},['workspace','workspaceId','operationId'],read),
    ...COUCHDB_ACTION_TOOLS.map(action=>tool(action.name,action.description+' Retain the same operationId and unchanged complete native input on retry.',
      {...selected,operationId:uuid,input:{type:'object'}},['workspace','workspaceId','operationId','input'],
      {idempotent:true,...(action.command==='capture'?{openWorld:true}:{})})),
    tool('merchant_couchdb_resume','Resume the same retained original request after interruption; no replacement source or UUID is introduced.',
      {...selected,operationId:uuid},['workspace','workspaceId','operationId'],{idempotent:true,openWorld:true}),
    tool('merchant_couchdb_cancel','Interrupt the selected running operation and retain its original request/native progress for continuation.',
      {...selected,operationId:uuid},['workspace','workspaceId','operationId'],{idempotent:true}),
    tool('merchant_couchdb_import','Import a host-declared original connection, capture or customer package. The original configured source SHA is mandatory.',
      {...selected,source:alias,operationId:uuid,label:{type:'string',maxLength:128}},['workspace','workspaceId','source','operationId'],{idempotent:true}),
    tool('merchant_couchdb_file_metadata','Read the exact original downloadable file name, byte count and SHA before transfer.',
      {...selected,kind:{type:'string',enum:COUCHDB_FILE_KINDS},input:{type:'object'}},['workspace','workspaceId','kind','input'],read),
    tool('merchant_couchdb_file','Read original bytes in bounded base64 chunks. Continue readId/offset or reopen the same SHA after restart.',
      {...selected,kind:{type:'string',enum:COUCHDB_FILE_KINDS},input:{type:'object'},expectedSha256:sha,readId:uuid,
        offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608}},
      ['workspace','workspaceId','kind','input','expectedSha256'],read),
    tool('merchant_couchdb_file_release','Close the original process-local file descriptor while preserving the complete source export.',
      {...selected,readId:uuid},['workspace','workspaceId','readId'],{idempotent:true}),
    tool('merchant_couchdb_download','Download a complete original file into the declared host delivery alias. The same UUID resumes its retained exact byte prefix.',
      {...selected,kind:{type:'string',enum:COUCHDB_FILE_KINDS},input:{type:'object'},delivery:alias,operationId:uuid,expectedSha256:sha,
        expectedBytes:{type:'integer',minimum:0,maximum:8606711808}},['workspace','workspaceId','kind','input','delivery','operationId','expectedSha256','expectedBytes'],{idempotent:true}),
    tool('merchant_couchdb_receive','Receive a complete original workspace ZIP from the selected downloaded artifact into the declared fresh host receiver. Preserve all original native identities.',
      {...selected,delivery:alias,downloadId:uuid,receiver:alias,expectedSha256:sha,operationId:uuid},
      ['workspace','workspaceId','delivery','downloadId','receiver','expectedSha256','operationId'],{idempotent:true}),
  ];
}
