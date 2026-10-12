// MIT. Complete operator contract over the original Lineage and Support owners.
const text={type:'string',minLength:1};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'};
const workspace={type:'string',minLength:1,maxLength:80};
const read={readOnly:true,idempotent:true},write={idempotent:true};
const metadata={type:'object',additionalProperties:false,properties:{
 merchant:{type:'string',maxLength:480},owner:{type:'string',maxLength:480},status:{type:'string'},
 followUpOn:{type:'string',maxLength:10},nextAction:{type:'string',maxLength:2400},notes:{type:'string',maxLength:16000}
}};
const capture={id:uuid,expectedRevision:{type:['string','null'],pattern:'^[a-f0-9]{64}$'},workspace,
 incidentId:digest,name:{type:'string',minLength:1,maxLength:480},metadata,actor:{type:'string',minLength:1,maxLength:200},reference:{type:'string',maxLength:4096}};
const captureRequired=['id','expectedRevision','workspace','incidentId','name','metadata','actor'];
const decision={id:uuid,expectedRevision:digest,captureId:text,workspace,decision:{enum:['acknowledge','assign','resolve','accept','reopen']},
 owner:{type:'string',maxLength:400},reason:{type:'string',minLength:1,maxLength:6000},actor:{type:'string',minLength:1,maxLength:200},reference:{type:'string',maxLength:4096}};
const decisionRequired=['id','expectedRevision','captureId','workspace','decision','reason','actor'];
const save={requestId:uuid,expectedPreviewSha256:digest};
export function lineageSupportTools(tool){
 return [
  tool('merchant_lineage_support_sources','Inspect the existing configured Lineage workspace aliases and Support case owner used for complete incident handover.',{},[],read),
  tool('merchant_lineage_support_preview','Review one exact original Service Levels incident, complete original event files and native JSON/CSV/HTML reports against a new or saved Support case. expectedRevision:null prepares a new UUID.',capture,captureRequired,read),
  tool('merchant_lineage_support_save','Save the reviewed original capture in the existing Support commissioning material journal. Keep the same request UUID, complete arguments and preview SHA after a lost response.',{...capture,...save},[...captureRequired,'requestId','expectedPreviewSha256'],write),
  tool('merchant_lineage_support_read','Read captured incidents, prepared native decisions and original outcomes from the saved Support case. Page every retained material; the original case and commissioning desk remain editable.',
   {id:uuid,revision:digest,kind:{enum:['capture','intent','outcome']},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},['id'],read),
  tool('merchant_lineage_support_return_preview','Review a reasoned decision for the original native incident from this saved case. Resolve requires the original Lineage assessment to have cleared the condition.',decision,decisionRequired,read),
  tool('merchant_lineage_support_return_prepare','Retain the exact reviewed native decision as an immutable intent in this Support case before dispatch. A later case edit preserves the original saved intent.',
   {...decision,...save},[...decisionRequired,'requestId','expectedPreviewSha256'],write),
  tool('merchant_lineage_support_return_execute','Execute or recover the original saved intent through its configured Lineage owner. Reuses the exact native operation ID and arguments, then retains the actual native outcome while preserving concurrent case edits.',
   {id:uuid,intentId:text,expectedIntentSha256:digest,workspace},['id','intentId','expectedIntentSha256','workspace'],write),
  tool('merchant_lineage_support_file','Read complete original event, report or material JSON bytes from an exact saved case revision and material SHA. Continue nextOffset until null.',
   {id:uuid,revision:digest,materialId:text,expectedMaterialSha256:digest,name:text,offset:{type:'integer',minimum:0},length:{type:'integer',minimum:1,maximum:262144}},
   ['id','revision','materialId','expectedMaterialSha256','name'],read),
  tool('merchant_lineage_support_export','Create or recover the original complete Support case export, including every Lineage source, report, saved intent and native outcome in commissioning.json. Read original Support export status/manifest/file tools for all customer files.',
   {id:uuid,expectedRevision:digest,exportId:{type:'string',minLength:1,maxLength:160}},['id','expectedRevision','exportId'],write)
 ];
}
