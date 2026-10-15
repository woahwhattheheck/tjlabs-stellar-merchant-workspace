// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import {applyDomain,originalSessions,workspaceHead} from '../runtime.mjs';
export function inspectMaintenanceIncidentStudy(core,state,args){
 const s=state.carrier.session,w=s.workspace.study,offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:workspaceHead(s.workspace),studySha256:core.digest(w),collection:args.collection},page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 const arrays={originals:w.originals,extracts:w.extracts,crosswalks:w.crosswalks,reviews:w.reviews,documents:w.documents,documentLinks:w.document_links,backups:s.workspace.backups,history:s.workspace.history};
 if(Object.hasOwn(arrays,args.collection))return page(arrays[args.collection]);
 if(args.collection==='draft')return {...context,drafts:s.workspace.drafts,view:s.workspace.view,selection:s.workspace.selection,actor:s.draft.actor,emergency:s.emergency,retainedEmergency:s.retainedEmergency};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 if(args.collection==='availability')return page(core.availability(w).tables);
 if(args.collection==='rows'){if(!core.KINDS.includes(args.kind)||!['source','returned'].includes(args.side))throw Error('Choose an exact record kind and side');const e=core.selected(w,args.kind,args.side);return page(core.rows(w,args.kind,args.side),{kind:args.kind,side:args.side,extract:e||null,fields:core.FIELDS[args.kind]});}
 if(args.collection==='original'||args.collection==='document'||args.collection==='extract'){const rows=args.collection==='original'?w.originals:args.collection==='document'?w.documents:w.extracts,item=rows.find(x=>x.id===args.id);if(!item)throw Error('Choose a retained exact original identifier');return {...context,[args.collection]:item};}
 if(args.collection==='plan')return {...context,plan:w.config.maintenance,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 const a=core.analyze(w),m=a.maintenance,studyContext={asOf:m.as_of,side:m.side,population:m.population,evaluation:m.evaluation,limits:m.limits};
 if(args.collection==='summary')return {...context,...studyContext,summary:m.summary,downtime:{scope:m.downtime.scope,observedIntervalRows:m.downtime.observed_interval_rows,coverage:m.downtime.coverage,totalUnionMachineMinutes:m.downtime.total_union_machine_minutes}};
 const observations={maintenanceAvailability:m.availability,incidentOutcomes:m.incidents,diagnoses:m.diagnoses,effort:m.effort,downtimeMachines:m.downtime.machines,downtimeIntervals:m.downtime.source_intervals,downtimeIssues:m.downtime.issues,issues:m.issues,knowledgeUses:m.incidents.flatMap(i=>i.procedures.map(x=>({incident_id:i.id,...x}))),handovers:m.incidents.flatMap(i=>i.handovers.map(x=>({incident_id:i.id,...x})))};
 if(Object.hasOwn(observations,args.collection))return page(observations[args.collection],studyContext);
 const summary={comparisonState:a.comparison_state,decision:a.decision,counts:a.counts,scope:a.scope};
 if(args.collection==='findings')return page(a.findings,summary);
 if(args.collection==='documentComparisons')return page(a.document_comparisons,summary);
 if(args.collection==='assessment')return {...context,result:a};
 throw Error('Choose a declared maintenance collection');
}
export function previewMaintenanceIncidentStudy(core,workspace,kind,input={}){
 if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input.operation).workspace;return {head:workspaceHead(next),result:core.analyze(next.study)};}
 throw Error('Choose a declared maintenance preview');
}
