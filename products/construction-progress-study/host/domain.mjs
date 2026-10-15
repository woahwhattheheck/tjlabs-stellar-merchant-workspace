// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import {applyDomain,originalSessions,workspaceHead} from '../runtime.mjs';
export function inspectConstructionProgressStudy(core,state,args){
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
 if(args.collection==='plan')return {...context,plan:w.config.construction,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 const a=core.analyze(w),m=a.construction,studyContext={asOf:m.as_of,decisionAt:m.decision_at,side:w.config.construction.side,population:{start:w.config.construction.population_start,end:w.config.construction.population_end,projectIds:w.config.construction.project_ids,inventoryComplete:w.config.construction.inventory_complete},limits:m.limits};
 if(args.collection==='summary')return {...context,...studyContext,summary:m.summary,effortSummary:m.effort_summary};
 const observations={constructionAvailability:m.availability,projects:m.projects,contracts:m.contracts,variations:m.variations,measurements:m.measurements,milestones:m.milestones,claims:m.claims,certificates:m.certificates,retention:m.retention,invoices:m.invoices,clientAccounting:m.accounting.client.records,supplierAccounting:m.accounting.supplier.records,reports:m.reports,effort:m.effort_summary.records,effortPairs:m.effort_summary.pairs,issues:m.issues,excluded:m.excluded,unresolved:m.unresolved};
 if(Object.hasOwn(observations,args.collection))return page(observations[args.collection],studyContext);
 if(args.collection==='accounting')return {...context,...studyContext,client:m.accounting.client,supplier:m.accounting.supplier};
 if(args.collection==='projectCosts'||args.collection==='projectRetention'){const project=m.projects.find(x=>x.id===args.id);if(!project)throw Error('Choose an exact project identifier');return {...context,...studyContext,projectId:project.id,currency:project.currency,valid:project.valid,issues:project.issues,[args.collection==='projectCosts'?'costs':'retention']:args.collection==='projectCosts'?project.costs:project.retention};}
 if(args.collection==='costLines'||args.collection==='costInvoices')return page(m.projects.flatMap(p=>(args.collection==='costLines'?p.costs.lines:p.costs.invoices).map(x=>({project_id:p.id,...x}))),studyContext);
 const summary={comparisonState:a.comparison_state,decision:a.decision,counts:a.counts,scope:a.scope};
 if(args.collection==='findings')return page(a.findings,summary);
 if(args.collection==='documentComparisons')return page(a.document_comparisons,summary);
 if(args.collection==='assessment')return {...context,result:a};
 throw Error('Choose a declared construction collection');
}
export function previewConstructionProgressStudy(core,workspace,kind,input={}){
 if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input.operation).workspace;return {head:workspaceHead(next),result:core.analyze(next.study)};}
 throw Error('Choose a declared construction preview');
}
