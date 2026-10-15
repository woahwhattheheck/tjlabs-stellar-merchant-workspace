// MIT. Production-specific reads use the unchanged original calculation model.
export function previewProduction(core,workspace,kind,input){
 if(kind==='analysis')return core.analyse(input,workspace);
 if(kind==='rows')return core.mapRows(workspace,input.sourceId,input.options);
 if(kind==='comparison')return core.compare(workspace,input.leftEditionId,input.rightEditionId);
 if(kind==='proposal')return core.proposalStatus(workspace,input.proposalId);
 if(kind==='mapping'){
  if(!Object.hasOwn(core.fields.tables,input.target)||!input.sourceId||!input.input||!input.mapping)throw Error('Choose the complete input, target table, original source and explicit mapping.');
  const proposed={...input.mapping,sourceId:input.sourceId,format:input.format||'csv',arrayPointer:input.arrayPointer||''};
  const selected={...input.input,tables:{...input.input.tables,[input.target]:proposed}};
  return {input:selected,proposed,report:core.analyse(selected,workspace)};
 }
 throw Error('Choose analysis, explicit mapping, mapped rows, comparison or proposal status.');
}
export function inspectProduction(core,state,args){
 const w=state.carrier.session.workspace;let rows,context={};
 if(args.collection==='rows'){const v=core.inspectSource(w,args.id,{format:args.format||'csv',arrayPointer:args.arrayPointer||''});rows=v.rows;context={columns:v.columns,format:v.format,findings:v.findings};}
 else if(args.collection==='requests')rows=[...state.receipts.map(r=>({...r,outcome:'COMMITTED'})),...state.rejections.map(r=>({...r,outcome:'REJECTED_NOT_COMMITTED'}))];
 else if(args.collection==='backups')rows=state.carrier.session.backups.map(b=>({id:b.id,at:b.at,reason:b.reason,sha256:b.sha256,workspaceId:b.snapshot.workspace.initial.id}));
 else if(args.collection==='sources')rows=w.sources.map(({content_base64,...metadata})=>metadata);
 else if(args.collection==='editions')rows=w.editions.map(({input,report,...e})=>({...e,scope:report.scope,summary:report.summary}));
 else if(args.collection==='operations')rows=w.operations.map(({payload,...o})=>({...o,payloadKeys:Object.keys(payload)}));
 else if(args.collection==='reviews')rows=w.reviews;
 else if(args.collection==='proposals')rows=w.proposals.map(({comparison,...p})=>({...p,summary:comparison.summary,status:core.proposalStatus(w,p.id)}));
 else if(args.collection==='changes'||args.collection==='metricPairs'){
  const p=w.proposals.find(x=>x.id===args.id);if(!p)throw Error('Choose an exact retained proposal.');
  context={proposalId:p.id,comparisonSha256:p.comparisonSha256,comparable:p.comparison.comparable,reasons:p.comparison.reasons,unmatchedRuns:p.comparison.unmatchedRuns,status:core.proposalStatus(w,p.id)};
  rows=p.comparison[args.collection];
 }else{
  const e=w.editions.find(x=>x.id===args.id);if(!e)throw Error('Choose an exact frozen edition.');
  context={editionId:e.id,inputSha256:e.inputSha256,reportSha256:e.reportSha256,scope:e.report.scope,summary:e.report.summary};
  if(args.collection==='input'){if(!Object.hasOwn(e.input,args.table))throw Error('Choose an original input field.');context.table=args.table;rows=Array.isArray(e.input[args.table])?e.input[args.table]:[e.input[args.table]];}
  else if(args.collection==='tables'){if(!Object.hasOwn(core.fields.tables,args.table))throw Error('Choose a declared production table.');context.table=args.table;rows=e.report.tables[args.table];}
  else if(['runs','findings'].includes(args.collection))rows=e.report[args.collection];
  else if(args.collection==='runDetail'){
   const run=e.report.runs.find(r=>r.id===args.runId);if(!run)throw Error('Choose an exact run identifier.');
   if(!['window','output','labor','cost','contribution','performance','coverage','standard'].includes(args.table))throw Error('Choose a complete run collection.');
   context.runId=run.id;context.table=args.table;rows=[run[args.table]];
  }
 }
 if(!Array.isArray(rows))throw Error('Choose a retained collection.');
 const offset=args.offset??0,limit=args.limit??20;if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Choose offset and 1–50 records.');
 return {sha256:state.sha256,rootSha256:w.rootSha256,collection:args.collection,id:args.id,...context,offset,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null,rows:rows.slice(offset,offset+limit)};
}
