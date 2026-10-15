// MIT. Complete original maker sources, exact-date production and observation/decision projections.
import {applyDomain} from '../runtime.mjs';
export function inspectMakerProduction(core,state,args){
 const s=state.carrier.session,w=core.reopen(s.workspace),offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:w.head,collection:args.collection},page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 if(args.collection==='editions')return page(w.editions.map(({sources,...e})=>({...e,originals:Object.fromEntries(Object.entries(sources).map(([k,{text,...m}])=>[k,m]))})));
 if(args.collection==='decisions')return page(w.decisions);
 if(args.collection==='backups')return page(s.backups);
 if(args.collection==='draft')return {...context,editor:s.editor,draft:s.draft};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 const ed=w.editions.find(x=>x.id===args.editionId);if(!ed)throw Error('Choose a retained maker source edition');
 if(['original','sourceRows'].includes(args.collection)){
 if(!Object.hasOwn(core.columns,args.table))throw Error('Choose one of the eight original tables');
 if(args.collection==='original')return {...context,editionId:ed.id,sourceHash:ed.sourceHash,original:ed.sources[args.table]};
 return page(core.parseCSV(ed.sources[args.table].text,args.table),{editionId:ed.id,sourceHash:ed.sourceHash,originalSha256:ed.sources[args.table].sha256,table:args.table,columns:core.columns[args.table]});
 }
 const p=core.plan(w,{editionId:ed.id,asOf:args.asOf}),extra={editionId:ed.id,asOf:p.asOf,sourceHash:p.sourceHash,fingerprint:p.fingerprint,summary:p.summary};
 const sections={orders:'orders',batches:'batches',stages:'stages',capacity:'capacity',observations:'observations',futureObservations:'futureObservations',unallocatedStock:'unallocatedStock',attention:'attention',currentDecisions:'decisions',decisionHistory:'decisionHistory'};
 if(Object.hasOwn(sections,args.collection))return page(p[sections[args.collection]],extra);
 const detail={order:['orders','orderId'],batch:['batches','batchId'],resourceDay:['capacity','id']};
 if(Object.hasOwn(detail,args.collection)){const [table,key]=detail[args.collection],row=p[table].find(x=>x[key]===args.id);if(!row)throw Error('Choose an item in this exact production plan');return {...context,...extra,[args.collection]:row};}
 if(args.collection==='stage'){const stage=p.stages.find(x=>x.batchId===args.id&&x.stageId===args.stageId);if(!stage)throw Error('Choose an exact batch and stage');return {...context,...extra,stage};}
 throw Error('Choose a declared maker production collection');
}
export function previewMakerProduction(core,workspace,kind,input={}){
 if(kind==='plan')return core.plan(workspace,input);
 if(kind==='command'){const next=applyDomain(workspace,input.operation).workspace;return {head:next.head,plan:core.plan(next,input.selection)};}
 throw Error('Choose a declared maker production preview');
}
