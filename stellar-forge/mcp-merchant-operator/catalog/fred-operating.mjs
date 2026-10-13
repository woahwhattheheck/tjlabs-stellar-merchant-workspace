// MIT. Metadata for the original FRED operating procedure model.
const document={type:'object',additionalProperties:true};
const revision={type:'integer',minimum:1,maximum:9007199254740991};
const read={readOnly:true,idempotent:true};
export function fredOperatingTools(tool){
  return [
    tool('merchant_fred_operating_inspect','Validate a retained compact FRED source descriptor and its original project/source/evidence binding. Does not observe a resource or read an arbitrary file.',
      {source:document},['source'],read),
    tool('merchant_fred_operating_create','Prepare one complete ordinary Operating Plan from the supplied retained FRED source, actual installed catalog and exact creation input. Supply stable id and savedAt; all phases begin planned. Original commands are retained for operator review and are not executed.',
      {input:document},['input'],read),
    tool('merchant_fred_operating_record','Append a reviewed outcome to the supplied complete original plan through the maintained model. Input retains source,stepId,status,result:{summary,evidenceIds},owner,savedAt. Completed work requires the actual returned evidence and original project and operation lineage. The selected original economic operation remains the execution path.',
      {plan:document,input:document},['plan','input'],read),
    tool('merchant_fred_operating_compare','Compare every saved step against the supplied complete current toolkit catalog, retaining original registrations and explicit changed or missing entries.',
      {plan:document,catalog:document,revision},['plan','catalog'],read),
    tool('merchant_fred_operating_receive','Validate and receive a complete original plan history. Identical or older prefixes preserve the current later head; longer matching histories extend it; divergent shared revisions are rejected. Returns the complete result without creating a plan or project store.',
      {incoming:document,existing:{anyOf:[document,{type:'null'}]}},['incoming'],read),
    tool('merchant_fred_operating_render','Return complete editable JSON or readable Markdown/HTML for a reviewed saved revision. JSON always retains the full original history; this operation writes no files.',
      {plan:document,revision,format:{enum:['json','markdown','html']}},['plan','format'],read),
  ];
}
