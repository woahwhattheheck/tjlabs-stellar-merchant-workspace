// MIT. One focused installed domain/editor/export course using the maintained authored native history.
function runInstalledCourse({core,sessions,model,codec,files}){
 const need=(v,m)=>{if(!v)throw Error(m)},copy=x=>JSON.parse(JSON.stringify(x)),at='2026-10-15T06:30:00.000Z';
 const w=core.reopen(JSON.parse(files['examples/authored-desk-workspace.json'])).workspace,v=core.view(w);
 const rough=v.sources.find(s=>s.id==='workbook').rows.find(r=>r.id==='Jobs:6');
 need(rough.nativePayload.minimalDurationValue===5&&rough.nativePayload.endTs==='2026-10-20T00:00:00Z','Pinned weekday duration and exclusive end must remain exact');
 let session=sessions.fromCopy(sessions.blankCopy(w),{actor:'Authored installed operator'});
 Object.assign(session.draft.copy.forms,{'review-values':'{"unfinished":','review-reason':'Unfinished source correction review','outcome-row':'Jobs:7','outcome-reason':'Awaiting actual remaining-job response'});
 session.draft.copy.selection={source:'malformed',row:'row:1',batch:'jobs-remaining'};session.draft.copy.outcomeDraftBinding={batchId:'jobs-remaining',rowId:'Jobs:7'};
 session.draft.copy.ui={activeTab:'batches-tab',page:0,search:'Repaired',selected:['row:1']};
 const bytes=codec.fromBase64(files['examples/authored-workbook.xlsx.base64'].trim());
 session.draft.copy.pendingFile={filename:'Authored_original.xlsx',base64:codec.toBase64(bytes),bytes:bytes.length,sha256:codec.sha256Bytes(bytes)};
 session=sessions.receive(JSON.stringify(sessions.pack(session)));
 let state=model.initial('authored-installed-orkyo',sessions.pack(session));const records=[],editions=[{id:model.hash(state),value:copy(state)}],requests=[];
 const submit=(kind,payload,id)=>{const r={schema:'stellar-forge.orkyo-request.v1',installationId:state.installationId,id,baseSha256:model.hash(state),actor:'Authored installed operator',at,kind:'action',operation:{id,kind,expectedHead:state.carrier.session.workspace.head,actor:'Authored installed operator',at,payload}},p=model.plan(state,r);state=p.next;requests.push(r);records.push({id:p.recordSha256,value:p.record});editions.push({id:model.hash(state),value:copy(state)});return {request:r,planned:p};};
 const attempt=submit('attempt',{batchId:'jobs-remaining',confirmTenant:'Authored receiving tenant',operator:'Authored operator',route:'Authored native workbook receiving',details:'Authored selected remaining job only'},'installed-attempt');
 submit('resolve',{batchId:'jobs-remaining',rowId:'Jobs:7',status:'created',targetId:'authored-job-installed-703',reviewer:'Authored operator',reason:'Exact authored remaining-job response attribution',evidence:{text:'Authored provider response: created authored-job-installed-703 for Jobs:7 in jobs-remaining'}},'installed-resolve');
 need(state.carrier.session.draft.copy.forms['review-values']==='{"unfinished":','Native outcomes preserve unrelated unfinished row review');
 submit('correct-source',{sourceId:'malformed',artifact:{filename:'repaired-again.csv',text:'name,description\nRepaired again,"complete new source"\n'},reason:'Authored complete-source correction after opening an unfinished review'},'installed-correct-source');
 const next=state.carrier.session;
 need(next.draft.copy.selection.row===''&&next.draft.copy.forms['review-values']==='{}','New source starts an unbound row review');
 const prior=next.backups.find(b=>b.snapshot.draft.copy.forms['review-values']==='{"unfinished":');
 need(prior&&prior.snapshot.workspace.head!==next.workspace.head&&prior.snapshot.draft.copy.pendingFile.sha256===session.draft.copy.pendingFile.sha256,'Full pre-correction editor and binary original remain recoverable');
 need(next.draft.copy.outcomeDraftBinding.batchId==='jobs-remaining'&&next.draft.copy.forms['outcome-row']==='Jobs:7','Exact batch/outcome draft remains bound');
 const recovered=model.record(state,attempt.request,attempt.planned.record);
 need(recovered.outcome==='COMMITTED'&&recovered.state.carrier.session.workspace.head===next.workspace.head,'Original attempt recovery retains later outcome and source correction');
 const final=core.view(next.workspace),batch=final.batches.find(b=>b.id==='jobs-remaining');
 need(batch.outcomes[0].targetId==='authored-job-installed-703','Remaining job is exactly attributed');
 let duplicate;try{core.command(next.workspace,{id:'duplicate-prepare',expectedHead:next.workspace.head,type:'prepare',at,payload:{sourceId:'workbook',batchId:'duplicate-jobs',rowIds:['Jobs:7']}});}catch(e){duplicate=e.message;}
 need(duplicate&&/already prepared, unresolved or bound/.test(duplicate),'Resolved native create cannot be silently repeated');
 return {state:model.view(state),records,editions,requests,result:{schema:'stellar-forge.orkyo-installed-course.v1',operationId:core.OP,sourceCommit:next.workspace.sourceCommit,domainRevision:next.workspace.revision,head:next.workspace.head,originals:final.sources.length,sourceEditions:final.sources.reduce((n,s)=>n+s.editions.length,0),batches:final.batches.length,actualOutcomeId:batch.outcomes[0].targetId,retainedPreCorrectionDraftSha256:prior.sha256,pendingOriginalSha256:next.draft.copy.pendingFile.sha256,nativeRoughHours:rough.nativePayload.minimalDurationValue,nativeRoughEnd:rough.nativePayload.endTs,duplicateCreateResult:duplicate}};
}
module.exports={runInstalledCourse};
