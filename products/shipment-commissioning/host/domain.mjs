// MIT. Paged exact original journal and frozen-reference/capture observations.
import {applyDomain,sessions,workspaceHead} from '../runtime.mjs';
export function inspectShipmentCommissioning(core,state,args){
 const s=state.carrier.session.workspace,w=s.workspace,offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose a page of 1–50 records');
 const context={editionSha256:state.sha256,head:workspaceHead(s),workspaceSha256:core.hash(w),revision:w.revision,collection:args.collection},page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 const arrays={originals:w.originals,cases:w.cases,contracts:w.contracts,runs:w.runs,captures:w.captures,effort:w.effort,operations:w.operations,backups:s.backups};
 if(Object.hasOwn(arrays,args.collection))return page(arrays[args.collection]);
 if(args.collection==='draft')return {...context,forms:s.forms,selection:s.selection,view:s.view,actor:s.actor};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 if(args.collection==='summary')return {...context,id:w.id,title:w.title,originals:w.originals.length,cases:w.cases.length,contracts:w.contracts.length,runs:w.runs.length,captures:w.captures.length,effort:w.effort.length,operations:w.operations.length};
 if(['original','case','contract','run','capture','operation','backup'].includes(args.collection)){const name={original:'originals',case:'cases',contract:'contracts',run:'runs',capture:'captures',operation:'operations',backup:'backups'}[args.collection],item=arrays[name].find(x=>(x.id||x.sha256)===args.id);if(!item)throw Error('Select an exact retained identifier');return {...context,item};}
 if(args.collection==='report'||args.collection==='findings'||args.collection==='steps'){const report=core.reportRun(w,args.runId);if(args.collection==='report')return {...context,report};return page(report[args.collection],{runId:report.run_id,basis:report.basis,complete:report.complete,referenceHash:report.reference_hash,currentReference:report.current_reference,currentReview:report.current_review});}
 if(args.collection==='effort-comparison')return {...context,result:core.effortReport(w,args.baselineRunId,args.candidateRunId)};
 if(args.collection==='observations'){const capture=w.captures.find(x=>x.id===args.id);if(!capture||!['bindings','fields','gates'].includes(args.kind))throw Error('Choose a retained capture and observation kind');return page(capture.observations[args.kind],{captureId:capture.id,originalId:capture.original_id,mappingHash:capture.mapping_hash,mapping:capture.mapping,observedAt:capture.observed_at});}
 throw Error('Choose a declared shipment collection');
}
export function previewShipmentCommissioning(core,editor,kind,input={}){
 sessions.original(editor);if(kind==='command'){const next=applyDomain(editor,input.operation);return {head:workspaceHead(next.workspace),workspaceSha256:core.hash(next.workspace.workspace),command:next.command};}
 if(kind==='report')return core.reportRun(editor.workspace,input.runId);
 if(kind==='effort-comparison')return core.effortReport(editor.workspace,input.baselineRunId,input.candidateRunId);
 throw Error('Choose a report, effort comparison or complete command preview');
}
