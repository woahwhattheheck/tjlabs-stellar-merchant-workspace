// MIT. Reporting editions use the original dossier transaction and portable history.
import {digest,jsonBytes,need,object} from '../../node/store.mjs';
import {eligibilityModel} from '../eligibility-review.mjs';
import {RESEARCH_PAGE_LIMIT} from '../workspace-contracts.mjs';
import {FLOW_SCHEMA,FLOW_OPERATION_SCHEMA,FLOW_METRICS,FLOW_REFERENCES,FLOW_SECTIONS,
 clone,list,flowDigest,same,flowDefinition,flowInput,parseFlowCsv} from './contracts.mjs';

const byId=(values,id,code)=>{const value=values.find(row=>row.id===id);need(value,code);return value;};
const entityId=(prefix,state,request)=>prefix+'_'+flowDigest({dossierId:state.id,requestId:request.requestId});
const selectedKeys=definition=>({questionId:definition.questionId,reviewId:definition.reviewId,
 workSetIds:[...definition.workSetIds].sort(),editionIds:[...definition.editionIds].sort(),
 previousEditionId:definition.previous.editionId});
const distinct=values=>[...new Set(values)];
const mapBy=(values,key)=>new Map(values.map(value=>[key(value),value]));
const dbRoute=kind=>['database','register'].includes(kind);
const serial=value=>JSON.parse(JSON.stringify(value));
const currentResolution=row=>row?.resolutionCurrent&&['RESOLVED_INCLUDE','RESOLVED_EXCLUDE'].includes(row.status);
const terminal=(rows,stages)=>{
 if(!stages.length)return{status:'unmapped',rows:[],resolutionIds:[],reason:null};
 const picked=stages.map(id=>rows.find(row=>row.stageId===id)).filter(Boolean);
 if(picked.length!==stages.length)return{status:'missing',rows:picked,resolutionIds:[],reason:null};
 const exclusion=picked.find(row=>currentResolution(row)&&row.status==='RESOLVED_EXCLUDE');
 if(exclusion)return{status:'excluded',rows:picked,resolutionIds:[exclusion.resolution.id],
 reason:exclusion.resolution.exclusionReasonId};
 if(picked.every(row=>currentResolution(row)&&row.status==='RESOLVED_INCLUDE'))
 return{status:'included',rows:picked,resolutionIds:picked.map(row=>row.resolution.id),reason:null};
 return{status:'pending',rows:picked,resolutionIds:[],reason:null};
};
function stateRecords(state){
 const model={operations:list(state.studyFlowEvents),bases:[],editions:[],reviews:[],flows:[]};
 for(const event of model.operations){
 if(event.result.basis)model.bases.push(event.result.basis);
 if(event.result.edition)model.editions.push(event.result.edition);
 if(event.result.review)model.reviews.push(event.result.review);
 }
 for(const edition of model.editions){
 let flow=model.flows.find(value=>value.id===edition.flowId);
 if(!flow){flow={id:edition.flowId,name:edition.definition.name,questionId:edition.definition.questionId,
 createdAt:edition.createdAt,createdBy:clone(edition.actor),editionIds:[],currentEditionId:edition.id};model.flows.push(flow);}
 flow.editionIds.push(edition.id);flow.currentEditionId=edition.id;flow.name=edition.definition.name;
 }
 return model;
}
export function studyFlowModel(state){return stateRecords(state);}
function editionState(model,edition){
 const review=model.reviews.filter(value=>value.editionId===edition.id).at(-1)??null;
 return{status:review?.action==='withdraw'?'withdrawn':review?.action==='review'?'reviewed':'draft',review:clone(review)};
}
function validateBasisReferences(definition,basis){
 const editions=new Set(basis.editions.map(v=>v.id)),occurrences=new Set(basis.occurrences.map(v=>v.occurrenceId));
 const check=value=>{
 need(value.editionIds.every(id=>editions.has(id))&&value.occurrenceIds.every(id=>occurrences.has(id)),
 'FLOW_BASIS_OUTSIDE_SELECTED_SOURCE');
 };
 for(const v of [...definition.records,...definition.retrievals,...definition.reportedCounts,...definition.exclusionReasons])check(v.basis);
 check(definition.previous.basis);
 for(const value of definition.previous.membership)check(value.basis);
 for(const row of definition.records){
 need(occurrences.has(row.occurrenceId),'FLOW_RECORD_OUTSIDE_SOURCE');
 if(row.duplicateOf)need(occurrences.has(row.duplicateOf),'FLOW_DUPLICATE_TARGET_OUTSIDE_SOURCE');
 if(row.workSetId)need(basis.workSets.some(set=>set.id===row.workSetId&&set.occurrenceIds.includes(row.occurrenceId)),
 'FLOW_RECORD_WORKSET_MISMATCH');
 }
 for(const mapping of definition.stages){
 const workSet=byId(basis.workSets,mapping.workSetId,'FLOW_WORKSET_NOT_FOUND');
 const protocol=byId(basis.protocols,workSet.protocolId,'FLOW_PROTOCOL_NOT_FOUND');
 const ids=new Set(protocol.definition.stages.map(v=>v.id));
 need([...mapping.screening,...mapping.fullText].every(id=>ids.has(id)),'FLOW_STAGE_OUTSIDE_PROTOCOL');
 need(mapping.fullText.every(id=>protocol.definition.stages.find(v=>v.id===id).requireFullText),
 'FLOW_FULLTEXT_STAGE_NOT_DECLARED');
 }
}
export function captureFlowBasis(state,projected,definition,{id,priorReport=null}={}){
 const question=byId(state.questions,definition.questionId,'QUESTION_NOT_FOUND'),m=eligibilityModel(state,projected);
 if(definition.reviewId){
 const review=byId(m.reviews,definition.reviewId,'ELIGIBILITY_REVIEW_NOT_FOUND');
 need(review.questionId===question.id,'FLOW_REVIEW_QUESTION_MISMATCH');
 }
 const workSets=definition.workSetIds.map(key=>{
 const workSet=byId(m.workSets,key,'ELIGIBILITY_WORKSET_NOT_FOUND');
 need(workSet.questionId===question.id&&workSet.reviewId===definition.reviewId,'FLOW_WORKSET_QUESTION_MISMATCH');
 return workSet;
 });
 const editions=definition.editionIds.map(key=>{
 const edition=byId(state.editions,key,'EDITION_NOT_FOUND');
 need(edition.mode==='retained'&&edition.questionId===question.id,'FLOW_RETAINED_QUESTION_SOURCE_REQUIRED');
 return{id:edition.id,provider:edition.provider,label:edition.label,raw:clone(edition.raw),
 sourceReference:edition.sourceReference??'',createdAt:edition.createdAt};
 });
 const editionIds=new Set(editions.map(v=>v.id)),workSetIds=new Set(workSets.map(v=>v.id));
 const occurrences=[...m.occurrences.values()].filter(v=>v.questionId===question.id&&editionIds.has(v.editionId)).map(clone);
 const occurrenceIds=new Set(occurrences.map(v=>v.occurrenceId));
 const protocols=m.protocols.filter(v=>workSets.some(w=>w.protocolId===v.id)).map(clone);
 const rows=m.queue.filter(v=>workSetIds.has(v.workSetId)&&occurrenceIds.has(v.occurrenceId)).map(value=>({
 id:value.id,occurrenceId:value.occurrenceId,workSetId:value.workSetId,protocolId:value.protocolId,
 stageId:value.stageId,stageIndex:value.stageIndex,requireFullText:value.requireFullText,status:value.status,
 protocolCurrent:value.protocolCurrent,resolutionCurrent:value.resolutionCurrent,
 resolution:value.resolution?{id:value.resolution.id,disposition:value.resolution.disposition,
 exclusionReasonId:value.resolution.exclusionReasonId,reason:value.resolution.reason,actor:clone(value.resolution.actor),
 createdAt:value.resolution.createdAt,decisionIds:clone(value.resolution.decisionIds)}:null,
 decisions:value.decisions.map(v=>({id:v.id,disposition:v.disposition,actor:clone(v.actor),basis:clone(v.basis),
 exclusionReasonId:v.exclusionReasonId,reason:v.reason,createdAt:v.createdAt})),
 }));
 const basis={schema:'sf88-research-study-flow-source/v1',id:id??'fb_'+flowDigest({dossier:state.id,
 revision:state.revision,selector:selectedKeys(definition)}),dossierId:state.id,sourceRevision:state.revision,
 sourceRevisionSha256:digest(jsonBytes(state)),capturedAt:state.updatedAt,selector:selectedKeys(definition),
 question:clone(question),review:definition.reviewId?clone(m.reviews.find(v=>v.id===definition.reviewId)):null,
 editions,occurrences,protocols,workSets:workSets.map(v=>({id:v.id,name:v.name,reviewId:v.reviewId,
 protocolId:v.protocolId,sourceRevision:v.sourceRevision,occurrenceIds:v.sources.map(s=>s.occurrenceId),
 sourceEditionIdsAtCreation:clone(v.sourceEditionIdsAtCreation)})),rows,
 studies:m.studies.filter(v=>v.reviewId===definition.reviewId&&v.occurrenceIds.some(id=>occurrenceIds.has(id))).map(clone),
 impacts:m.impact.filter(v=>v.reviewId===definition.reviewId&&(!v.workSetId||workSetIds.has(v.workSetId))).map(v=>({
 id:v.id,kind:v.kind,title:v.title,status:v.status,occurrenceIds:clone(v.occurrenceIds)})),
 previous:priorReport?{editionId:priorReport.edition.id,flowId:priorReport.flowId,name:priorReport.definition.name,
 questionId:priorReport.definition.questionId,status:priorReport.status,reportSha256:priorReport.reportSha256,
 sourceRevision:priorReport.source.sourceRevision,counts:priorReport.counts.map(v=>({id:v.id,value:v.value})),
 studyIds:clone(priorReport.included.studyIds),reportKeys:clone(priorReport.included.reportKeys),
 reportStudyLinks:clone(priorReport.included.reportStudyLinks),linksComplete:priorReport.included.linksComplete}:null};
 if(priorReport)need(priorReport.definition.questionId===question.id,'FLOW_PREVIOUS_QUESTION_MISMATCH');
 validateBasisReferences(definition,basis);
 return{...basis,sha256:flowDigest(basis)};
}
function projectRows(definition,basis,{reportVersion=2}={}){
 const routes=mapBy(definition.routes,v=>v.editionId),rules=mapBy(definition.records,v=>v.occurrenceId);
 const stages=mapBy(definition.stages,v=>v.workSetId),issues=[];
 const issue=(code,message,details={})=>issues.push({code,message,level:'warning',...details});
 const records=basis.occurrences.map(source=>{
 const rule=rules.get(source.occurrenceId),route=routes.get(source.editionId);
 const workSets=basis.workSets.filter(v=>v.occurrenceIds.includes(source.occurrenceId));
 let workSet=rule?.workSetId?workSets.find(v=>v.id===rule.workSetId):workSets.length===1?workSets[0]:null;
 const disposition=rule?.disposition??(workSets.length?'candidate':'unassigned');
 if(!route)issue('SOURCE_ROUTE_UNASSIGNED','Choose the identification method for the original source edition.',
 {editionId:source.editionId,occurrenceId:source.occurrenceId});
 if(disposition==='unassigned')issue('RECORD_DISPOSITION_UNASSIGNED','Classify this retained record before reporting its flow.',
 {occurrenceId:source.occurrenceId});
 if(disposition==='candidate'&&workSets.length>1&&!workSet)issue('WORKSET_SELECTION_REQUIRED',
 'This occurrence has several work sets. Select its original outcome explicitly.',{occurrenceId:source.occurrenceId,workSetIds:workSets.map(v=>v.id)});
 if(disposition==='candidate'&&!workSet)issue('RECORD_HAS_NO_SELECTED_WORKSET',
 'The selected source record has no chosen native eligibility assignment.',{occurrenceId:source.occurrenceId});
 const mapping=workSet?stages.get(workSet.id):null;
 if(disposition==='candidate'&&workSet&&!mapping)issue('STAGE_MAPPING_REQUIRED',
 'Choose the original screening and full-text stages for this work set.',{workSetId:workSet.id,occurrenceId:source.occurrenceId});
 const rows=workSet?basis.rows.filter(v=>v.workSetId===workSet.id&&v.occurrenceId===source.occurrenceId):[];
 const screening=terminal(rows,mapping?.screening??[]),assessment=terminal(rows,mapping?.fullText??[]);
 const finalRows=assessment.rows;
 const availability=distinct(finalRows.flatMap(v=>v.decisions).map(v=>v.basis?.availability).filter(Boolean));
 let retrieval=availability.includes('available')?'retrieved':
 availability.length&&availability.every(v=>v==='unavailable')?'unavailable-reported':'unknown';
 if(availability.includes('available')&&availability.includes('unavailable'))issue('RETRIEVAL_BASIS_DISAGREEMENT',
 'Original reviewers report different full-text availability; retain an explicit retrieval outcome.',
 {occurrenceId:source.occurrenceId});
 if(disposition==='candidate'&&['pending','missing','unmapped'].includes(screening.status)&&!dbRoute(route?.kind)){
 // Other-method paths need not have a separate title/abstract stage.
 }else if(disposition==='candidate'&&['pending','missing','unmapped'].includes(screening.status))
 issue('SCREENING_NOT_RESOLVED','The original mapped screening stage has no complete current resolution.',
 {occurrenceId:source.occurrenceId,status:screening.status});
 if(disposition==='candidate'&&screening.status!=='excluded'&&['pending','missing','unmapped'].includes(assessment.status))
 issue('ASSESSMENT_NOT_RESOLVED','The mapped full-text stage has no complete current resolution.',
 {occurrenceId:source.occurrenceId,status:assessment.status});
 if(rows.some(v=>!v.protocolCurrent))issue('PREVIOUS_PROTOCOL','The chosen work set retains an earlier protocol.',
 {occurrenceId:source.occurrenceId,workSetId:workSet?.id});
 return{...clone(source),route:route?clone(route):null,lane:route?(dbRoute(route.kind)?'databases':'other'):null,
 disposition,rule:clone(rule??null),workSetId:workSet?.id??null,reportKey:rule?.reportKey??source.sourceId,
 screening:{status:screening.status,resolutionIds:screening.resolutionIds,reason:screening.reason},
 assessment:{status:assessment.status,resolutionIds:assessment.resolutionIds,reason:assessment.reason},
 retrieval,stageRows:rows,studyIds:basis.studies.filter(v=>v.occurrenceIds.includes(source.occurrenceId)).map(v=>v.id)};
 });
 const lookup=mapBy(records,v=>v.occurrenceId);
 for(const row of records.filter(v=>v.disposition==='duplicate')){
 const target=lookup.get(row.rule.duplicateOf);
 if(!target||target.disposition!=='candidate')issue('DUPLICATE_TARGET_NOT_RETAINED',
 'The chosen duplicate target must be a retained candidate in this diagram.',{occurrenceId:row.occurrenceId,target:row.rule.duplicateOf});
 if(target&&target.reportKey!==row.reportKey)issue('DUPLICATE_REPORT_ID_DIFFERS',
 'The two records have different retained report keys; document the common report identity.',{occurrenceId:row.occurrenceId,target:target.occurrenceId});
 }
 const grouped=new Map();for(const row of records.filter(v=>v.disposition==='candidate')){
 if(!grouped.has(row.reportKey))grouped.set(row.reportKey,[]);grouped.get(row.reportKey).push(row);
 }
 const retrievals=mapBy(definition.retrievals,v=>v.reportKey),anchors=mapBy(definition.reportAnchors,v=>v.reportKey);
 // Earlier saved editions retain their original label projection during receiving.
 const reasons=reportVersion===1?new Map(basis.protocols.flatMap(p=>p.definition.exclusionReasons.map(r=>[r.id,r.label]))):null;
 const workSetProtocols=new Map(basis.workSets.map(v=>[v.id,v.protocolId]));
 const protocolReasons=new Map(basis.protocols.map(p=>[p.id,new Map(p.definition.exclusionReasons.map(r=>[r.id,r.label]))]));
 const reasonLabel=row=>{
 const id=row?.assessment.reason;if(!id)return null;
 const labels=reportVersion===1?reasons:protocolReasons.get(workSetProtocols.get(row.workSetId));
 return labels?.get(id)??id;
 };
 const reports=[...grouped].map(([key,rows])=>{
 const anchor=anchors.get(key);let selected=anchor?rows.find(v=>v.occurrenceId===anchor.occurrenceId):rows.length===1?rows[0]:null;
 if(anchor)need(selected,'FLOW_REPORT_ANCHOR_OUTSIDE_GROUP');
 if(!selected&&rows.length>1){
 const meanings=distinct(rows.map(v=>flowDigest({lane:v.lane,screening:v.screening.status,
 assessment:v.assessment.status,reason:v.assessment.reason,retrieval:v.retrieval,studyIds:[...v.studyIds].sort()})));
 if(meanings.length===1)selected=rows[0];
 else issue('REPORT_OUTCOMES_DIFFER','Records for one retained report have differing outcomes. Select the source of its reported outcome.',
 {reportKey:key,occurrenceIds:rows.map(v=>v.occurrenceId)});
 issue('REPORT_HAS_MULTIPLE_CANDIDATE_RECORDS',
 'Several candidate records identify one report. Confirm the intended duplicate treatment and count units.',
 {reportKey:key,occurrenceIds:rows.map(v=>v.occurrenceId)});
 }
 const lanes=distinct(rows.map(v=>v.lane).filter(Boolean));
 if(lanes.length>1&&!anchor)issue('REPORT_SPANS_IDENTIFICATION_ROUTES',
 'Select the reporting route for this report with an explicit source anchor.',{reportKey:key});
 const explicit=retrievals.get(key),inferred=selected?.retrieval==='retrieved'?'retrieved':null;
 const retrieval=explicit?.status??inferred??'unknown';
 if(!explicit&&selected?.retrieval==='unavailable-reported')issue('UNAVAILABLE_IS_NOT_RETRIEVAL_DISPOSITION',
 'A reviewer reported unavailable text. Confirm whether the report was sought and not retrieved.',{reportKey:key});
 const assessment=selected?.assessment.status??'conflict',screening=selected?.screening.status??'conflict';
 if(retrieval==='not-retrieved'&&['included','excluded'].includes(assessment))
 issue('RETRIEVAL_AND_ASSESSMENT_CONFLICT','The recorded retrieval and original assessment outcomes disagree.',{reportKey:key,level:'error'});
 const fullTextIncluded=assessment==='included'&&retrieval==='retrieved';
 return{reportKey:key,title:selected?.title??rows[0].title,lane:selected?.lane??(lanes.length===1?lanes[0]:null),
 occurrenceIds:rows.map(v=>v.occurrenceId),anchor:anchor?clone(anchor):null,
 outcomeOccurrenceId:selected?.occurrenceId??null,screening,assessment,retrieval,
 retrievalBasis:explicit?clone(explicit):{kind:inferred?'original-reviewer-basis':'not-recorded',
 resolutionIds:selected?.assessment.resolutionIds??[]},excludedReasonId:selected?.assessment.reason??null,
 excludedReason:reasonLabel(selected),
 resolutionIds:selected?.assessment.resolutionIds??[],included:fullTextIncluded,
 studyIds:distinct(rows.flatMap(v=>v.studyIds)),sourceRows:rows.map(v=>({occurrenceId:v.occurrenceId,
 editionId:v.editionId,sourceSha256:v.sourceSha256,contentDigest:v.contentDigest}))};
 });
 for(const row of definition.retrievals)need(grouped.has(row.reportKey),'FLOW_RETRIEVAL_REPORT_NOT_FOUND');
 for(const row of definition.reportAnchors)need(grouped.has(row.reportKey),'FLOW_REPORT_ANCHOR_NOT_FOUND');
 const includedReports=reports.filter(v=>v.included),includedReportKeys=new Set(includedReports.map(v=>v.reportKey));
 const studies=basis.studies.map(study=>({id:study.id,name:study.name,reason:study.reason,
 evidence:clone(study.evidence),occurrenceIds:clone(study.occurrenceIds),
 reportKeys:reports.filter(r=>r.occurrenceIds.some(id=>study.occurrenceIds.includes(id))).map(r=>r.reportKey),
 includedReportKeys:reports.filter(r=>includedReportKeys.has(r.reportKey)&&r.occurrenceIds.some(id=>study.occurrenceIds.includes(id))).map(r=>r.reportKey)
 })).map(v=>({...v,included:v.includedReportKeys.length>0}));
 for(const report of includedReports)if(!report.studyIds.length)issue('INCLUDED_REPORT_WITHOUT_STUDY_LINK',
 'The included report has no explicit original study link; a DOI or report key is not a study count.',{reportKey:report.reportKey});
 for(const report of includedReports)if(report.studyIds.length>1)issue('REPORT_LINKED_TO_MULTIPLE_STUDIES',
 'This report is explicitly linked to several studies; its report is counted once and all named study links are retained.',{reportKey:report.reportKey,level:'info'});
 for(const impact of basis.impacts.filter(v=>v.status==='NEEDS_REVIEW'))issue('ORIGINAL_REVIEW_IMPACT',
 impact.title,{impactId:impact.id,kind:impact.kind});
 return{records,reports,studies,issues};
}
function metricProjection(definition,basis,rows){
 const {records,reports,studies}=rows,metrics=new Map(FLOW_METRICS.map(v=>[v.id,{...v,value:null,derivedValue:null,
 mode:'derived',knownCount:0,memberIds:[],basis:[],reason:''}]));
 const put=(id,members,{complete=true,note=''}={})=>{
 const metric=metrics.get(id);metric.memberIds=distinct(members);metric.knownCount=metric.memberIds.length;
 metric.derivedValue=complete?metric.knownCount:null;metric.value=metric.derivedValue;
 metric.reason=note;return metric;
 };
 const issues=rows.issues;
 const add=(code,message,details={})=>issues.push({code,message,level:'warning',...details});
 const routed=records.filter(v=>v.route&&v.disposition!=='outside-scope');
 const routesComplete=basis.editions.length>0&&records.filter(v=>v.disposition!=='outside-scope').every(v=>v.route);
 if(!basis.editions.length)add('SOURCE_SELECTION_EMPTY','No native source edition is selected. Reported counts require their own attributed source.');
 const other=definition.template.endsWith('all-sources'),update=definition.template.startsWith('update-');
 const routeMetric={database:'database_results',register:'register_results',website:'website_results',
 organisation:'organisation_results',citation:'citations_results',other:'other_results'};
 for(const [kind,id]of Object.entries(routeMetric))put(id,routed.filter(v=>v.route.kind===kind).map(v=>v.occurrenceId),
 {complete:routesComplete,note:'Selected retained record occurrences assigned to this identification method.'});
 if(!other&&routed.some(v=>v.lane==='other'))add('OTHER_ROUTE_OUTSIDE_TEMPLATE',
 'The selected source has other-method records. Choose the template that displays this route.',{level:'error'});
 const databaseRecords=routed.filter(v=>v.lane==='databases'),allClassified=databaseRecords.every(v=>v.disposition!=='unassigned');
 for(const[kind,id]of [['duplicate','duplicates'],['automation','excluded_automatic'],['other-removal','excluded_other']])
 put(id,databaseRecords.filter(v=>v.disposition===kind).map(v=>v.occurrenceId),{complete:routesComplete&&allClassified,
 note:'Explicit saved record-disposition decisions.'});
 const candidates=databaseRecords.filter(v=>v.disposition==='candidate');
 put('records_screened',candidates.filter(v=>['included','excluded'].includes(v.screening.status)).map(v=>v.occurrenceId),
 {complete:routesComplete&&allClassified&&candidates.every(v=>['included','excluded'].includes(v.screening.status)),
 note:'Records with complete current resolutions in the mapped original screening stages.'});
 put('records_excluded',candidates.filter(v=>v.screening.status==='excluded').map(v=>v.occurrenceId),
 {complete:metrics.get('records_screened').value!==null,note:'Current original screening exclusions, counted once per record occurrence.'});
 for(const[lane,prefix]of [['databases','dbr'],['other','other']]){
 const picked=reports.filter(v=>v.lane===lane&&v.screening!=='excluded');
 const laneClassified=routed.filter(v=>v.lane===lane).every(v=>v.disposition!=='unassigned');
 const known=routesComplete&&laneClassified&&picked.every(v=>v.retrieval!=='unknown'&&v.assessment!=='conflict');
 for(const row of picked.filter(v=>v.retrieval==='not-sought'))add('REPORT_RETRIEVAL_NOT_COMPLETED',
 'A candidate report was not sought. Resolve or explain its position before marking the reporting complete.',{reportKey:row.reportKey});
 put(prefix+'_sought_reports',picked.filter(v=>['sought','retrieved','not-retrieved'].includes(v.retrieval)).map(v=>v.reportKey),
 {complete:known,note:'Distinct retained report keys with a recorded retrieval attempt.'});
 put(prefix+'_notretrieved_reports',picked.filter(v=>v.retrieval==='not-retrieved').map(v=>v.reportKey),
 {complete:known,note:'Explicit source-attributed retrieval outcomes; reviewer unavailability alone does not assign this count.'});
 const assessed=picked.filter(v=>v.retrieval==='retrieved'&&['included','excluded'].includes(v.assessment));
 const assessmentsComplete=known&&picked.every(v=>['not-sought','not-retrieved'].includes(v.retrieval)||
 v.retrieval==='retrieved'&&['included','excluded'].includes(v.assessment));
 put(prefix+'_assessed',assessed.map(v=>v.reportKey),{complete:assessmentsComplete,note:'Distinct retrieved reports with complete current full-text resolutions.'});
 put(prefix+'_excluded',assessed.filter(v=>v.assessment==='excluded').map(v=>v.reportKey),{complete:assessmentsComplete,
 note:'One current original exclusion reason per distinct assessed report.'});
 }
 const includedReports=reports.filter(v=>v.included),includedStudies=studies.filter(v=>v.included);
 const reportKeys=includedReports.map(v=>v.reportKey),studyIds=includedStudies.map(v=>v.id);
 const includedComplete=['dbr_assessed','dbr_excluded',...(other?['other_assessed','other_excluded']:[])].every(id=>metrics.get(id).value!==null);
 const studiesComplete=includedComplete&&includedReports.every(v=>v.studyIds.length>0);
 const previous=basis.previous,priorStudies=previous?.studyIds??[],priorReports=previous?.reportKeys??[];
 const mappedStudy=new Map(definition.previous.studyLinks.map(v=>[v.current,v.previous]));
 const mappedReport=new Map(definition.previous.reportLinks.map(v=>[v.current,v.previous]));
 for(const link of definition.previous.studyLinks)need(studyIds.includes(link.current)&&priorStudies.includes(link.previous),'FLOW_PREVIOUS_STUDY_LINK_INVALID');
 for(const link of definition.previous.reportLinks)need(reportKeys.includes(link.current)&&priorReports.includes(link.previous),'FLOW_PREVIOUS_REPORT_LINK_INVALID');
 for(const id of definition.previous.studyIdsRemoved)need(priorStudies.includes(id),'FLOW_PREVIOUS_STUDY_REMOVAL_INVALID');
 for(const id of definition.previous.reportKeysRemoved)need(priorReports.includes(id),'FLOW_PREVIOUS_REPORT_REMOVAL_INVALID');
 const newStudies=studyIds.filter(id=>!priorStudies.includes(id)&&!mappedStudy.has(id));
 const newReports=reportKeys.filter(id=>!priorReports.includes(id)&&!mappedReport.has(id));
 const priorCount=id=>previous?.counts.find(v=>v.id===id)?.value??null;
 const priorKnown=!update||Boolean(previous),priorStudyIdentitiesComplete=!update||Boolean(previous)&&priorCount('total_studies')===priorStudies.length;
 const priorReportIdentitiesComplete=!update||Boolean(previous)&&priorCount('total_reports')===priorReports.length;
 const oldStudies=put('previous_studies',update?priorStudies:[],{complete:priorKnown,note:'The selected previous edition retains its actual count and known identities.'});
 const oldReports=put('previous_reports',update?priorReports:[],{complete:priorKnown});
 if(update&&previous){
 for(const [metric,id]of [[oldStudies,'total_studies'],[oldReports,'total_reports']]){
 metric.value=metric.derivedValue=priorCount(id);metric.mode='retained-report';
 metric.basis={flowId:previous.flowId,editionId:previous.editionId,reportSha256:previous.reportSha256,metric:id};
 }
 }
 put('previous_studies_removed',update?definition.previous.studyIdsRemoved:[],{complete:priorKnown});
 put('previous_reports_removed',update?definition.previous.reportKeysRemoved:[],{complete:priorKnown});
 put('previous_reports_found',update?reportKeys.filter(id=>priorReports.includes(id)||mappedReport.has(id)):[],
 {complete:includedComplete&&priorReportIdentitiesComplete,note:'Current included reports explicitly identified in the previous review. This is an accounting aid, not a separate PRISMA diagram box.'});
 put('new_studies',update?newStudies:studyIds,{complete:studiesComplete&&priorStudyIdentitiesComplete});
 put('new_reports',update?newReports:reportKeys,{complete:includedComplete&&priorReportIdentitiesComplete});
 const retainedPriorStudies=priorStudies.filter(id=>!definition.previous.studyIdsRemoved.includes(id));
 const retainedPriorReports=priorReports.filter(id=>!definition.previous.reportKeysRemoved.includes(id));
 const effectiveStudyIds=distinct([...(update?retainedPriorStudies:[]),...studyIds.map(id=>mappedStudy.get(id)??id)]);
 const effectiveReportKeys=distinct([...(update?retainedPriorReports:[]),...reportKeys.map(id=>mappedReport.get(id)??id)]);
 const priorLinks=previous?.reportStudyLinks??[];
 const currentLinks=includedStudies.flatMap(study=>study.includedReportKeys.map(reportKey=>({
 studyId:mappedStudy.get(study.id)??study.id,reportKey:mappedReport.get(reportKey)??reportKey,
 mode:'derived',sourceStudyId:study.id,sourceReportKey:reportKey,basis:{sourceBasisId:basis.id}})));
 const retainedLinks=update?priorLinks.filter(v=>effectiveStudyIds.includes(v.studyId)&&effectiveReportKeys.includes(v.reportKey)).map(v=>({
 ...clone(v),mode:'retained-report',basis:{previousEditionId:previous.editionId,reportSha256:previous.reportSha256,
 original:clone(v.basis??null)}})):[];
 const overriddenReports=new Set(definition.previous.membership.map(v=>v.reportKey));
 const reportedLinks=definition.previous.membership.map(v=>{
 need(effectiveStudyIds.includes(v.studyId)&&effectiveReportKeys.includes(v.reportKey),'FLOW_PREVIOUS_MEMBERSHIP_ID_UNKNOWN');
 return{...clone(v),mode:'reported'};
 });
 const reportStudyLinks=[...retainedLinks,...currentLinks].filter(v=>!overriddenReports.has(v.reportKey)).concat(reportedLinks);
 const edgeMap=new Map();for(const edge of reportStudyLinks){
 const key=edge.studyId+'\n'+edge.reportKey;if(!edgeMap.has(key))edgeMap.set(key,{studyId:edge.studyId,reportKey:edge.reportKey,provenance:[]});
 edgeMap.get(key).provenance.push(clone(edge));
 }
 const membership=[...edgeMap.values()];
 for(const reportKey of effectiveReportKeys.filter(id=>!membership.some(v=>v.reportKey===id))){
 const priorEdges=priorLinks.filter(v=>v.reportKey===reportKey);
 add('INCLUDED_REPORT_WITHOUT_SURVIVING_STUDY',
 'This included report has no surviving included study link. Retain an original study link or provide a source-attributed reporting correction.',
 {level:priorEdges.length?'error':'warning',reportKey,previousStudyIds:priorEdges.map(v=>v.studyId)});
 }
 for(const studyId of effectiveStudyIds.filter(id=>!membership.some(v=>v.studyId===id))){
 const priorEdges=priorLinks.filter(v=>v.studyId===studyId);
 add('INCLUDED_STUDY_WITHOUT_RETAINED_REPORT',
 'This included study has no retained included report. Reconcile its original report linkage and carry-forward decision.',
 {level:priorEdges.length?'error':'warning',studyId,previousReportKeys:priorEdges.map(v=>v.reportKey)});
 }
 const linksComplete=effectiveStudyIds.every(id=>membership.some(v=>v.studyId===id))&&
 effectiveReportKeys.every(id=>membership.some(v=>v.reportKey===id))&&priorStudyIdentitiesComplete&&priorReportIdentitiesComplete;
 put('total_studies',effectiveStudyIds,{complete:studiesComplete&&priorStudyIdentitiesComplete});
 put('total_reports',effectiveReportKeys,{complete:includedComplete&&priorReportIdentitiesComplete});
 if(update&&previous&&(!priorStudyIdentitiesComplete||!priorReportIdentitiesComplete))add('PREVIOUS_IDENTITIES_PARTIAL',
 'The previous report includes attributed counts without every native identity. Preserve those counts and attribute the update overlap and totals.');
 if(update&&!previous)add('PREVIOUS_FLOW_NOT_SELECTED','Select the previous saved flow or attribute all previous and total counts to a documented source.');
 if(previous&&previous.status!=='reviewed')add('PREVIOUS_FLOW_WAS_NOT_REVIEWED','The selected previous edition had not been marked reviewed.',{editionId:previous.editionId});
 if(definition.previous.studyIdsRemoved.length||definition.previous.reportKeysRemoved.length)
 if(!definition.previous.reason.trim()||!definition.previous.basis.locator.trim()||
 !(definition.previous.basis.reference.trim()||definition.previous.basis.editionIds.length||definition.previous.basis.occurrenceIds.length))add('PREVIOUS_REMOVAL_BASIS_REQUIRED',
 'Give the source and reason for omitting prior included studies or reports.',{level:'error'});
 for(const override of definition.reportedCounts){
 const metric=metrics.get(override.metric);metric.value=override.value;metric.mode='reported';
 metric.basis=clone(override.basis);metric.reason=override.reason;
 metric.difference=override.value===null||metric.derivedValue===null?null:override.value-metric.derivedValue;
 }
 if(!other&&['website_results','organisation_results','citations_results','other_results','other_sought_reports',
 'other_notretrieved_reports','other_assessed','other_excluded'].some(id=>(metrics.get(id).value??0)>0))
 add('REPORTED_OTHER_ROUTE_OUTSIDE_TEMPLATE','Other-method counts require the template that displays this route.',{level:'error'});
 const exclusionReasons=[];
 for(const lane of ['databases','other']){
 const original=reports.filter(v=>v.lane===lane&&v.retrieval==='retrieved'&&v.assessment==='excluded');
 const reasons=new Map();
 for(const row of original){const label=row.excludedReason??'Reason not recorded';
 if(!reasons.has(label))reasons.set(label,[]);reasons.get(label).push(row.reportKey);}
 const declared=definition.exclusionReasons.filter(v=>v.lane===lane);
 if(declared.length)exclusionReasons.push(...declared.map(v=>({...clone(v),mode:'reported',reportKeys:reasons.get(v.label)??[]})));
 else exclusionReasons.push(...[...reasons].map(([label,keys])=>({lane,label,value:keys.length,mode:'derived',reportKeys:keys,basis:[],reason:''})));
 }
 const counts=[...metrics.values()];
 const value=id=>metrics.get(id).value;
 const equation=(code,left,right,why,required=true)=>{
 const values=[...left,...right].map(([id])=>value(id));
 if(values.some(v=>v===null)){if(required)add(code+'_UNRESOLVED',why+' One or more counts are not yet known.',{metricIds:distinct([...left,...right].map(v=>v[0]))});return;}
 const sum=items=>items.reduce((n,[id,sign=1])=>n+value(id)*sign,0);
 const a=sum(left),b=sum(right);
 if(a!==b)add(code,why,{level:'error',left:a,right:b,difference:a-b,metricIds:distinct([...left,...right].map(v=>v[0]))});
 };
 equation('RECORD_ACCOUNTING',[['database_results'],['register_results']],
 [['duplicates'],['excluded_automatic'],['excluded_other'],['records_screened']],
 'Identified database/register records must equal pre-screen removals plus screened records.');
 if(value('records_screened')!==null&&value('records_excluded')!==null&&value('records_excluded')>value('records_screened'))
 add('SCREENING_EXCLUSIONS_EXCEED_RECORDS','Screening exclusions exceed the screened record count.',{level:'error',metricIds:['records_screened','records_excluded']});
 for(const[lane,prefix]of [['databases','dbr'],...(other?[['other','other']]:[])]){
 equation('RETRIEVAL_ACCOUNTING_'+prefix,[[prefix+'_sought_reports']],[[prefix+'_notretrieved_reports'],[prefix+'_assessed']],
 'Reports sought must equal reports not retrieved plus reports assessed in the completed flow.');
 const assessed=value(prefix+'_assessed'),excluded=value(prefix+'_excluded');
 if(assessed!==null&&excluded!==null&&excluded>assessed)add('EXCLUSIONS_EXCEED_ASSESSED_'+prefix,
 'Excluded reports exceed assessed reports.',{level:'error',metricIds:[prefix+'_assessed',prefix+'_excluded']});
 const reasons=exclusionReasons.filter(v=>v.lane===lane);
 if(excluded!==null){
 if(reasons.some(v=>v.value===null))add('EXCLUSION_REASONS_UNKNOWN_'+prefix,'A reported exclusion reason has no count.');
 else if(reasons.reduce((n,v)=>n+v.value,0)!==excluded)add('EXCLUSION_REASON_TOTAL_'+prefix,
 'The full-text exclusion reasons must sum to the corresponding excluded-report count.',{level:'error',metricIds:[prefix+'_excluded']});
 }
 }
 equation('INCLUDED_REPORT_ACCOUNTING',[['new_reports'],...(update?[['previous_reports_found']]:[])],
 [['dbr_assessed'],['dbr_excluded',-1],...(other?[['other_assessed'],['other_excluded',-1]]:[])],
 'Current included reports must equal assessed reports minus exclusions. In an update, current reports already included previously are counted separately from new reports.');
 if(update&&value('previous_reports_found')!==null&&value('previous_reports')!==null&&value('previous_reports_found')>value('previous_reports'))
 add('PREVIOUS_REPORT_OVERLAP_EXCEEDS_TOTAL','Previously included reports found again exceed the previous review total.',{level:'error'});
 if(update){
 for(const [kind,removed,current,mapping]of [['study',definition.previous.studyIdsRemoved,studyIds,mappedStudy],
 ['report',definition.previous.reportKeysRemoved,reportKeys,mappedReport]]){
 const rediscovered=current.filter(id=>removed.includes(mapping.get(id)??id));
 if(rediscovered.length)add('PREVIOUS_'+kind.toUpperCase()+'_REMOVAL_CONFLICT',
 'A prior '+kind+' is marked removed but remains included in the current source. Reconcile the explicit carry-forward decision.',
 {level:'error',ids:rediscovered});
 }
 }
 if(update){
 equation('UPDATED_STUDY_ACCOUNTING',[['total_studies']],[['previous_studies'],['previous_studies_removed',-1],['new_studies']],
 'Updated included-study totals must retain the declared previous, removed and new studies.');
 equation('UPDATED_REPORT_ACCOUNTING',[['total_reports']],[['previous_reports'],['previous_reports_removed',-1],['new_reports']],
 'Updated included-report totals must retain the declared previous, removed and new reports.');
 }else{
 equation('NEW_STUDY_TOTAL',[['total_studies']],[['new_studies']],'A new review has the same new and total study count.');
 equation('NEW_REPORT_TOTAL',[['total_reports']],[['new_reports']],'A new review has the same new and total report count.');
 }
 if(!definition.coverage.completeSearch)add('SEARCH_COVERAGE_NOT_DECLARED_COMPLETE',
 'The retained source selection has not been declared the complete search. The report preserves this scope.');
 if(definition.coverage.screeningBy==='mixed'){
 const a=definition.coverage.screeningByHuman,b=definition.coverage.screeningByAutomation,n=value('records_excluded');
 if(a===null||b===null)add('SCREENING_METHOD_COUNTS_REQUIRED','Record human and automated screening exclusion counts.');
 else if(n!==null&&a+b!==n)add('SCREENING_METHOD_TOTAL','Human and automated screening exclusions do not sum to the reported exclusions.',{level:'error'});
 }
 const activeIds=FLOW_METRICS.filter(v=>other||!['website_results','organisation_results','citations_results','other_results',
 'other_sought_reports','other_notretrieved_reports','other_assessed','other_excluded'].includes(v.id)).filter(v=>update||
 !v.id.startsWith('previous_')).map(v=>v.id);
 return{counts,exclusionReasons,included:{studyIds:effectiveStudyIds,reportKeys:effectiveReportKeys,
 originalStudyIds:studyIds,originalReportKeys:reportKeys,
 identityCoverage:{studies:effectiveStudyIds.length===value('total_studies'),reports:effectiveReportKeys.length===value('total_reports')},
 reportStudyLinks:membership,linksComplete},activeMetricIds:activeIds};
}
export function buildStudyFlowReport(definition,basis,{flowId=null,edition=null,status='draft',review=null}={}){
 definition=flowDefinition(definition);validateBasisReferences(definition,basis);
 const reportVersion=edition?(edition.reportVersion??1):2;
 need(reportVersion===1||reportVersion===2,'FLOW_REPORT_VERSION_INVALID');
 const rows=projectRows(definition,basis,{reportVersion}),metrics=metricProjection(definition,basis,rows);
 const issues=rows.issues.map(value=>({...value,id:'fi_'+flowDigest(value)}));
 const errors=issues.filter(v=>v.level==='error'),unknown=metrics.counts.filter(v=>metrics.activeMetricIds.includes(v.id)&&v.value===null);
 const report={schema:FLOW_SCHEMA,flowId,edition:edition?{id:edition.id,number:edition.number,
 revision:edition.revision,createdAt:edition.createdAt,actor:clone(edition.actor),reason:edition.reason,
 ...(edition.reportVersion===undefined?{}:{reportVersion:edition.reportVersion})}:null,
 dossier:{id:basis.dossierId,title:basis.question.text,revision:edition?.revision??basis.sourceRevision},
 definition:clone(definition),status,review:clone(review),
 source:{id:basis.id,sha256:basis.sha256,sourceRevision:basis.sourceRevision,
 sourceRevisionSha256:basis.sourceRevisionSha256,capturedAt:basis.capturedAt,selector:clone(basis.selector),
 question:clone(basis.question),review:clone(basis.review),editions:clone(basis.editions),workSets:clone(basis.workSets),
 protocols:clone(basis.protocols),previous:clone(basis.previous)},...metrics,
 records:rows.records,reports:rows.reports,studies:rows.studies,issues,
 summary:{records:rows.records.length,reports:rows.reports.length,explicitStudyGroups:rows.studies.length,
 errorCount:errors.length,warningCount:issues.filter(v=>v.level==='warning').length,unknownCounts:unknown.length,
 mathematicallyConsistent:errors.length===0,reportingComplete:errors.length===0&&unknown.length===0&&
 definition.coverage.completeSearch&&issues.every(v=>v.level==='info')},
 references:clone(FLOW_REFERENCES),
 method:{records:'Distinct original retained occurrences in the selected source editions.',
 reports:'Original canonical report keys, or explicitly reasoned operator report mappings. Reports are distinct from study groups.',
 studies:'Explicit original eligibility study links; record identifiers and DOIs do not independently create a study.',
 values:'Derived counts retain their members. Reported counts retain the author, source locator and reason in the original request.',
 unknown:'Missing observations remain null; a zero is a known count.',
 scope:'This reporting diagram and its completeness calculation do not certify compliance with an entire review methodology.'}};
 return{...report,reportSha256:flowDigest(report)};
}
export function studyFlowReport(state,{flowId,editionId}={}){
 const model=stateRecords(state);
 const edition=editionId?byId(model.editions,editionId,'FLOW_EDITION_NOT_FOUND'):
 byId(model.editions,byId(model.flows,flowId,'FLOW_NOT_FOUND').currentEditionId,'FLOW_EDITION_NOT_FOUND');
 if(flowId)need(edition.flowId===flowId,'FLOW_EDITION_MISMATCH');
 const basis=byId(model.bases,edition.sourceBasisId,'FLOW_SOURCE_BASIS_NOT_FOUND');
 const status=editionState(model,edition);
 return buildStudyFlowReport(edition.definition,basis,{flowId:edition.flowId,edition,...status});
}
export function previewStudyFlow(state,projected,{expectedRevision,definition,flowId,sourceMode='current',basisEditionId=null}={}){
 need(expectedRevision===state.revision,'REVISION_CONFLICT');
 const d=flowDefinition(definition),model=stateRecords(state),flow=flowId?byId(model.flows,flowId,'FLOW_NOT_FOUND'):null;
 const prior=d.previous.editionId?studyFlowReport(state,{editionId:d.previous.editionId}):null;
 const existing=flow?byId(model.editions,flow.currentEditionId,'FLOW_EDITION_NOT_FOUND'):null;
 let basis;
 if(sourceMode==='retained'){
 need(existing,'FLOW_RETAINED_SOURCE_REQUIRES_EDITION');
 const sourceEdition=basisEditionId?byId(model.editions,basisEditionId,'FLOW_EDITION_NOT_FOUND'):existing;
 need(sourceEdition.flowId===flow.id,'FLOW_EDITION_MISMATCH');
 basis=byId(model.bases,sourceEdition.sourceBasisId,'FLOW_SOURCE_BASIS_NOT_FOUND');
 need(same(basis.selector,selectedKeys(d)),'FLOW_SOURCE_SELECTION_CHANGED_REFRESH_REQUIRED');
 }else{need(sourceMode==='current'&&basisEditionId===null,'FLOW_SOURCE_MODE_INVALID');basis=captureFlowBasis(state,projected,d,{priorReport:prior});}
 return buildStudyFlowReport(d,basis,{flowId:flow?.id??null});
}
export function studyFlowSource(state,projected,{questionId,reviewId,workSetId,offset=0,limit=30}={}){
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=RESEARCH_PAGE_LIMIT,'FLOW_PAGE_INVALID');
 const m=eligibilityModel(state,projected),review=reviewId?byId(m.reviews,reviewId,'ELIGIBILITY_REVIEW_NOT_FOUND'):null;
 questionId=questionId??review?.questionId;
 if(questionId)byId(state.questions,questionId,'QUESTION_NOT_FOUND');
 if(review&&questionId)need(review.questionId===questionId,'FLOW_REVIEW_QUESTION_MISMATCH');
 const workSets=m.workSets.filter(v=>(!reviewId||v.reviewId===reviewId)&&(!questionId||v.questionId===questionId));
 if(workSetId)need(workSets.some(v=>v.id===workSetId),'ELIGIBILITY_WORKSET_NOT_FOUND');
 const rows=[...m.occurrences.values()].filter(v=>(!questionId||v.questionId===questionId)&&
 (!workSetId||workSets.find(w=>w.id===workSetId).sources.some(s=>s.occurrenceId===v.occurrenceId)));
 need(offset<=rows.length,'FLOW_PAGE_INVALID');
 return{schema:FLOW_SCHEMA,dossier:{id:state.id,title:state.title,revision:state.revision},section:'source',
 questions:clone(state.questions),reviews:clone(m.reviews.filter(v=>!questionId||v.questionId===questionId)),
 workSets:workSets.map(v=>({id:v.id,name:v.name,reviewId:v.reviewId,questionId:v.questionId,protocolId:v.protocolId,
 sourceRevision:v.sourceRevision,occurrenceIds:v.sources.map(s=>s.occurrenceId),
 editionIds:distinct(v.sources.map(s=>s.editionId))})),
 protocols:clone(m.protocols.filter(p=>workSets.some(w=>w.protocolId===p.id))),
 editions:state.editions.filter(v=>v.mode==='retained'&&(!questionId||v.questionId===questionId)).map(v=>({
 id:v.id,questionId:v.questionId,label:v.label,provider:v.provider,raw:clone(v.raw),
 sourceReference:v.sourceReference??'',occurrenceCount:[...m.occurrences.values()].filter(o=>o.editionId===v.id).length})),
 items:clone(rows.slice(offset,offset+limit)),offset,limit,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null};
}
export function studyFlowPage(state,{flowId,editionId,section='overview',offset=0,limit=30}={}){
 need(FLOW_SECTIONS.includes(section),'FLOW_SECTION_INVALID');
 need(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=RESEARCH_PAGE_LIMIT,'FLOW_PAGE_INVALID');
 const model=stateRecords(state),flow=flowId?byId(model.flows,flowId,'FLOW_NOT_FOUND'):null;
 const selectedEdition=editionId?byId(model.editions,editionId,'FLOW_EDITION_NOT_FOUND'):
 flow?byId(model.editions,flow.currentEditionId,'FLOW_EDITION_NOT_FOUND'):null;
 const report=selectedEdition?studyFlowReport(state,{flowId:flow?.id,editionId:selectedEdition.id}):null;
 const flows=model.flows.map(v=>{const e=byId(model.editions,v.currentEditionId,'FLOW_EDITION_NOT_FOUND');
 return{...clone(v),...editionState(model,e),editionCount:v.editionIds.length};});
 const editions=model.editions.filter(v=>!flowId||v.flowId===flowId).map(v=>({
 id:v.id,flowId:v.flowId,number:v.number,name:v.definition.name,revision:v.revision,
 sourceBasisId:v.sourceBasisId,createdAt:v.createdAt,actor:clone(v.actor),reason:v.reason,...editionState(model,v)}));
 const values=section==='flows'?flows:section==='editions'?editions:section==='operations'?
 model.operations.filter(v=>!flowId||v.flowId===flowId):section==='overview'?[]:report?.[section]??[];
 need(offset<=values.length,'FLOW_PAGE_INVALID');
 return{schema:FLOW_SCHEMA,dossier:{id:state.id,title:state.title,revision:state.revision},
 section,flowId:report?.flowId??null,editionId:selectedEdition?.id??null,flows,editions,
 ...(report?{definition:report.definition,status:report.status,review:report.review,summary:report.summary,
 source:report.source,counts:report.counts,exclusionReasons:report.exclusionReasons,reportSha256:report.reportSha256,
 activeMetricIds:report.activeMetricIds}:{}),items:clone(values.slice(offset,offset+limit)),
 offset,limit,total:values.length,nextOffset:offset+limit<values.length?offset+limit:null};
}
export function recordStudyFlowOperation(state,projected,input,createdAt,{reportVersion=2}={}){
 need(reportVersion===1||reportVersion===2,'FLOW_REPORT_VERSION_INVALID');
 const request=flowInput(input);need(state.revision===request.expectedRevision,'REVISION_CONFLICT');
 need(typeof createdAt==='string'&&Number.isFinite(Date.parse(createdAt)),'FLOW_TIME_INVALID');
 need(!list(state.studyFlowEvents).some(v=>v.requestId===request.requestId),'FLOW_REQUEST_ALREADY_RECORDED');
 const model=stateRecords(state),flow=request.flowId?byId(model.flows,request.flowId,'FLOW_NOT_FOUND'):null;
 const flowId=flow?.id??entityId('fl',state,request),originalRevisionSha256=digest(jsonBytes(state));
 let result;
 if(request.action==='save'){
 const definition=request.data.definition,previous=flow?byId(model.editions,flow.currentEditionId,'FLOW_EDITION_NOT_FOUND'):null;
 need((previous?.id??null)===request.data.supersedes,'FLOW_EDITION_CHANGED');
 if(flow)need(flow.questionId===definition.questionId,'FLOW_QUESTION_CHANGED');
 const priorReport=definition.previous.editionId?studyFlowReport(state,{editionId:definition.previous.editionId}):null;
 let basis,newBasis=false;
 if(request.data.sourceMode==='retained'){
 need(previous,'FLOW_RETAINED_SOURCE_REQUIRES_EDITION');
 const sourceEdition=request.data.basisEditionId?byId(model.editions,request.data.basisEditionId,'FLOW_EDITION_NOT_FOUND'):previous;
 need(sourceEdition.flowId===flow.id,'FLOW_EDITION_MISMATCH');
 basis=byId(model.bases,sourceEdition.sourceBasisId,'FLOW_SOURCE_BASIS_NOT_FOUND');
 need(same(basis.selector,selectedKeys(definition)),'FLOW_SOURCE_SELECTION_CHANGED_REFRESH_REQUIRED');
 }else{basis=captureFlowBasis(state,projected,definition,{id:entityId('fb',state,request),priorReport});newBasis=true;}
 validateBasisReferences(definition,basis);
 const edition={id:entityId('fe',state,request),flowId,number:(previous?.number??0)+1,definition:clone(definition),
 definitionSha256:flowDigest(definition),sourceBasisId:basis.id,supersedes:previous?.id??null,
 reason:request.data.reason,actor:clone(request.actor),createdAt,originalRevision:state.revision,revision:state.revision+1,
 ...(reportVersion===2?{reportVersion}: {})};
 // Derive the whole projection before committing; malformed bindings are not stored as a later read failure.
 const report=buildStudyFlowReport(definition,basis,{flowId,edition});
 result={...(newBasis?{basis}:{}),edition,summary:report.summary,reportSha256:report.reportSha256};
 if(request.data.importFile){
 const f=request.data.importFile;result.importFile={filename:f.filename,contentType:f.contentType,
 bytes:Buffer.byteLength(f.body),sha256:digest(Buffer.from(f.body)),body:f.body};
 }
 }else{
 need(flow,'FLOW_NOT_FOUND');
 const edition=byId(model.editions,request.data.editionId,'FLOW_EDITION_NOT_FOUND');
 need(edition.flowId===flow.id&&flow.currentEditionId===edition.id,'FLOW_EDITION_CHANGED');
 const report=studyFlowReport(state,{flowId:flow.id,editionId:edition.id});
 if(request.action==='review')need(report.summary.mathematicallyConsistent,'FLOW_ACCOUNTING_REQUIRES_CORRECTION');
 result={review:{id:entityId('fr',state,request),flowId,editionId:edition.id,action:request.action,
 actor:clone(request.actor),reason:request.data.reason,createdAt,originalRevision:state.revision,
 revision:state.revision+1,reportSha256:report.reportSha256,
 reportingComplete:report.summary.reportingComplete,unknownCounts:report.summary.unknownCounts}};
 }
 const payload={schema:FLOW_OPERATION_SCHEMA,id:entityId('fo',state,request),dossierId:state.id,flowId,
 requestId:request.requestId,requestSha256:flowDigest(request),request:clone(request),action:request.action,
 actor:clone(request.actor),createdAt,originalRevision:state.revision,revision:state.revision+1,originalRevisionSha256,result};
 const operation={...payload,sha256:flowDigest(payload)};
 state.studyFlowEvents=[...list(state.studyFlowEvents),operation];return operation;
}
export function validateStudyFlowState(state,editions,knownOccurrences){
 need(state.studyFlowEvents===undefined||Array.isArray(state.studyFlowEvents),'PORTABLE_FLOW_EVENTS_INVALID');
 const requests=new Set(),events=new Set(),bases=new Map(),flowEditions=new Map();
 for(const event of list(state.studyFlowEvents)){
 need(object(event)&&event.schema===FLOW_OPERATION_SCHEMA&&event.dossierId===state.id&&object(event.result)&&
 Number.isSafeInteger(event.originalRevision)&&event.originalRevision>=1&&event.revision===event.originalRevision+1&&
 event.revision<=state.revision&&typeof event.createdAt==='string'&&Number.isFinite(Date.parse(event.createdAt)),
 'PORTABLE_FLOW_EVENT_INVALID');
 const request=flowInput(event.request);
 need(event.id===entityId('fo',state,request)&&event.requestId===request.requestId&&
 event.requestSha256===flowDigest(request)&&same(event.request,request)&&
 event.originalRevision===request.expectedRevision&&event.action===request.action&&same(event.actor,request.actor),
 'PORTABLE_FLOW_REQUEST_CHANGED');
 need(!requests.has(event.requestId)&&!events.has(event.id),'PORTABLE_FLOW_EVENT_DUPLICATE');
 requests.add(event.requestId);events.add(event.id);
 const {sha256,...payload}=event;need(sha256===flowDigest(payload),'PORTABLE_FLOW_EVENT_CHANGED');
 const basis=event.result.basis;
 if(basis){
 const {sha256,...value}=basis;
 need(sha256===flowDigest(value)&&basis.dossierId===state.id&&basis.sourceRevision===event.originalRevision&&
 basis.sourceRevisionSha256===event.originalRevisionSha256&&!bases.has(basis.id),'PORTABLE_FLOW_SOURCE_CHANGED');
 for(const source of basis.occurrences){
 const original=editions.get(source.editionId);
 need(original?.mode==='retained'&&source.questionId===original.questionId&&
 source.sourceSha256===original.raw.sha256&&source.sourceBytes===original.raw.bytes&&
 source.occurrenceId==='o_'+digest(Buffer.from(source.editionId+'\n'+source.key))&&
 knownOccurrences.get(source.occurrenceId)===source.questionId,'PORTABLE_FLOW_OCCURRENCE_CHANGED');
 }
 if(basis.previous)need(flowEditions.has(basis.previous.editionId),'PORTABLE_FLOW_PREVIOUS_EDITION_MISSING');
 bases.set(basis.id,basis);
 }
 const edition=event.result.edition;
 if(edition){need(!flowEditions.has(edition.id)&&edition.flowId===event.flowId&&bases.has(edition.sourceBasisId)&&
 edition.definitionSha256===flowDigest(flowDefinition(edition.definition))&&
 (edition.reportVersion===undefined||edition.reportVersion===2),'PORTABLE_FLOW_EDITION_CHANGED');
 flowEditions.set(edition.id,edition);}
 if(event.result.review)need(flowEditions.has(event.result.review.editionId),'PORTABLE_FLOW_REVIEW_EDITION_MISSING');
 if(event.result.importFile){const f=event.result.importFile;
 need(typeof f.body==='string'&&Buffer.byteLength(f.body)===f.bytes&&digest(Buffer.from(f.body))===f.sha256,
 'PORTABLE_FLOW_IMPORT_CHANGED');}
 }
}
export function validateStudyFlowTransition(previous,state,projected){
 const old=list(previous?.studyFlowEvents),current=list(state.studyFlowEvents);
 need(current.length>=old.length&&old.every((v,i)=>same(v,current[i])),'PORTABLE_FLOW_HISTORY_CHANGED');
 const added=current.slice(old.length);
 need(added.length<=1&&added.every(v=>v.revision===state.revision&&v.originalRevision===previous?.revision&&
 v.originalRevisionSha256===state.previous),'PORTABLE_FLOW_HISTORY_INVALID');
 if(!added.length)return;
 need(previous&&projected instanceof Map,'PORTABLE_FLOW_PREVIOUS_STATE_REQUIRED');
 const replay=clone(previous),event=added[0];
 recordStudyFlowOperation(replay,projected,event.request,event.createdAt,
 {reportVersion:event.result.edition?.reportVersion??1});
 const body=v=>Object.fromEntries(Object.entries(v).filter(([key])=>!['revision','previous','updatedAt','change'].includes(key)));
 need(same(body(replay),body(state)),'PORTABLE_FLOW_TRANSITION_CHANGED');
}
export function importedFlowCounts(body,{filename='flow-counts.csv',reference='',reason}={}){
 const parsed=parseFlowCsv(body);
 need(typeof reason==='string'&&reason.trim(),'FLOW_IMPORT_REASON_REQUIRED');
 return{importFile:{filename,contentType:'text/csv; charset=utf-8',body},
 counts:parsed.values.map(row=>({metric:row.metric,value:row.value,reason,
 basis:{editionIds:[],occurrenceIds:[],reference:reference||filename,
 locator:'CSV record '+row.row+'; column n; SHA-256 '+parsed.sha256,note:JSON.stringify(row.raw)}})),
 sha256:parsed.sha256,bytes:parsed.bytes};
}
