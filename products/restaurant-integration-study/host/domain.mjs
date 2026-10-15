// MIT. Exact original rows, identities, report bytes and reviews from one saved edition.
import RequestForm from '../request-form.cjs';
import {applyDomain,originalSessions,workspaceHead} from '../runtime.mjs';
export function inspectRestaurantIntegrationStudy(core,state,args){
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
 if(args.collection==='plan')return {...context,plan:w.config.restaurant,sourceSelection:w.config.selection.source,returnedSelection:w.config.selection.returned};
 if(args.collection==='preparedRequests')return page(Object.entries(s.workspace.drafts).filter(([key])=>key.startsWith('prepared-operation:')).map(([key,operation])=>({key,operation})));
 const a=core.analyze(w),m=a.restaurant,studyContext={asOf:m.as_of,side:w.config.restaurant.side,population:m.population};
 const compact=(value,omit=[])=>Object.fromEntries(Object.entries(value).filter(([k])=>!['records','members','groups','inputs','changes','attempts','packet','evaluations',...omit].includes(k)));
 if(args.collection==='summary')return {...context,...studyContext,usage:{accounts:m.usage.accounts,actualLedger:m.usage.actual_ledger,interpretation:m.usage.interpretation},effort:compact(m.effort)};
 const observations={cases:m.cases.map(x=>({...compact(x),evaluationCount:x.evaluations.length})),requestJournals:m.requests.map(x=>({...compact(x),attemptCount:x.attempts.length})),selections:m.selections,mappings:m.mappings,adoptions:m.adoptions,evaluations:m.evaluations,corpusSnapshots:m.corpus.snapshots.map(x=>({...compact(x),memberCount:x.members.length})),changePages:m.corpus.pages.map(x=>({...compact(x),changeCount:x.changes?.length||0})),changeRuns:m.corpus.runs.map(x=>({...compact(x),changeCount:x.changes.length})),dispatchEstimates:m.usage.dispatched_estimates,usageAccounts:Object.entries(m.usage.accounts).map(([accountAlias,x])=>({accountAlias,...x})),unknownPrices:m.usage.unknown_prices,usageObservations:m.usage.observations,actualLedger:Object.entries(m.usage.actual_ledger).map(([accountAlias,x])=>({accountAlias,...x})),effort:m.effort.records,effortGroups:m.effort.groups,reports:m.reports.map(x=>({...compact(x),inputCount:x.inputs.length})),issues:m.issues};
 if(Object.hasOwn(observations,args.collection))return page(observations[args.collection],studyContext);
 if(['journal','journalEvents','journalAttempts'].includes(args.collection)){const q=m.requests.find(x=>x.request_id===args.id);if(!q)throw Error('Choose an exact request identifier');const extra={...studyContext,request:compact(q)};if(args.collection==='journal')return {...context,...extra,journal:q.packet};return page(args.collection==='journalEvents'?q.packet?.events||[]:q.attempts,extra);}
 if(args.collection==='caseEvaluations'){const q=m.cases.find(x=>x.case_id===args.id);if(!q)throw Error('Choose an exact case identifier');return page(q.evaluations,{...studyContext,case:compact(q)});}
 if(args.collection==='corpusMembers'){const q=m.corpus.snapshots.find(x=>x.snapshot_id===args.id);if(!q)throw Error('Choose an exact corpus snapshot');return page(q.members,{...studyContext,snapshot:compact(q)});}
 if(args.collection==='changedMappings'){const q=m.corpus.snapshots.find(x=>x.snapshot_id===args.id);if(!q)throw Error('Choose an exact successor corpus snapshot');return page(q.previous_comparison?.changed||[],{...studyContext,snapshot:compact(q),comparison:q.previous_comparison?compact(q.previous_comparison,['changed']):null});}
 if(args.collection==='pageChanges'){const q=m.corpus.pages.find(x=>x.page_id===args.id);if(!q)throw Error('Choose an exact change-feed page');return page(q.changes||[],{...studyContext,page:compact(q)});}
 if(args.collection==='runChanges'){const q=m.corpus.runs.find(x=>x.run_id===args.id);if(!q)throw Error('Choose an exact change-feed run');return page(q.changes,{...studyContext,run:compact(q)});}
 if(args.collection==='reportReviews'){const q=m.reports.find(x=>x.report_id===args.id);if(!q)throw Error('Choose an exact frozen report');return page(q.reviews,{...studyContext,report:compact(q,['reviews'])});}
 if(args.collection==='reportInputs'){const q=m.reports.find(x=>x.report_id===args.id);if(!q)throw Error('Choose an exact frozen report');return page(q.inputs,{...studyContext,report:compact(q)});}
 const summary={comparisonState:a.comparison_state,decision:a.decision,counts:a.counts,scope:a.scope};
 if(args.collection==='findings')return page(a.findings,summary);
 if(args.collection==='documentComparisons')return page(a.document_comparisons,summary);
 if(args.collection==='assessment')return {...context,result:a};
 throw Error('Choose a declared restaurant study collection');
}
export function previewRestaurantIntegrationStudy(core,workspace,kind,input={}){
 if(kind==='prepare-request')return RequestForm.build(workspace.study,input);
 if(kind==='assessment')return core.analyze(workspace.study);
 if(kind==='command'){const next=applyDomain(workspace,input.operation).workspace;return {head:workspaceHead(next),result:core.analyze(next.study)};}
 throw Error('Choose a declared restaurant study preview');
}
