// MIT. Original commissioning procedures: local source reads and explicit plan edits only.
export function operatingTools(tool){
 const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'},uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'},
  text={type:'string',maxLength:32000},object={type:'object'},workspace={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'},
  read={readOnly:true,idempotent:true},write={idempotent:true};
 const base={workspace},selected={workspace,planId:id},change={...selected,requestId:uuid,expectedVersion:{type:'integer',minimum:0}};
 const selection={type:'object',additionalProperties:false,properties:Object.fromEntries(['editions','reviews','operations','handovers'].map(k=>[k,{type:'array',items:id,maxItems:200,uniqueItems:true}])),required:['editions','reviews','operations','handovers']};
 return [
  tool('merchant_lightdash_operating_source','Read the original local source/review/operation/handover selections for a customer procedure. No provider refresh or execution.',base,['workspace'],read),
  tool('merchant_lightdash_operating_list','List complete saved customer procedures in this original workspace control directory.',base,['workspace'],read),
  tool('merchant_lightdash_operating_read','Read the complete procedure, all original plan revisions, native observation history, return reviews and editable latest draft.',selected,['workspace','planId'],read),
  tool('merchant_lightdash_operating_create','Build a complete editable procedure from explicit original source/review/operation/handover IDs and the installed Lightdash command registration. Step completion and customer acceptance are never inferred.',{
   ...change,title:text,customer:text,purpose:text,period:text,owner:text,receiving:text,notes:text,selection
  },['workspace','planId','requestId','expectedVersion','title','selection'],write),
  tool('merchant_lightdash_operating_adopt','Receive a complete exported procedure in this control workspace under its original procedure/source identities. Imported observations remain claims from that source; capture is allowed only against the same original native workspace UUID.',{
   ...change,procedure:object},['workspace','planId','requestId','expectedVersion','procedure'],write),
  tool('merchant_lightdash_operating_save','Save an explicit complete OperatingPlan draft using its original base revision and the procedure version. Commit the plan and original request receipt atomically.',{
   ...change,draft:object},['workspace','planId','requestId','expectedVersion','draft'],write),
  tool('merchant_lightdash_operating_capture','Append a read-only local observation for explicitly selected bound steps. Retain original request/source/artifact hashes and native status; preserve all operator instructions, status and recorded results.',{
   ...change,captureId:id,stepIds:{type:'array',items:id,minItems:1,maxItems:800,uniqueItems:true}
  },['workspace','planId','requestId','expectedVersion','captureId','stepIds'],write),
  tool('merchant_lightdash_operating_receive','Receive a complete original-format OperatingPlan whose history extends the saved plan. Divergence is retained for explicit original return review.',{
   ...change,incoming:object},['workspace','planId','requestId','expectedVersion','incoming'],write),
  tool('merchant_lightdash_operating_return_preview','Use the original returned-procedure comparison and explicit field/order decisions. Read-only; returns the complete review and conflict/readiness report.',{
   ...selected,incoming:object,reviewId:id,reviewer:text,notes:text,decisions:{type:'array',maxItems:20000,items:{type:'object',additionalProperties:false,properties:{key:text,decision:{anyOf:[object,{type:'null'}]}},required:['key','decision']}}
  },['workspace','planId','incoming','reviewId','reviewer'],read),
  tool('merchant_lightdash_operating_return_apply','Apply a complete reviewed return through the original OperatingPlan return engine, against the exact current procedure version. Atomically retain the full review/result and original request receipt.',{
   ...change,review:object},['workspace','planId','requestId','expectedVersion','review'],write),
  tool('merchant_lightdash_operating_export','Export complete procedure JSON with native observations/return reviews, portable original OperatingPlan JSON, or original readable Markdown/HTML. HTML/plan exports contain original plan history; the complete procedure JSON carries native observations.',{
   ...selected,format:{enum:['json','plan','markdown','html']}},['workspace','planId','format'],read),
  tool('merchant_lightdash_operating_request','Reconcile the exact saved request UUID after a lost response without repeating a native action. Returns the immutable request receipt and current procedure version.',{
   ...selected,requestId:uuid},['workspace','planId','requestId'],read)
 ];
}
