// MIT. Exact inventory sources, exception reviews, programme/editor and saved-request reads.
import {workspaceHead,applyDomain} from '../runtime.mjs';
export function inspectBrewery(core,state,args){
 const s=state.carrier.session,w=core.reopen(s.workspace),offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:w.head,collection:args.collection};
 const page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 if(args.collection==='editions')return page(core.editions(w).map(({sources,tables,...e})=>({...e,originals:Object.fromEntries(Object.entries(sources).map(([k,{text,...m}])=>[k,m]))})));
 if(args.collection==='commands')return page(w.commands);
 if(args.collection==='backups')return page(s.backups);
 if(args.collection==='draft')return {...context,editor:s.editor,draft:s.draft};
 if(args.collection==='profiles')return page(s.editor.programme.profiles,{prospectWorking:s.editor.prospectWorking});
 if(args.collection==='programmeSources')return page(s.editor.programme.sources);
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 const ed=core.editions(w).find(x=>x.id===args.editionId);if(!ed)throw Error('Choose a retained source edition');
 const extra={editionId:ed.id,sourceSha256:ed.sourceSha256,settings:ed.settings};
 if(['original','sourceRows'].includes(args.collection)){
  const source=ed.sources[args.kind];if(!source)throw Error('Choose an original source family present in this edition');
  if(args.collection==='original')return {...context,...extra,original:source};
  return page(core.parseCSV(source.text,core.columns[args.kind],source.name),{...extra,kind:args.kind,originalSha256:source.sha256});
 }
 const a=core.analyse(w,ed.id),detail={...extra,counts:a.counts,warnings:a.warnings};
 if(['buckets','movements','duplicates','recipes','orders','accounts','exceptions'].includes(args.collection))return page(a[args.collection],detail);
 const exception=a.exceptions.find(x=>x.id===args.exceptionId);if(!exception)throw Error('Choose an exception in this source edition');
 if(args.collection==='exception')return {...context,...detail,exception};
 if(args.collection==='reviews')return page(exception.reviewHistory,{...detail,exceptionId:exception.id,currentReview:exception.review});
 throw Error('Choose a declared brewery collection');
}
export function previewBrewery(core,workspace,kind,input={}){
 if(kind==='reconciliation')return core.analyse(workspace,input.editionId);
 if(kind==='command'){const next=applyDomain(workspace,input).workspace;return {head:next.head,revision:next.revision,reconciliation:core.analyse(next,input.kind==='receive'?input.payload.id:input.payload.editionId)};}
 throw Error('Choose a declared brewery preview');
}
