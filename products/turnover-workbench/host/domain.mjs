// MIT. Complete pinned original source, frame mappings, review and receiving projections.
import {workspaceHead,applyDomain} from '../runtime.mjs';
export function inspectTurnover(core,state,args){
 const s=state.carrier.session,w=core.reopen(s.workspace),offset=args.offset??0,limit=args.limit??25;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose an exact page from 1 to 50 rows');
 const context={editionSha256:state.sha256,head:w.head,collection:args.collection};
 const page=(rows,extra={})=>({...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit),...extra});
 if(args.collection==='editions')return page(core.editions(w).map(({old,next,cues,...e})=>({...e,originals:Object.fromEntries(Object.entries({old,next,cues}).map(([k,{text,...m}])=>[k,m]))})));
 if(args.collection==='commands')return page(w.commands);
 if(args.collection==='backups')return page(s.backups);
 if(args.collection==='draft')return {...context,editor:s.editor,draft:s.draft};
 if(args.collection==='requests')return page([...state.receipts.map(x=>({...x,outcome:'COMMITTED'})),...state.rejections.map(x=>({...x,outcome:'REJECTED_NOT_COMMITTED'}))]);
 const ed=core.editions(w).find(x=>x.id===args.editionId);if(!ed)throw Error('Choose a retained source edition');
 if(args.collection==='original'){if(!['old','next','cues'].includes(args.kind))throw Error('Choose an original old cut, new cut or cue file');return {...context,editionId:ed.id,pairSha256:ed.pairSha256,rate:ed.rate,original:ed[args.kind]};}
 if(args.collection==='sourceRows'){if(!['old','next','cues'].includes(args.kind))throw Error('Choose original source rows');return page(core.parseCSV(ed[args.kind].text,args.kind==='cues'?core.cueColumns:core.eventColumns.slice(0,7),ed[args.kind].name),{editionId:ed.id,kind:args.kind,pairSha256:ed.pairSha256,originalSha256:ed[args.kind].sha256,rate:ed.rate});}
 const c=core.compare(w,ed.id),extra={editionId:ed.id,pairSha256:ed.pairSha256,rate:c.rate,counts:c.counts};
 if(args.collection==='events')return page(c.eventChanges,extra);
 if(args.collection==='added')return page(c.addedEvents,extra);
 if(args.collection==='cues')return page(c.cues,extra);
 const cue=c.cues.find(x=>x.cueId===args.cueId);if(!cue)throw Error('Choose an original cue in this source edition');
 if(args.collection==='cue')return {...context,...extra,cue};
 if(args.collection==='mappings')return page(cue.mappings,{...extra,cueId:cue.cueId,cueSha256:cue.cueSha256,status:cue.status,reasons:cue.reasons,canAcceptProposal:cue.canAcceptProposal});
 if(args.collection==='reviews')return page(cue.reviewHistory,{...extra,cueId:cue.cueId,currentReview:cue.review,receivingCurrent:cue.receivingCurrent});
 if(args.collection==='receiving')return page(cue.receivingHistory,{...extra,cueId:cue.cueId,currentReview:cue.review,currentReceiving:cue.receiving,receivingCurrent:cue.receivingCurrent});
 throw Error('Choose a declared turnover collection');
}
export function previewTurnover(core,workspace,kind,input={}){
 if(kind==='comparison')return core.compare(workspace,input.editionId);
 if(kind==='command'){const next=applyDomain(workspace,input).workspace;return {head:next.head,revision:next.revision,comparison:core.compare(next,input.kind==='receive'?input.payload.id:input.payload.editionId)};}
 throw Error('Choose a declared turnover preview');
}
