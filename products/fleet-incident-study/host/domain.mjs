// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import {applyDomain,originalSessions,workspaceHead} from '../runtime.mjs';
export function inspectFleetIncidentStudy(core,state,args){
 const s=state.carrier.session,w=s.workspace.study,offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:workspaceHead(s.workspace),studySha256:core.digest(w),collection:args.collection},page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 const arrays={originals:w.originals,extracts:w.extracts,crosswalks:w.crosswalks,reviews:w.reviews,documents:w.documents,documentLinks:w.document_links,backups:s.workspace.backups,history:s.workspace.history};
 if(Object.hasOwn(arrays,args.collection))return page(arrays[args.collection]);
 if(args.collection==='draft')return {...context,drafts:s.workspace.drafts,view:s.workspace.view,selection:s.workspace.selection,actor:s.draft.actor,emergency:s.emergency,retainedEmergency:s.retainedEmergency};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 if(args.collection==='availability')return page(core.availability(w).tables);
 if(args.collection==='rows'){if(!core.KINDS.includes(args.kind)||!['source','returned'].includes(args.side))throw Error('Choose an exact record kind and side');const e=core.selected(w,args.kind,args.side);return page(core.rows(w,args.kind,args.side),{kind:args.kind,side:args.side,extract:e||null,fields:core.FIELDS[args.kind],idField:core.ID_FIELDS[args.kind]});}
 if(args.collection==='original'||args.collection==='document'||args.collection==='extract'){const rows=args.collection==='original'?w.originals:args.collection==='document'?w.documents:w.extracts,item=rows.find(x=>x.id===args.id);if(!item)throw Error('Choose a retained exact original identifier');return {...context,[args.collection]:item};}
 if(args.collection==='plan')return {...context,plan:w.config.fleet,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 const a=core.analyze(w),m=a.fleet,studyContext={asOf:m.as_of,decisionAt:m.decision_at,side:w.config.fleet.side,questionIds:w.config.fleet.question_ids,limits:m.limits};
 const compact=value=>Object.fromEntries(Object.entries(value).filter(([k])=>!['records','members','pairs','inputs'].includes(k)));
 if(args.collection==='summary')return {...context,...studyContext,summary:m.summary,effortSummary:compact(m.effort),costSummary:compact(m.costs),cashSummary:compact(m.cash)};
 const observations={questions:m.questions.map(q=>({...compact(q),memberCount:q.members.length})),incidents:m.incidents,telemetry:m.telemetry,assignments:m.assignments,reports:m.reports.map(r=>({...compact(r),inputCount:r.inputs.length})),assessments:m.assessments,costs:m.costs.records,cash:m.cash.records,economicObservations:m.future_economic_observations,effort:m.effort.records,effortPairs:m.effort.pairs,issues:m.issues};
 if(Object.hasOwn(observations,args.collection))return page(observations[args.collection],studyContext);
 const questionCollections={questionMembers:null,questionOutput:'output',questionWork:'work',questionDowntime:'downtime',questionCosts:'cost',questionCash:'cash'};
 if(Object.hasOwn(questionCollections,args.collection)){const q=m.questions.find(q=>q.question_id===args.id);if(!q)throw Error('Choose an exact review question identifier');const family=questionCollections[args.collection],rows=family?q.members.flatMap(x=>(x[family]?.records||[]).map(row=>({questionId:q.question_id,memberId:x.id,assetId:x.asset_id,assignmentId:x.assignment_id,...row}))):q.members.map(x=>({...x,...Object.fromEntries(['output','work','downtime','cost','cash'].filter(k=>x[k]).map(k=>[k,compact(x[k])]))}));return page(rows,{...studyContext,question:compact(q)});}
 if(args.collection==='reportInputs'){const report=m.reports.find(r=>r.report_id===args.id);if(!report)throw Error('Choose an exact frozen report identifier');return page(report.inputs,{...studyContext,report:compact(report)});}
 const summary={comparisonState:a.comparison_state,decision:a.decision,counts:a.counts,scope:a.scope};
 if(args.collection==='findings')return page(a.findings,summary);
 if(args.collection==='documentComparisons')return page(a.document_comparisons,summary);
 if(args.collection==='assessment')return {...context,result:a};
 throw Error('Choose a declared fleet study collection');
}
export function previewFleetIncidentStudy(core,workspace,kind,input={}){
 if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input.operation).workspace;return {head:workspaceHead(next),result:core.analyze(next.study)};}
 throw Error('Choose a declared fleet study preview');
}
