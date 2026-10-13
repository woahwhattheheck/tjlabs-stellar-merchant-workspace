// Apache-2.0. Complete original partner applications in the Merchant tool catalogue.
const workspace={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const identifier={type:'string',minLength:1,maxLength:160};
const read={readOnly:true,idempotent:true},selected={workspace},named={workspace,requestId:uuid};
export function partnerWorkspaceTools(tool){return[
  tool('merchant_partner_status','Inspect the original installed mobility or education workspace, source editions and database.',selected,['workspace'],read),
  tool('merchant_partner_source','Verify the complete host-selected original application source manifest.',selected,['workspace'],read),
  tool('merchant_partner_prepare','Prepare the selected whole application and original workspace archive, or create its original empty workspace.',named,['workspace','requestId'],{idempotent:true}),
  tool('merchant_partner_adopt_source','Adopt a complete original source successor, preserving the same workspace, old editions and lifecycle history.',named,['workspace','requestId'],{idempotent:true}),
  tool('merchant_partner_snapshot','Export all source editions, the original complete workspace archive and lifecycle lineage in one installation ZIP.',named,['workspace','requestId'],{idempotent:true}),
  tool('merchant_partner_receive','Independently receive the whole host-selected installation ZIP, preserving its original workspace and source lineage.',named,['workspace','requestId'],{idempotent:true}),
  tool('merchant_partner_state','Read the original application state and its actual source and review records.',selected,['workspace'],read),
  tool('merchant_partner_record','Read the exact current original record and revision.',{...selected,kind:identifier,recordId:identifier},['workspace','kind','recordId'],read),
  tool('merchant_partner_history','Read every retained original revision and event for a record.',{...selected,kind:identifier,recordId:identifier},['workspace','kind','recordId'],read),
  tool('merchant_partner_evidence','Read one original retained source and its verified complete local file identity.',{...selected,sourceId:identifier},['workspace','sourceId'],read),
  tool('merchant_partner_compare','Compare selected original mobility imports through the actual product method.',{...selected,importIds:{type:'array',minItems:1,maxItems:100,uniqueItems:true,items:identifier}},['workspace','importIds'],read),
  tool('merchant_partner_stations','Read the original station-flow analysis for a mobility import.',{...selected,importId:identifier},['workspace','importId'],read),
  tool('merchant_partner_export','Export the complete original workspace, editable review Markdown or native CSV.',{...named,kind:{type:'string',enum:['workspace','report','csv']}},['workspace','requestId','kind'],{idempotent:true}),
  tool('merchant_partner_request','Receive a retained lifecycle request/result, including an originating installation record.',{...selected,requestId:identifier,originInstallationId:uuid},['workspace','requestId'],read),
  tool('merchant_partner_commands','Describe the actual selected Python staff-service command and a private readiness file.',{...selected,port:{type:'integer',minimum:0,maximum:65535}},['workspace'],read),
];}
