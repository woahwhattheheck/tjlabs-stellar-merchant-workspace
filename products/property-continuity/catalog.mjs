// MIT. Complete authenticated tool declarations; no native owner is opened here.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},uuid={type:'string',format:'uuid'},hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const scoped={workspace:alias,workspaceId:uuid,workspaceDirectory:{type:'string',description:'Exact original or receiving physical directory.'}};
const required=['workspace','workspaceId','workspaceDirectory'],read={readOnly:true,idempotent:true};
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}};
export function propertyContinuityTools(tool){return [
 tool('merchant_property_continuity_workspaces','List configured owner identities and complete host-selected file aliases.',{},[],read),
 tool('merchant_property_continuity_branches','List actual open physical branches and current selection without changing it.',{workspace:alias},['workspace'],read),
 tool('merchant_property_continuity_open','Explicitly select one already known physical branch. Portable IDs alone do not select a receiver.',scoped,required,{}),
 tool('merchant_property_continuity_state','Read complete original state, current view and revision from the selected physical branch.',scoped,required,read),
 tool('merchant_property_continuity_history','Read the original complete command/result page; follow nextOffset to finish.',{...scoped,...page},required,read),
 tool('merchant_property_continuity_request','Read the saved first result and full original envelope for an unchanged request UUID.',{...scoped,requestId:uuid},[...required,'requestId'],read),
 tool('merchant_property_continuity_source_rows','Page complete original source rows with their exact numberTokens.',{...scoped,sourceId:uuid,...page},[...required,'sourceId'],read),
 tool('merchant_property_continuity_report_rows','Page the full original reconciliation, including UNVERIFIED population and exact-number metadata.',{...scoped,reconciliationId:uuid,...page,status:{type:'string',enum:['MATCHED','MISSING','EXTRA','CONFLICT','DUPLICATE','UNVERIFIED']}},[...required,'reconciliationId'],read),
 tool('merchant_property_continuity_findings','Page every original finding; keep BLOCKING/REVIEW meaning and complete numberTokens.',{...scoped,reconciliationId:uuid,...page,severity:{type:'string',enum:['BLOCKING','REVIEW']}},[...required,'reconciliationId'],read),
 tool('merchant_property_continuity_command','Apply the complete original domain envelope using its saved UUID, actor, time, body and expected revision. No automatic mutation retry.',
  {...scoped,command:{type:'object',description:'Original {requestId,kind,actor:{id,name},at,body}; retain it unchanged across uncertain returns.'},expectedRevision:{type:'integer',minimum:0}},[...required,'command','expectedRevision'],{}),
 tool('merchant_property_continuity_upload','Upload one complete host-declared blob or receiving archive; actual bytes and SHA must match the original alias.',
  {...scoped,kind:{type:'string',enum:['blob','archive']},fileAlias:alias,bytes:{type:'integer',minimum:0,maximum:402653184},sha256:hash},[...required,'kind','fileAlias','bytes','sha256'],{}),
 tool('merchant_property_continuity_export','Freeze the original selected revision under one publication UUID and retain the whole returned archive descriptor.',
  {...scoped,publicationId:uuid,revision:{type:'integer',minimum:0}},[...required,'publicationId','revision'],{}),
 tool('merchant_property_continuity_receive','Receive the already uploaded complete archive into its named independent branch. Repeating the same operation preserves legitimate later receiver edits.',
  {...scoped,operationId:uuid,sha256:hash,bytes:{type:'integer',minimum:0,maximum:402653184},name:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'}},[...required,'operationId','sha256','bytes','name'],{}),
 tool('merchant_property_continuity_file_read','Read every byte of a complete original blob, frozen export or full JSON/HTML/CSV report using the existing bounded retained-file reader. Follow nextOffset and retain returned file SHA.',
  {...scoped,selection:{type:'object',description:'{kind:"blob"|"archive"|"report",id,format?}; archive also requires expectedSha256 and expectedBytes in selection.'},expectedSha256:hash,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:196608},readId:{type:'string'}},[...required,'selection'],read),
 tool('merchant_property_continuity_file_release','Close only the selected borrowed file reader.',{...scoped,readId:{type:'string'}},[...required,'readId'],read)
];}
