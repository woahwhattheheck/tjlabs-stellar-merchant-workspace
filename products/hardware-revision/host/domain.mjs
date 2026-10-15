// MIT. Hardware-specific reads stay on the unchanged original domain model.
export function previewHardware(core,workspace,kind,input){
 if(kind==='analysis')return core.analyse(input,workspace);
 if(kind==='netlist')return core.parseNetlist(workspace,input.sourceId);
 if(kind==='comparison')return core.compare(workspace,input.leftEditionId,input.rightEditionId);
 if(kind==='proposal')return core.proposalStatus(workspace,input.proposalId);
 if(kind==='mapping'){
  if(!['bom','firmware'].includes(input.target)||!input.sourceId||!input.input||!input.mapping)throw Error('Choose the complete input, target, original source and explicit table mapping.');
  const proposed={...input.mapping,sourceId:input.sourceId,format:input.format||'csv',arrayPointer:input.arrayPointer||''};
  const selected={...input.input,[input.target]:proposed};
  return {input:selected,proposed,report:core.analyse(selected,workspace)};
 }
 throw Error('Choose analysis, exact mapping, netlist, comparison or proposal status.');
}
export function inspectHardware(core,state,args){
 const w=state.carrier.session.workspace;let rows,context={};
 if(args.collection==='rows'){const v=core.inspectSource(w,args.id,{format:args.format||'csv',arrayPointer:args.arrayPointer||''});rows=v.rows;context={columns:v.columns,format:v.format,findings:v.findings};}
 else if(args.collection==='netlist'){const v=core.parseNetlist(w,args.id);if(!['components','nets','libparts','libraries','findings'].includes(args.table))throw Error('Choose a complete netlist collection.');rows=v[args.table];context={design:v.design,table:args.table};}
 else if(args.collection==='requests')rows=[...state.receipts.map(r=>({...r,outcome:'COMMITTED'})),...state.rejections.map(r=>({...r,outcome:'REJECTED_NOT_COMMITTED'}))];
 else if(args.collection==='backups')rows=state.carrier.session.backups.map(b=>({id:b.id,at:b.at,reason:b.reason,sha256:b.sha256,workspaceId:b.snapshot.workspace.initial.id}));
 else if(args.collection==='sources')rows=w.sources.map(({content_base64,...metadata})=>metadata);
 else if(args.collection==='editions')rows=w.editions.map(({input,report,...e})=>({...e,scope:report.scope,summary:report.summary}));
 else if(args.collection==='operations')rows=w.operations.map(({payload,...o})=>({...o,payloadKeys:Object.keys(payload)}));
 else if(args.collection==='reviews')rows=w.reviews;
 else if(args.collection==='proposals')rows=w.proposals.map(({comparison,...p})=>({...p,summary:comparison.summary,status:core.proposalStatus(w,p.id)}));
 else if(args.collection==='changes'||args.collection==='cohorts'){
  const p=w.proposals.find(x=>x.id===args.id);if(!p)throw Error('Choose an exact retained proposal.');
  context={proposalId:p.id,comparisonSha256:p.comparisonSha256,status:core.proposalStatus(w,p.id)};
  if(args.collection==='changes')rows=p.comparison.changes;
  else{if(!['left','right'].includes(args.side))throw Error('Choose the baseline or candidate cohort side.');context.side=args.side;rows=p.comparison.connectivityCohorts[args.side];}
 }else{
  const e=w.editions.find(x=>x.id===args.id);if(!e)throw Error('Choose an exact frozen edition.');
  context={editionId:e.id,inputSha256:e.inputSha256,reportSha256:e.reportSha256,scope:e.report.scope,summary:e.report.summary};
  if(args.collection==='input'){if(!Object.hasOwn(e.input,args.table))throw Error('Choose an original input field.');context.table=args.table;rows=Array.isArray(e.input[args.table])?e.input[args.table]:[e.input[args.table]];}
  else if(['components','pins','bom','firmware','bomReconciliation','findings'].includes(args.collection))rows=e.report[args.collection];
 }
 if(!Array.isArray(rows))throw Error('Choose a retained collection.');
 const offset=args.offset??0,limit=args.limit??20;if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose offset and 1–50 records.');
 return {sha256:state.sha256,rootSha256:w.rootSha256,collection:args.collection,id:args.id,...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit)};
}
