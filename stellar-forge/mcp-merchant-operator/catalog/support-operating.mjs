// MIT. Metadata for the original Support operating procedure model.
const document={type:'object',additionalProperties:true};
const revision={type:'integer',minimum:1,maximum:9007199254740991};
const read={readOnly:true,idempotent:true};
export function supportOperatingTools(tool){
  return [
    tool('merchant_support_operating_handover_create','Prepare a complete Support handover document from the original full plan, all source descriptors, selected returned-work reviews and exact original companion manifests. Retains full editable histories and file identities; the archive/browser/native receiver separately reads every original member. Supply stable id, title, owner and createdAt.',
      {input:document},['input'],read),
    tool('merchant_support_operating_handover_inspect','Validate the complete handover document, original plan and return histories, source coverage and exact companion inventories. This value-only action does not read or verify a filesystem archive.',
      {value:document},['value'],read),
    tool('merchant_support_operating_handover_receive','Compute original complete-plan prefix receiving from a validated handover document. Preserves later compatible work and rejects divergent histories. Returns the full actual plan, reused and addedRevisions; no plan/case store is changed. Use full archive receiving for native companion verification.',
      {value:document,existing:{anyOf:[document,{type:'null'}]}},['value'],read),
    tool('merchant_support_operating_handover_render','Return complete editable handover JSON or readable HTML with the exact member inventory. Original companion files travel in the complete TAR; they are never dropped into a reference-only delivery.',
      {value:document,format:{enum:['json','html']}},['value','format'],read),
    tool('merchant_support_operating_inspect','Validate a retained compact Support source descriptor and its original case/evidence binding. Does not observe a resource or read an arbitrary file.',
      {source:document},['source'],read),
    tool('merchant_support_operating_create','Prepare one complete ordinary Operating Plan from the supplied retained Support source, actual installed catalog and exact creation input. Supply stable id and savedAt; all phases begin planned. Original commands are retained for operator review and are not executed.',
      {input:document},['input'],read),
    tool('merchant_support_operating_record','Append a reviewed outcome to the supplied complete original plan through the maintained model. Input retains source,stepId,status,result:{summary,evidenceIds},owner,savedAt. Completed work requires the actual returned evidence and original case lineage. No incident, case or native operation is dispatched.',
      {plan:document,input:document},['plan','input'],read),
    tool('merchant_support_operating_compare','Compare every saved step against the supplied complete current toolkit catalog, retaining original registrations and explicit changed or missing entries.',
      {plan:document,catalog:document,revision},['plan','catalog'],read),
    tool('merchant_support_operating_receive','Validate and receive a complete original plan history. Identical or older prefixes preserve the current later head; longer matching histories extend it; divergent shared revisions are rejected. Returns the complete result without creating a plan or case store.',
      {incoming:document,existing:{anyOf:[document,{type:'null'}]}},['incoming'],read),
    tool('merchant_support_operating_render','Return complete editable JSON or readable Markdown/HTML for a reviewed saved revision. JSON always retains the full original history; this operation writes no files.',
      {plan:document,revision,format:{enum:['json','markdown','html']}},['plan','format'],read),
    tool('merchant_support_operating_record_work','Record selected actual Support evidence as complete original OperatingFiles. Each evidence ID must match its source bytes and SHA-256. Supply plan and input with source,stepId,status,result,owner,savedAt,files; no file is read from the host.',
      {plan:document,input:document},['plan','input'],read),
    tool('merchant_support_operating_return_create','Prepare a complete returned-work review against the actual current Support plan using the original OperatingPlanReturn engine. Input supplies all original/returned source descriptors,id,reviewer,notes,createdAt.',
      {current:document,incoming:document,input:document},['current','incoming','input'],read),
    tool('merchant_support_operating_return_inspect','Validate complete Support sources, both plan histories, source-bound results, carried artifact bytes and completed review.',
      {value:document},['value'],read),
    tool('merchant_support_operating_return_compare','Show exact base/current/incoming values, full step/file conflicts, explicit choices and source integrity issues.',
      {value:document},['value'],read),
    tool('merchant_support_operating_return_details','Revise reviewing operator and notes while retaining the original source selection and incomplete review.',
      {value:document,updates:document},['value','updates'],read),
    tool('merchant_support_operating_return_decide','Set or remove one original displayed decision. decision is {take:current|incoming|base|custom,note,value only for custom}, or null to remove.',
      {value:document,key:{type:'string'},decision:{anyOf:[document,{type:'null'}]}},['value','key','decision'],read),
    tool('merchant_support_operating_return_apply','Compute the complete reviewed plan against exact current. Save returned value before writing plan through the original destination transaction. Completed replay preserves a later compatible destination head. This pure call does not save or mutate any case.',
      {value:document,current:document,savedAt:{type:'string'}},['value','current','savedAt'],read),
    tool('merchant_support_operating_return_render','Return full Support package JSON or a readable HTML review with complete carried-file downloads and source descriptors.',
      {value:document,format:{enum:['json','html']}},['value','format'],read),
  ];
}
