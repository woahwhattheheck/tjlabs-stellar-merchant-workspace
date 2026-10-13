// Apache-2.0. Original source-selected ODR workspace operations.
const workspace={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'},uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'},identifier={type:'string',minLength:1,maxLength:200},digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const read={readOnly:true,idempotent:true},selected={workspace},named={workspace,requestId:uuid};
export function odrWorkspaceTools(tool){return[
tool('merchant_odr_status','Inspect the complete original workspace, selected immutable application and native installation.',selected,['workspace'],read),
tool('merchant_odr_source','Verify the complete host-selected original APPLICATION_SOURCE.json.',selected,['workspace'],read),
tool('merchant_odr_prepare','Prepare the complete selected original source and optional handover under one retained request.',named,['workspace','requestId'],{idempotent:true}),
tool('merchant_odr_adopt_source','Adopt a complete source successor while preserving all original workspace history, drafts and source lineage.',named,['workspace','requestId'],{idempotent:true}),
tool('merchant_odr_snapshot','Export the whole installation, immutable source editions, original handover and receiving lineage.',named,['workspace','requestId'],{idempotent:true}),
tool('merchant_odr_receive','Independently receive the selected whole installation ZIP with its original workspace identity.',named,['workspace','requestId'],{idempotent:true}),
tool('merchant_odr_state','Read the complete original retained workspace state.',selected,['workspace'],read),
tool('merchant_odr_record','Read one actual current original record.',{...selected,kind:identifier,recordId:identifier},['workspace','kind','recordId'],read),
tool('merchant_odr_history','Read the complete original revision history of a record.',{...selected,kind:identifier,recordId:identifier},['workspace','kind','recordId'],read),
tool('merchant_odr_handover','Read the whole retained original handover including editable drafts and selected source.',selected,['workspace'],read),
tool('merchant_odr_compare','Compare selected original Alpha measurements through the original domain method.',{...selected,measurementIds:{type:'array',items:identifier,uniqueItems:true,minItems:1,maxItems:50},baselineId:identifier},['workspace','measurementIds','baselineId'],read),
tool('merchant_odr_receive_workspace','Receive the host-selected complete onward handover using its original expected digest; preserve every current record and history prefix.',{...named,expectedDigest:digest},['workspace','requestId','expectedDigest'],{idempotent:true}),
tool('merchant_odr_export','Export the complete original workspace handover, editable report or selected application source.',{...named,kind:{type:'string',enum:['workspace','report','application']}},['workspace','requestId','kind'],{idempotent:true}),
tool('merchant_odr_request','Receive a retained original request/result, including a sender installation lineage.',{...selected,requestId:identifier,originInstallationId:uuid},['workspace','requestId'],read),
tool('merchant_odr_commands','Describe the actual inherited-lease service command and its private ready-file path.',{...selected,port:{type:'integer',minimum:0,maximum:65535}},['workspace'],read)
];}
