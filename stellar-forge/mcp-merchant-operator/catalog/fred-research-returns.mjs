// MIT. Complete Economic Research customer returns in the existing FRED provider.
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const op={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$'};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const rev={type:'integer',minimum:1};
const workspace={workspace:alias},selected={...workspace,returnId:hash};
const page={offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100},expectedViewSha256:hash};
const mutation={...workspace,id:op,expectedRevision:rev};
const choice={returnId:hash,comparisonSha256:hash,choices:{type:'object',additionalProperties:{type:'string',enum:['issued','current','returned']}},
 order:{type:'array',maxItems:100,uniqueItems:true,items:{type:'string',minLength:1,maxLength:160}}};
const draft={...mutation,...choice,expectedDraftRevision:{type:'integer',minimum:0},
 note:{type:'string',maxLength:12000},label:{type:'string',maxLength:200}};
const read={readOnly:true,idempotent:true},change={idempotent:true};
export function fredResearchReturnTools(tool){return [
 tool('merchant_fred_research_returns','Page sent customer returns, received returns, working drafts or explicit adoptions in the original economic project. Keep expectedRevision on subsequent pages.',
  {...workspace,section:{type:'string',enum:['sent','received','drafts','adoptions']},offset:page.offset,limit:page.limit,expectedRevision:rev},['workspace'],read),
 tool('merchant_fred_research_return','Inspect one original customer return by complete files or top-level fields. Keep expectedViewSha256 through pages; very large fields use the complete research-return-view file.',
  {...selected,...page,section:{type:'string',enum:['files','fields']}},['workspace','returnId'],read),
 tool('merchant_fred_research_return_compare','Read every original issued/current/returned product, requirement and source comparison item. Keep comparisonSha256 for later choices and expectedViewSha256 through pages.',
  {...selected,...page,section:{type:'string',enum:['items','fields']}},['workspace','returnId'],read),
 tool('merchant_fred_research_return_preview','Preview explicit adoption choices at their exact comparison identity. This does not save, apply, issue a product, or create source reviews.',
  {...workspace,...choice},['workspace','returnId','comparisonSha256','choices','order'],read),
 tool('merchant_fred_research_return_work','Read complete fields of an immutable saved return working edition at its original draft revision. Follow the view SHA; complete research-return-view work JSON retains its full context and saved comparison.',
  {...selected,...page,revision:rev,section:{type:'string',enum:['fields']}},['workspace','returnId','revision'],read),
 tool('merchant_fred_research_return_create','Create a complete customer return from the received original Research package and current editable customer product. Retain the original package SHA, author, operation ID and project revision.',
  {...mutation,packageSha256:hash,author:{type:'string',minLength:1,maxLength:200},note:{type:'string',maxLength:12000}},
  ['workspace','id','expectedRevision','packageSha256','author'],change),
 tool('merchant_fred_research_return_import','Import the exact configured research-return file into its original producer project. Read and bind the full source SHA before import; preserve the original filename and operation.',
  {...mutation,input:alias,expectedSha256:hash},['workspace','id','expectedRevision','input','expectedSha256'],change),
 tool('merchant_fred_research_return_draft_save','Retain partial explicit comparison choices as a new immutable working edition. Both project and draft revisions guard concurrent edits.',
  draft,['workspace','id','expectedRevision','returnId','expectedDraftRevision','comparisonSha256','choices','order'],change),
 tool('merchant_fred_research_return_apply','Apply complete explicit issued/current/returned choices to the original product definition and source history. Preserve all earlier editions; following issuance remains a separate original Research action.',
  draft,['workspace','id','expectedRevision','returnId','expectedDraftRevision','comparisonSha256','choices','order'],change),
 tool('merchant_fred_research_return_resume','Resume the same retained pending Research return operation after inspecting its original operation record. Do not replace the operation ID or request.',
  {...mutation,action:{type:'string',enum:['research-return-create','research-return-import','research-return-draft-save','research-return-apply']}},
  ['workspace','id','expectedRevision','action'],change)
];}
