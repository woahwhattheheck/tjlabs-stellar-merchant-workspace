// MIT. Study Flow tools reuse the original authenticated Research attachment.
import {FLOW_SECTIONS,FLOW_ACTIONS} from '../../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/study-flow/contracts.mjs';
const alias={type:'string',pattern:'^[a-z0-9][a-z0-9_-]{0,63}$'};
const id={type:'string',minLength:1,maxLength:200};
const dossierId={type:'string',minLength:1,maxLength:160};
const revision={type:'integer',minimum:1,maximum:99999999};
const offset={type:'integer',minimum:0},limit={type:'integer',minimum:1,maximum:100};
const dossier={workspace:alias,dossierId};
const read={readOnly:true,idempotent:true};
const definition={type:'object',additionalProperties:true,
 description:'Complete sf88-research-study-flow-definition/v1 from the original source/UI/client. Preserve unknown counts as null, exact original IDs and source attribution; the original engine validates the full definition.'};
const actor={type:'object',properties:{id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'},
 name:{type:'string',minLength:1,maxLength:200}},required:['id','name'],additionalProperties:false};
export const RESEARCH_STUDY_FLOW_PREFIX='merchant_research_study_flow';
export const RESEARCH_STUDY_FLOW_REQUEST_FIELDS=Object.freeze(['requestId','expectedRevision','actor','action','flowId','data']);
export const RESEARCH_STUDY_FLOW_REQUIRED_REQUEST_FIELDS=Object.freeze(['requestId','expectedRevision','actor','action','data']);
export const RESEARCH_STUDY_FLOW_CSV_SECTIONS=Object.freeze(['counts','records','reports','studies','reasons','issues']);
export const RESEARCH_STUDY_FLOW_EXPORTS=Object.freeze({
 'study-flow-json':{format:'json',extension:'json'},
 'study-flow-svg':{format:'svg',extension:'svg'},
 'study-flow-html':{format:'html',extension:'html'},
 'study-flow-csv':{format:'csv',extension:'csv'}
});
export const RESEARCH_STUDY_FLOW_EXPORT_FIELDS=Object.freeze({
 flowId:id,flowEditionId:id,
 flowSection:{type:'string',enum:RESEARCH_STUDY_FLOW_CSV_SECTIONS,
  description:'Study Flow CSV table; defaults to counts. Other export kinds contain the complete report.'}
});
export function researchStudyFlowTools(tool){
 return [
 tool('merchant_research_study_flow',
  'Read original saved Study Flow definitions, editions, counts, records, reports, explicit study identities, issues or request history. Page with the exact returned dossier revision and nextOffset. Native unknown counts and incomplete reporting remain explicit.',
  {...dossier,revision,flowId:id,editionId:id,section:{type:'string',enum:FLOW_SECTIONS},offset,limit},
  ['workspace','dossierId'],read),
 tool('merchant_research_study_flow_sources',
  'Inspect the original research question, eligibility review, work sets, protocols, retained edition hashes and complete paged occurrences before defining a diagram. This reads already retained sources and performs no search or provider request.',
  {...dossier,revision,questionId:id,reviewId:id,workSetId:id,offset,limit},
  ['workspace','dossierId'],read),
 tool('merchant_research_study_flow_report',
  'Read the full immutable selected Study Flow report plus its original SVG. For large reports use the paged Study Flow read and merchant_research_export with study-flow-json/svg/html/csv for a complete retained file.',
  {...dossier,revision,flowId:id,editionId:id},['workspace','dossierId'],read),
 tool('merchant_research_study_flow_preview',
  'Validate and derive a complete proposed Study Flow against the current expected dossier revision, or an existing saved source basis. Returns the original complete report and SVG without saving an edition. A retained basis must belong to the selected flow.',
  {...dossier,expectedRevision:revision,definition,flowId:id,
   sourceMode:{type:'string',enum:['current','retained']},basisEditionId:id},
  ['workspace','dossierId','expectedRevision','definition'],read),
 tool('merchant_research_study_flow_import_counts',
  'Parse the exact original count CSV into attributed count overrides without saving an edition. Preserve the original body including BOM, quoting and line endings; blank n remains unknown. Returns its byte hash and importFile for the later native save.',
  {...dossier,expectedRevision:revision,body:{type:'string',maxLength:1048576},
   filename:{type:'string',minLength:1,maxLength:240},reference:{type:'string',maxLength:20000},
   reason:{type:'string',minLength:1,maxLength:20000}},
  ['workspace','dossierId','expectedRevision','body','filename','reason'],read),
 tool('merchant_research_study_flow_review',
  'Save an original diagram edition, mark its current edition reviewed, or withdraw reviewed status without deleting history. Persist the complete native requestId/expectedRevision/actor/action/optional flowId/data before calling. Replay that exact envelope after an uncertain reply; the original engine returns its committed operation and duplicate flag.',
  {...dossier,requestId:{type:'string',pattern:'^[A-Za-z0-9_-]{8,100}$'},expectedRevision:revision,
   actor,action:{type:'string',enum:FLOW_ACTIONS},flowId:id,data:{type:'object',additionalProperties:true,
    description:'For save: complete definition, sourceMode, optional basisEditionId, supersedes, reason and optional exact importFile. For review/withdraw: editionId and reason. The original engine validates all fields.'}},
  ['workspace','dossierId',...RESEARCH_STUDY_FLOW_REQUIRED_REQUEST_FIELDS],{idempotent:true})
 ];
}
