// MIT. Saved study-flow reporting over the original Research dossier.
import {digest,jsonBytes,need,object} from '../../node/store.mjs';

export const FLOW_SCHEMA='sf88-research-study-flow/v1';
export const FLOW_DEFINITION_SCHEMA='sf88-research-study-flow-definition/v1';
export const FLOW_OPERATION_SCHEMA='sf88-research-study-flow-operation/v1';
export const FLOW_TEMPLATES=Object.freeze(['new-databases','new-all-sources','update-databases','update-all-sources']);
export const FLOW_SECTIONS=Object.freeze(['overview','flows','editions','records','reports','studies','counts','issues','operations']);
export const FLOW_ACTIONS=Object.freeze(['save','review','withdraw']);
export const FLOW_ROUTES=Object.freeze(['database','register','website','organisation','citation','other']);
export const FLOW_METRICS=Object.freeze([
 {id:'database_results',label:'Database records',unit:'records',group:'identification'},
 {id:'register_results',label:'Register records',unit:'records',group:'identification'},
 {id:'website_results',label:'Website records',unit:'records',group:'other'},
 {id:'organisation_results',label:'Organisation records',unit:'records',group:'other'},
 {id:'citations_results',label:'Citation-search records',unit:'records',group:'other'},
 {id:'other_results',label:'Other identified records',unit:'records',group:'other'},
 {id:'duplicates',label:'Duplicate records removed',unit:'records',group:'removal'},
 {id:'excluded_automatic',label:'Records removed using automation',unit:'records',group:'removal'},
 {id:'excluded_other',label:'Other records removed before screening',unit:'records',group:'removal'},
 {id:'records_screened',label:'Screened records',unit:'records',group:'screening'},
 {id:'records_excluded',label:'Records excluded at screening',unit:'records',group:'screening'},
 {id:'dbr_sought_reports',label:'Reports sought: databases and registers',unit:'reports',group:'retrieval'},
 {id:'dbr_notretrieved_reports',label:'Reports not retrieved: databases and registers',unit:'reports',group:'retrieval'},
 {id:'dbr_assessed',label:'Reports assessed: databases and registers',unit:'reports',group:'assessment'},
 {id:'dbr_excluded',label:'Reports excluded: databases and registers',unit:'reports',group:'assessment'},
 {id:'other_sought_reports',label:'Reports sought: other methods',unit:'reports',group:'other'},
 {id:'other_notretrieved_reports',label:'Reports not retrieved: other methods',unit:'reports',group:'other'},
 {id:'other_assessed',label:'Reports assessed: other methods',unit:'reports',group:'other'},
 {id:'other_excluded',label:'Reports excluded: other methods',unit:'reports',group:'other'},
 {id:'new_studies',label:'Newly included studies',unit:'studies',group:'included'},
 {id:'new_reports',label:'Reports newly included',unit:'reports',group:'included'},
 {id:'previous_studies',label:'Studies in the previous review',unit:'studies',group:'previous'},
 {id:'previous_reports',label:'Reports in the previous review',unit:'reports',group:'previous'},
 {id:'previous_reports_found',label:'Previously included reports found and included again',unit:'reports',group:'previous'},
 {id:'previous_studies_removed',label:'Previous studies omitted from this update',unit:'studies',group:'previous'},
 {id:'previous_reports_removed',label:'Previous reports omitted from this update',unit:'reports',group:'previous'},
 {id:'total_studies',label:'Studies in this review',unit:'studies',group:'included'},
 {id:'total_reports',label:'Reports in this review',unit:'reports',group:'included'}
]);
export const FLOW_REFERENCES=Object.freeze([
 {title:'PRISMA 2020 flow diagram templates',url:'https://www.prisma-statement.org/prisma-2020-flow-diagram',
 license:'CC BY 4.0',role:'Four source/method and new/update template variants'},
 {title:'Page et al. The PRISMA 2020 statement. BMJ 2021;372:n71.',url:'https://doi.org/10.1136/bmj.n71',
 role:'Reporting guideline'},
 {title:'Haddaway et al. PRISMA2020. Campbell Systematic Reviews 2022;18:e1230.',
 url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC8958186/',license:'CC BY 4.0',
 role:'Published node and CSV terminology; this application implements its own renderer'}
]);
export const clone=value=>structuredClone(value);
export const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const flowDigest=value=>digest(jsonBytes(canonical(value)));
export const same=(a,b)=>flowDigest(a)===flowDigest(b);
export const list=value=>Array.isArray(value)?value:[];
export const fields=(value,allowed,code)=>{
 need(object(value)&&Object.keys(value).every(key=>allowed.includes(key)),code);return value;
};
export const text=(value,code,max=20000,empty=false)=>{
 need(typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0),code);return value;
};
export const identifier=(value,code='FLOW_IDENTIFIER_INVALID')=>{
 need(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value),code);return value;
};
export const ids=(value,code,empty=true)=>{
 need(Array.isArray(value)&&(empty||value.length>0)&&new Set(value).size===value.length,code);
 value.forEach(item=>identifier(item,code));return [...value];
};
export const count=(value,code='FLOW_COUNT_INVALID')=>{
 need(value===null||Number.isSafeInteger(value)&&value>=0,code);return value;
};
export const actorInput=value=>{
 fields(value,['id','name'],'FLOW_ACTOR_INVALID');
 return{id:identifier(value.id),name:text(value.name,'FLOW_ACTOR_NAME_REQUIRED',200)};
};
export function basisInput(value,{required=false}={}){
 fields(value??{},['editionIds','occurrenceIds','reference','locator','note'],'FLOW_BASIS_INVALID');
 const v={editionIds:ids(value?.editionIds??[],'FLOW_BASIS_EDITIONS_INVALID'),
 occurrenceIds:ids(value?.occurrenceIds??[],'FLOW_BASIS_OCCURRENCES_INVALID'),
 reference:text(value?.reference??'','FLOW_BASIS_REFERENCE_INVALID',4000,true),
 locator:text(value?.locator??'','FLOW_BASIS_LOCATOR_INVALID',4000,true),
 note:text(value?.note??'','FLOW_BASIS_NOTE_INVALID',20000,true)};
 if(required)need((v.editionIds.length||v.occurrenceIds.length||v.reference.trim())&&
 v.locator.trim(),'FLOW_ATTRIBUTED_BASIS_REQUIRED');
 return v;
}
const unique=(rows,by,code)=>need(new Set(rows.map(by)).size===rows.length,code);
const optionalRows=(value,code)=>{need(value===undefined||Array.isArray(value),code);return value??[];};
export function flowDefinition(input){
 fields(input,['schema','name','description','template','questionId','reviewId','workSetIds','editionIds',
 'routes','stages','records','retrievals','reportAnchors','reportedCounts','exclusionReasons','previous',
 'coverage','notes'],'FLOW_DEFINITION_FIELDS_INVALID');
 need(input.schema===undefined||input.schema===FLOW_DEFINITION_SCHEMA,'FLOW_DEFINITION_SCHEMA_INVALID');
 need(FLOW_TEMPLATES.includes(input.template),'FLOW_TEMPLATE_INVALID');
 const routes=optionalRows(input.routes,'FLOW_ROUTES_ARRAY_REQUIRED').map(value=>{
 fields(value,['editionId','kind','label'],'FLOW_ROUTE_FIELDS_INVALID');
 need(FLOW_ROUTES.includes(value.kind),'FLOW_ROUTE_INVALID');
 return{editionId:identifier(value.editionId),kind:value.kind,label:text(value.label,'FLOW_ROUTE_LABEL_REQUIRED',240)};
 });
 const stages=optionalRows(input.stages,'FLOW_STAGES_ARRAY_REQUIRED').map(value=>{
 fields(value,['workSetId','screening','fullText'],'FLOW_STAGE_MAPPING_FIELDS_INVALID');
 const screening=ids(value.screening??[],'FLOW_SCREENING_STAGES_INVALID'),fullText=ids(value.fullText??[],'FLOW_FULLTEXT_STAGES_INVALID');
 need(!screening.some(id=>fullText.includes(id)),'FLOW_STAGE_ROLES_OVERLAP');
 return{workSetId:identifier(value.workSetId),screening,fullText};
 });
 const records=optionalRows(input.records,'FLOW_RECORDS_ARRAY_REQUIRED').map(value=>{
 fields(value,['occurrenceId','workSetId','disposition','duplicateOf','reportKey','reason','basis'],'FLOW_RECORD_FIELDS_INVALID');
 need(['candidate','duplicate','automation','other-removal','outside-scope'].includes(value.disposition),'FLOW_RECORD_DISPOSITION_INVALID');
 const reason=text(value.reason,'FLOW_RECORD_REASON_REQUIRED');
 const v={occurrenceId:identifier(value.occurrenceId),workSetId:value.workSetId==null?null:identifier(value.workSetId),
 disposition:value.disposition,duplicateOf:value.duplicateOf==null?null:identifier(value.duplicateOf),
 reportKey:value.reportKey==null?null:text(value.reportKey,'FLOW_REPORT_KEY_INVALID',500),
 reason,basis:basisInput(value.basis,{required:value.disposition!=='candidate'})};
 need(value.disposition==='duplicate'?v.duplicateOf&&v.duplicateOf!==v.occurrenceId:!v.duplicateOf,
 'FLOW_DUPLICATE_TARGET_INVALID');return v;
 });
 const retrievals=optionalRows(input.retrievals,'FLOW_RETRIEVALS_ARRAY_REQUIRED').map(value=>{
 fields(value,['reportKey','status','reason','basis'],'FLOW_RETRIEVAL_FIELDS_INVALID');
 need(['not-sought','sought','retrieved','not-retrieved'].includes(value.status),'FLOW_RETRIEVAL_STATUS_INVALID');
 return{reportKey:text(value.reportKey,'FLOW_REPORT_KEY_INVALID',500),status:value.status,
 reason:text(value.reason,'FLOW_RETRIEVAL_REASON_REQUIRED'),basis:basisInput(value.basis,{required:true})};
 });
 const reportAnchors=optionalRows(input.reportAnchors,'FLOW_REPORT_ANCHORS_ARRAY_REQUIRED').map(value=>{
 fields(value,['reportKey','occurrenceId','reason'],'FLOW_REPORT_ANCHOR_INVALID');
 return{reportKey:text(value.reportKey,'FLOW_REPORT_KEY_INVALID',500),occurrenceId:identifier(value.occurrenceId),
 reason:text(value.reason,'FLOW_REPORT_ANCHOR_REASON_REQUIRED')};
 });
 const reportedCounts=optionalRows(input.reportedCounts,'FLOW_REPORTED_COUNTS_ARRAY_REQUIRED').map(value=>{
 fields(value,['metric','value','reason','basis'],'FLOW_REPORTED_COUNT_FIELDS_INVALID');
 need(FLOW_METRICS.some(row=>row.id===value.metric),'FLOW_METRIC_INVALID');
 return{metric:value.metric,value:count(value.value),reason:text(value.reason,'FLOW_COUNT_REASON_REQUIRED'),
 basis:basisInput(value.basis,{required:value.value!==null})};
 });
 const exclusionReasons=optionalRows(input.exclusionReasons,'FLOW_EXCLUSION_REASONS_ARRAY_REQUIRED').map(value=>{
 fields(value,['lane','label','value','reason','basis'],'FLOW_EXCLUSION_FIELDS_INVALID');
 need(['databases','other'].includes(value.lane),'FLOW_EXCLUSION_LANE_INVALID');
 return{lane:value.lane,label:text(value.label,'FLOW_EXCLUSION_LABEL_REQUIRED',1000),value:count(value.value),
 reason:text(value.reason,'FLOW_EXCLUSION_REASON_REQUIRED'),basis:basisInput(value.basis,{required:value.value!==null})};
 });
 fields(input.previous??{},['editionId','studyIdsRemoved','reportKeysRemoved','studyLinks','reportLinks','reason','basis'],
 'FLOW_PREVIOUS_FIELDS_INVALID');
 const link=(value,kind)=>{fields(value,['current','previous','reason'],'FLOW_PREVIOUS_LINK_INVALID');
 return{current:text(value.current,'FLOW_PREVIOUS_CURRENT_REQUIRED',500),previous:text(value.previous,'FLOW_PREVIOUS_ID_REQUIRED',500),
 reason:text(value.reason,'FLOW_PREVIOUS_LINK_REASON_REQUIRED')};};
 const previous={editionId:input.previous?.editionId==null?null:identifier(input.previous.editionId),
 studyIdsRemoved:ids(input.previous?.studyIdsRemoved??[],'FLOW_PREVIOUS_STUDIES_INVALID'),
 reportKeysRemoved:optionalRows(input.previous?.reportKeysRemoved,'FLOW_PREVIOUS_REPORT_KEYS_REMOVED_ARRAY_REQUIRED').map(v=>text(v,'FLOW_PREVIOUS_REPORT_INVALID',500)),
 studyLinks:optionalRows(input.previous?.studyLinks,'FLOW_PREVIOUS_STUDY_LINKS_ARRAY_REQUIRED').map(v=>link(v,'study')),reportLinks:optionalRows(input.previous?.reportLinks,'FLOW_PREVIOUS_REPORT_LINKS_ARRAY_REQUIRED').map(v=>link(v,'report')),
 reason:text(input.previous?.reason??'','FLOW_PREVIOUS_REASON_INVALID',20000,true),
 basis:basisInput(input.previous?.basis)};
 fields(input.coverage??{},['statement','completeSearch','screeningBy','screeningByHuman','screeningByAutomation'],'FLOW_COVERAGE_INVALID');
 const coverage={statement:text(input.coverage?.statement??'','FLOW_COVERAGE_STATEMENT_INVALID',20000,true),
 completeSearch:input.coverage?.completeSearch??false,screeningBy:input.coverage?.screeningBy??'unspecified',
 screeningByHuman:count(input.coverage?.screeningByHuman??null),screeningByAutomation:count(input.coverage?.screeningByAutomation??null)};
 need(typeof coverage.completeSearch==='boolean'&&['human','automation','mixed','unspecified'].includes(coverage.screeningBy),'FLOW_COVERAGE_INVALID');
 const v={schema:FLOW_DEFINITION_SCHEMA,name:text(input.name,'FLOW_NAME_REQUIRED',240),
 description:text(input.description??'','FLOW_DESCRIPTION_INVALID',20000,true),template:input.template,
 questionId:identifier(input.questionId),reviewId:input.reviewId==null?null:identifier(input.reviewId),
 workSetIds:ids(input.workSetIds??[],'FLOW_WORKSETS_INVALID'),editionIds:ids(input.editionIds??[],'FLOW_EDITIONS_INVALID'),
 routes,stages,records,retrievals,reportAnchors,reportedCounts,exclusionReasons,previous,coverage,
 notes:text(input.notes??'','FLOW_NOTES_INVALID',40000,true)};
 for(const[rows,key,code]of [[routes,v=>v.editionId,'FLOW_DUPLICATE_ROUTE'],[stages,v=>v.workSetId,'FLOW_DUPLICATE_STAGE_MAP'],
 [records,v=>v.occurrenceId,'FLOW_DUPLICATE_RECORD_RULE'],[retrievals,v=>v.reportKey,'FLOW_DUPLICATE_RETRIEVAL'],
 [reportAnchors,v=>v.reportKey,'FLOW_DUPLICATE_REPORT_ANCHOR'],[reportedCounts,v=>v.metric,'FLOW_DUPLICATE_METRIC'],
 [exclusionReasons,v=>v.lane+'\n'+v.label,'FLOW_DUPLICATE_EXCLUSION_REASON'],
 [previous.reportKeysRemoved,v=>v,'FLOW_DUPLICATE_PREVIOUS_REPORT_REMOVAL'],
 [previous.studyLinks,v=>v.current,'FLOW_DUPLICATE_PREVIOUS_STUDY'],[previous.reportLinks,v=>v.current,'FLOW_DUPLICATE_PREVIOUS_REPORT']])
 unique(rows,key,code);
 need(v.routes.every(r=>v.editionIds.includes(r.editionId))&&v.stages.every(r=>v.workSetIds.includes(r.workSetId)),
 'FLOW_SOURCE_SELECTION_MISMATCH');
 need(v.reviewId||!v.workSetIds.length,'FLOW_REVIEW_REQUIRED');
 if(!v.template.startsWith('update-'))need(!previous.editionId&&!previous.studyIdsRemoved.length&&!previous.reportKeysRemoved.length&&
 !previous.studyLinks.length&&!previous.reportLinks.length,'FLOW_PREVIOUS_REQUIRES_UPDATE');
 need(same(v,JSON.parse(JSON.stringify(v))),'FLOW_JSON_REQUIRED');return v;
}
export function flowInput(input){
 fields(input,['requestId','expectedRevision','actor','action','flowId','data'],'FLOW_REQUEST_FIELDS_INVALID');
 need(typeof input.requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId),'FLOW_REQUEST_ID_REQUIRED');
 need(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=1,'EXPECTED_REVISION_REQUIRED');
 need(FLOW_ACTIONS.includes(input.action)&&object(input.data),'FLOW_ACTION_INVALID');
 const request={requestId:input.requestId,expectedRevision:input.expectedRevision,actor:actorInput(input.actor),
 action:input.action,...(input.flowId!==undefined?{flowId:identifier(input.flowId)}:{}),data:clone(input.data)};
 if(input.action==='save'){
 fields(input.data,['definition','sourceMode','supersedes','reason','importFile'],'FLOW_SAVE_FIELDS_INVALID');
 request.data.definition=flowDefinition(input.data.definition);
 need(['current','retained'].includes(input.data.sourceMode??'current'),'FLOW_SOURCE_MODE_INVALID');
 request.data.sourceMode=input.data.sourceMode??'current';
 request.data.reason=text(input.data.reason,'FLOW_SAVE_REASON_REQUIRED');
 request.data.supersedes=input.data.supersedes==null?null:identifier(input.data.supersedes);
 if(input.data.importFile!==undefined){
 const f=fields(input.data.importFile,['filename','contentType','body'],'FLOW_IMPORT_FILE_INVALID');
 need(!/[\\/\0]/.test(f.filename),'FLOW_IMPORT_FILENAME_INVALID');
 request.data.importFile={filename:text(f.filename,'FLOW_IMPORT_FILENAME_REQUIRED',240),
 contentType:text(f.contentType??'application/json','FLOW_IMPORT_CONTENT_TYPE_INVALID',200),
 body:text(f.body,'FLOW_IMPORT_BODY_REQUIRED',1024*1024,true)};
 }
 }else{
 need(request.flowId,'FLOW_ID_REQUIRED');
 fields(input.data,['editionId','reason'],'FLOW_REVIEW_FIELDS_INVALID');
 request.data={editionId:identifier(input.data.editionId),reason:text(input.data.reason,'FLOW_REVIEW_REASON_REQUIRED')};
 }
 return request;
}
export function parseFlowCsv(body){
 text(body,'FLOW_CSV_REQUIRED',1024*1024,true);
 const rows=[];let row=[],cell='',quoted=false,after=false;
 const finishCell=()=>{row.push(cell);cell='';after=false;};
 const finishRow=()=>{finishCell();rows.push(row);row=[];};
 for(let i=0;i<body.length;i++){
 const c=body[i];
 if(quoted){if(c==='"'){if(body[i+1]==='"'){cell+='"';i++;}else{quoted=false;after=true;}}else cell+=c;continue;}
 if(c==='"'){need(!cell&&!after,'FLOW_CSV_QUOTE_INVALID');quoted=true;continue;}
 if(c===','){finishCell();continue;}
 if(c==='\r'||c==='\n'){if(c==='\r'&&body[i+1]==='\n')i++;finishRow();continue;}
 need(!after||c===' '||c==='\t','FLOW_CSV_AFTER_QUOTE_INVALID');if(!after)cell+=c;
 }
 need(!quoted,'FLOW_CSV_UNCLOSED_QUOTE');if(cell||row.length||after)finishRow();
 if(rows[0]?.[0]?.charCodeAt(0)===0xfeff)rows[0][0]=rows[0][0].slice(1);
 const headers=rows.shift()??[];need(new Set(headers).size===headers.length,'FLOW_CSV_DUPLICATE_COLUMN');
 need(headers.includes('data')&&headers.includes('n'),'FLOW_CSV_DATA_AND_N_REQUIRED');
 const values=[],seen=new Set();
 for(const[r,cells]of rows.entries()){
 if(cells.every(v=>!v.trim()))continue;need(cells.length===headers.length,'FLOW_CSV_COLUMN_COUNT');
 const value=Object.fromEntries(headers.map((h,i)=>[h,cells[i]])),metric=value.data;
 if(!metric||metric==='NA')continue;
 need(FLOW_METRICS.some(v=>v.id===metric),'FLOW_CSV_METRIC_INVALID');
 need(!seen.has(metric),'FLOW_CSV_DUPLICATE_METRIC');seen.add(metric);
 const raw=value.n.trim();need(!raw||/^(0|[1-9][0-9]*)$/.test(raw),'FLOW_CSV_INTEGER_REQUIRED');
 values.push({metric,value:raw?count(Number(raw)):null,row:r+2,raw:value});
 }
 return{headers,rows,values,sha256:digest(Buffer.from(body)),bytes:Buffer.byteLength(body)};
}
