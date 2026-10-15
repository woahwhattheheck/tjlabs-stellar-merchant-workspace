// MIT. Exact source and original domain projections at a pinned managed edition.
import {workspaceHead,applyDomain} from '../runtime.mjs';
export function inspectRoastery(core,state,args){
 const w=core.reopen(state.carrier.session.workspace),offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const page=(rows,context={})=>({editionSha256:state.sha256,head:workspaceHead(w),collection:args.collection,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...context});
 const sections=['issues','warnings','orders','components','batches','lots','roastedStock','packagedStock'];
 if(args.collection==='captures')return page(w.captures.map(({text,...c})=>({...c,characters:text.length})));
 if(args.collection==='capture'){const capture=w.captures.find(x=>x.id===args.id);if(!capture)throw Error('Choose an original source capture');return {editionSha256:state.sha256,head:workspaceHead(w),capture};}
 if(args.collection==='tables'){if(!Object.hasOwn(core.columns,args.table))throw Error('Choose a declared table');return page(w.tables[args.table],{table:args.table,columns:core.columns[args.table],sourceCapture:w.bindings[args.table]||null});}
 if(args.collection==='plan'){const p=core.analyse(w),section=args.section||'batches';if(!sections.includes(section))throw Error('Choose a complete plan section');return page(p[section],{section,totals:p.totals});}
 if(args.collection==='frozenPlans')return page(w.frozenPlans.map(({tables,result,...p})=>({...p,totals:result.totals,batches:result.batches.length})));
 if(args.collection==='frozenPlan'){const p=w.frozenPlans.find(x=>x.id===args.id);if(!p)throw Error('Choose a frozen original plan');if(args.table){if(!Object.hasOwn(core.columns,args.table))throw Error('Choose a frozen table');return page(p.tables[args.table],{planId:p.id,table:args.table,sourceCapture:p.bindings[args.table]||null,inputIdentity:p.inputIdentity});}const section=args.section||'batches';if(!sections.includes(section))throw Error('Choose a frozen plan section');return page(p.result[section],{planId:p.id,section,reviewer:p.reviewer,note:p.note,createdAt:p.createdAt,inputIdentity:p.inputIdentity,totals:p.result.totals});}
 if(args.collection==='outcomes')return page(w.outcomes.filter(x=>!args.id||x.planId===args.id));
 if(args.collection==='outcomeReport'){const r=core.outcomes(w,args.id),section=args.section||'rows';if(!['rows','lots','coverage'].includes(section))throw Error('Choose an outcome report section');return page(r[section],{planId:r.planId,section,recorded:r.recorded,totalBatches:r.total,currentInputsMatch:r.currentInputsMatch});}
 if(args.collection==='backups')return page(state.carrier.session.backups);
 if(args.collection==='draft')return {editionSha256:state.sha256,head:workspaceHead(w),draft:state.carrier.session.draft,workspaceSession:w.session,notes:w.notes,prospectWorking:w.prospectWorking||{}};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 throw Error('Choose a declared roastery collection');
}
export function previewRoastery(core,workspace,kind,input={}){
 if(kind==='plan')return core.analyse(workspace);
 if(kind==='outcomes')return core.outcomes(workspace,input.planId);
 if(kind==='command'){const next=applyDomain(workspace,input).workspace;return {head:workspaceHead(next),plan:core.analyse(next),plans:next.frozenPlans,outcomes:next.outcomes};}
 throw Error('Choose a declared roastery preview');
}
