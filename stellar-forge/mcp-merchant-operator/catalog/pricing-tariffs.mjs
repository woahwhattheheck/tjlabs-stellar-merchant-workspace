// MIT. Source-owned metadata for the original Pricing workspace tariff workflow.
import { MAX_RETAINED_CHUNK_BYTES } from '../retained-file-contracts.mjs';

const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const arbitrary={type:'object',additionalProperties:true};
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const uuid={type:'string',pattern:'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'};
const digest={type:'string',pattern:'^[a-f0-9]{64}$'};
const usd={type:'string',pattern:'^(0|[1-9][0-9]*)(\\.[0-9]{1,6})?$'};
const whole={anyOf:[{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},
  {type:'string',pattern:'^(0|[1-9][0-9]*)$',maxLength:16}]};
const positive={anyOf:[{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},
  {type:'string',pattern:'^[1-9][0-9]*$',maxLength:16}]};
const id={type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'};
const routeId={type:'string',pattern:'^[A-Za-z0-9_-]{1,80}$'};
const label={type:'string',minLength:1,maxLength:100};
const base={workspace:alias};
const tier=object({upTo:{anyOf:[positive,{type:'null'}]},unitPriceUsd:usd});
const tariff=object({id,label:{type:'string',minLength:1,maxLength:120},routeId,
  mode:{type:'string',enum:['graduated','volume']},
  tiers:{type:'array',minItems:1,maxItems:64,items:tier}});
const preview={...base,version:uuid,tariffs:{type:'array',minItems:1,maxItems:12,items:tariff},
  volumes:{type:'array',minItems:1,maxItems:24,items:whole}};
const retainedSelection={type:'object',properties:{
  schema:{type:'string',enum:['stellar-forge.merchant-tariff-selection.v1']},
  planId:uuid,comparisonId:digest,tariffReviewSha256:digest,selectionSha256:digest,
  sourceSelection:arbitrary,scenarioPlanInput:arbitrary,pricingInput:arbitrary
},required:['schema','planId','comparisonId','tariffReviewSha256','selectionSha256',
  'sourceSelection','scenarioPlanInput','pricingInput'],additionalProperties:true};
const portfolio=object({schema:{type:'string',enum:['stellar-forge.merchant-tariff-portfolio.v1']},
  plans:{type:'array',items:arbitrary},selections:{type:'array',items:arbitrary},sha256:digest});
const fileRead={view:{type:'string',enum:['manifest','file']},
  file:{type:'string',minLength:1,maxLength:4096},expectedManifestSha256:digest,
  expectedSha256:digest,readId:uuid,offset:{type:'integer',minimum:0},
  limit:{type:'integer',minimum:1,maximum:MAX_RETAINED_CHUNK_BYTES}};
const atomic={type:'string',pattern:'^[1-9][0-9]{0,38}$'};
const payment={routeId,paymentIndex:{type:'integer',minimum:0},expectedAmount:atomic};
const reprice={...base,version:uuid,sellerSha256:digest,
  edits:{type:'array',minItems:1,items:object({...payment,amount:atomic})},
  quoteValuations:{type:'array',minItems:1,items:object({...payment,atomicUnits:atomic,usd,
    basis:{type:'string',minLength:4,maxLength:300}})}};
const saved={requestId:uuid,expectedRevision:{anyOf:[digest,{type:'null'}]},label};
const read={readOnly:true,idempotent:true};

export const TARIFF_MCP_OPERATIONS=Object.freeze({
  state:'merchant_pricing_tariff_state',
  source:'merchant_pricing_tariff_source',
  preview:'merchant_pricing_tariff_preview',
  save:'merchant_pricing_tariff_save',
  list:'merchant_pricing_tariff_list',
  load:'merchant_pricing_tariff_load',
  selection:'merchant_pricing_tariff_selection',
  commitSelection:'merchant_pricing_tariff_commit_selection',
  download:'merchant_pricing_tariff_download',
  report:'merchant_pricing_tariff_report',
  bundle:'merchant_pricing_tariff_bundle',
  inspectPortfolio:'merchant_pricing_tariff_inspect_portfolio',
  receive:'merchant_pricing_tariff_receive',
  repricingSource:'merchant_pricing_tariff_repricing_source',
  downloadRepricing:'merchant_pricing_tariff_download_repricing',
  downloadPricing:'merchant_pricing_tariff_download_pricing',
  previewRepricing:'merchant_pricing_tariff_repricing_preview',
  saveRepricing:'merchant_pricing_tariff_repricing_save',
  stageRepricing:'merchant_pricing_tariff_repricing_stage'
});

export const tariffToolDefinitions=[
  [TARIFF_MCP_OPERATIONS.state,'Read the original Pricing state and saved tariff plans and selection recovery operations. Uses the existing opened Pricing alias.',base,['workspace'],read],
  [TARIFF_MCP_OPERATIONS.source,'Read a saved native Pricing version, complete selected routes and commercial inputs for tariff planning. Historical seller changes remain explicit.',{...base,version:uuid},['workspace','version'],read],
  [TARIFF_MCP_OPERATIONS.preview,'Compare exact graduated or volume schedules at selected whole monthly quantities. Shows actual volume-boundary drops, known costs, unknown inputs and the explicit rounded uniform per-request quote. The existing ledger retains fixed per-call settlement.',preview,['workspace','version','tariffs','volumes'],read],
  [TARIFF_MCP_OPERATIONS.save,'Save the exact reviewed tariff schedules and quantities with their tariffReviewSha256, label and stable requestId. Repeat the original request after an interrupted reply.',{...preview,requestId:uuid,label,tariffReviewSha256:digest},['workspace','version','tariffs','volumes','requestId','label','tariffReviewSha256'],{idempotent:true}],
  [TARIFF_MCP_OPERATIONS.list,'List saved tariff plans and retained original native selection operations, including operations available to resume.',base,['workspace'],read],
  [TARIFF_MCP_OPERATIONS.load,'Load the complete retained tariff plan and exact review by its original planId.',{...base,planId:uuid},['workspace','planId'],read],
  [TARIFF_MCP_OPERATIONS.selection,'Review one positive-volume comparison as an explicit fixed quote through the original scenario and Pricing engines. Returns complete commercial terms, current terms and the immutable selection body.',{...base,planId:uuid,comparisonId:digest},['workspace','planId','comparisonId'],read],
  [TARIFF_MCP_OPERATIONS.commitSelection,'Commit the complete retained selection through the original scenario and Pricing writers. Both native request bodies are retained first. Preserve selection, planRequestId and pricingRequestId exactly across retries and process reopen.',{...base,selection:retainedSelection,planRequestId:uuid,pricingRequestId:uuid},['workspace','selection','planRequestId','pricingRequestId'],{idempotent:true}],
  [TARIFF_MCP_OPERATIONS.download,'Inspect a complete tariff-plan file manifest, or read one SHA-pinned original file chunk. Default view:manifest; view:file requires file and expectedManifestSha256. Includes plan.json, tariffs.json and comparison.csv. Release temporary reads with merchant_pricing_file_release.',{...base,planId:uuid,...fileRead},['workspace','planId'],read],
  [TARIFF_MCP_OPERATIONS.report,'Inspect the complete saved-plan report manifest or read one original SHA-pinned chunk. Includes report.html, band-charges.csv, thresholds.csv and all three original plan files. Default view:manifest; file reads require the selected manifest digest. The HTML shows every planned comparison, exact retained bands, rational averages, baseline costs and source identities. The original three-file plan artifact remains available through merchant_pricing_tariff_download.',{...base,planId:uuid,...fileRead},['workspace','planId'],read],
  [TARIFF_MCP_OPERATIONS.bundle,'Retain the full native tariff portfolio or select one original pricing request with selectionRequestId. The selected export contains its original plan and journal, including any pending result. Return the immutable file manifest; repeat portfolioSha256 to reopen those exact bytes after later saves or process restart. If both selectors are supplied, the retained export must contain exactly that selection and its plan. view:file uses only portfolioSha256 with original SHA-pinned chunks. The original Pricing backup accompanies this portfolio for receiving.',{...base,portfolioSha256:digest,selectionRequestId:uuid,...fileRead},['workspace'],{idempotent:true}],
  [TARIFF_MCP_OPERATIONS.inspectPortfolio,'Validate the complete portfolio using the original read-only receiving source preflight after restoring its Pricing backup. Return its verified content digest, original plan/source identities and selection request/result identities. The whole input is checked; the reply summarizes those validated records. The receiver checks destination conflicts when receiving.',{...base,bundle:portfolio},['workspace','bundle'],read],
  [TARIFF_MCP_OPERATIONS.receive,'Receive a complete original tariff portfolio after restoring its original Pricing backup. Validates complete saved reviews, source versions, original scenario/pricing request identities and existing completed native manifests before registering plans and selections.',{...base,bundle:portfolio},['workspace','bundle'],{idempotent:true}],
  [TARIFF_MCP_OPERATIONS.repricingSource,'Read the original saved seller payment options, atomicAmount values, commercial terms, current price-decision revision and source/release availability.',{...base,version:uuid},['workspace','version'],read],
  [TARIFF_MCP_OPERATIONS.downloadRepricing,'Inspect the original saved price-decision manifest or read an exact original decision/source-package file through the existing SHA-pinned file reader. Default view:manifest; view:file requires file and expectedManifestSha256.',{...base,decision:uuid,...fileRead},['workspace','decision'],read],
  [TARIFF_MCP_OPERATIONS.downloadPricing,'Inspect the original saved Pricing manifest or read an exact original report, terms, seller or observation file through the existing SHA-pinned file reader. Default view:manifest; view:file requires file and expectedManifestSha256.',{...base,version:uuid,...fileRead},['workspace','version'],read],
  [TARIFF_MCP_OPERATIONS.previewRepricing,'Review native payment amounts for the saved fixed quote through the original exact atomic conversion. Supply exactly one of quoteValuations or atomic edits; zero paid prices retain the original validation error.',reprice,['workspace','version','sellerSha256'],read],
  [TARIFF_MCP_OPERATIONS.saveRepricing,'Save the original reviewed native amount decision with its unchanged reviewSha256, expectedRevision and stable requestId. Exact request replay resolves a previously completed save.',{...reprice,...saved,reviewSha256:digest},['workspace','version','sellerSha256','requestId','expectedRevision','label','reviewSha256'],{idempotent:true}],
  [TARIFF_MCP_OPERATIONS.stageRepricing,'Stage the retained original seller source using the saved native decision and exact reviewSha256. The existing release store and stable release ID recover an interrupted stage; original merchant release controls own subsequent activation.',{...base,decision:uuid,reviewSha256:digest},['workspace','decision','reviewSha256'],{idempotent:true}]
];

export const tariffClientOperations=Object.freeze({
  'tariff-state':TARIFF_MCP_OPERATIONS.state,'tariff-source':TARIFF_MCP_OPERATIONS.source,
  'tariff-preview':TARIFF_MCP_OPERATIONS.preview,'tariff-save':TARIFF_MCP_OPERATIONS.save,
  'tariff-list':TARIFF_MCP_OPERATIONS.list,'tariff-load':TARIFF_MCP_OPERATIONS.load,
  'tariff-selection':TARIFF_MCP_OPERATIONS.selection,'tariff-commit':TARIFF_MCP_OPERATIONS.commitSelection,
  'tariff-report-manifest':TARIFF_MCP_OPERATIONS.report,
  'tariff-manifest':TARIFF_MCP_OPERATIONS.download,'tariff-bundle':TARIFF_MCP_OPERATIONS.bundle,
  'tariff-inspect':TARIFF_MCP_OPERATIONS.inspectPortfolio,'tariff-receive':TARIFF_MCP_OPERATIONS.receive,
  'tariff-price-source':TARIFF_MCP_OPERATIONS.repricingSource,
  'tariff-price-manifest':TARIFF_MCP_OPERATIONS.downloadRepricing,
  'tariff-review-manifest':TARIFF_MCP_OPERATIONS.downloadPricing,
  'tariff-price-preview':TARIFF_MCP_OPERATIONS.previewRepricing,
  'tariff-price-save':TARIFF_MCP_OPERATIONS.saveRepricing,'tariff-price-stage':TARIFF_MCP_OPERATIONS.stageRepricing
});
