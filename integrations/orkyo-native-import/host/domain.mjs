// MIT. Read exact native row occurrences, frozen files and source-to-target outcome bindings.
export function inspectOrkyo(core,state,args){
 const w=state.carrier.session.workspace,v=core.view(w);let rows,context={};
 const source=()=>{const s=v.sources.find(s=>s.id===args.id);if(!s)throw Error('Choose an exact retained source');context={sourceId:s.id,kind:s.kind,format:s.format,target:s.context,inspection:{ok:s.inspection.ok,error:s.inspection.error,summary:s.inspection.summary}};return s;};
 const batch=()=>{const b=v.batches.find(b=>b.id===args.id);if(!b)throw Error('Choose an exact frozen batch');context={batchId:b.id,sourceId:b.sourceId,sourceEdition:b.sourceEdition,sourceSha256:b.sourceSha256,state:b.state,target:b.context,attempt:b.attempt,abandoned:b.abandoned};return b;};
 if(args.collection==='sources')rows=v.sources.map(s=>({id:s.id,kind:s.kind,format:s.format,context:s.context,editions:s.editions.length,rows:s.rows.length,inspection:{ok:s.inspection.ok,error:s.inspection.error,summary:s.inspection.summary}}));
 else if(args.collection==='rows')rows=source().rows;
 else if(args.collection==='sourceEditions')rows=source().editions;
 else if(args.collection==='reviews')rows=source().reviews;
 else if(args.collection==='batches')rows=v.batches.map(({rows,file,...b})=>({...b,rowCount:rows.length,file:{filename:file.filename,mime:file.mime,bytes:file.bytes,sha256:file.sha256}}));
 else if(args.collection==='batchRows')rows=batch().rows;
 else if(args.collection==='outcomes')rows=batch().outcomes;
 else if(args.collection==='batchFile')rows=[batch().file];
 else if(args.collection==='events')rows=w.events;
 else if(args.collection==='notes')rows=v.notes;
 else if(args.collection==='requests')rows=[...state.receipts.map(r=>({...r,outcome:'COMMITTED'})),...state.rejections.map(r=>({...r,outcome:'REJECTED_NOT_COMMITTED'}))];
 else if(args.collection==='backups')rows=state.carrier.session.backups.map(b=>({id:b.id,at:b.at,reason:b.reason,sha256:b.sha256,workspaceId:b.snapshot.workspace.id}));
 else throw Error('Choose an exact retained collection');
 const offset=args.offset??0,limit=args.limit??20;if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose offset and 1–50 records');
 return {sha256:state.sha256,head:w.head,revision:w.revision,collection:args.collection,...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit)};
}
export function previewOrkyo(core,w,kind,input){
 const state=core.view(w),source=state.sources.find(s=>s.id===input.sourceId);
 if(kind==='source'){if(!source)throw Error('Choose a retained source');return core.inspectSource(source);}
 if(kind==='review'){const row=source?.rows.find(r=>r.id===input.rowId);if(!row)throw Error('Choose the exact source row');return core.preview(source,row,input.review);}
 if(kind==='command'){const next=core.command(w,input.command);return {workspace:next,view:core.view(next)};}
 throw Error('Choose native source inspection, exact row review or an original command preview');
}
