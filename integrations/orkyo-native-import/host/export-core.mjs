// MIT. Full native source, original bytes, frozen batches, editor and managed history.
export function buildOrkyoExport(files,state,records=[],editions=[],{codec:C,archive,core,sessions,workbook,UZIP,buildDesk,zip}){
 const session=sessions.receive(JSON.stringify(state.carrier)),w=session.workspace,v=core.view(w),native=core.exports(w);
 const entries=Object.entries(files).map(([name,text])=>({name:'source/'+name,data:C.utf8Encode(text)}));
 const add=(name,value)=>entries.push({name,data:C.utf8Encode(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')});
 const safe=x=>'item-'+encodeURIComponent(String(x)).replaceAll('*','%2A');
 add('working/Orkyo_Working.json',state.carrier);add('working/Session_State.json',state);
 add('working/Orkyo_Complete_Desk_Copy.json',{...sessions.toCopy(session),earlierInMemoryCopies:session.draft.emergency});
 add('working/Orkyo_Editable.html',buildDesk(files,{carrier:state.carrier}));
 add('working/Orkyo_Workspace.json',native.workspace);
 add('reports/Orkyo_Readiness.csv',native.readinessCSV);add('reports/Orkyo_Outcomes.csv',native.outcomesCSV);add('reports/Orkyo_Complete_Report.html',core.report(w));
 add('reports/Selected_Editor_Context.json',{selection:session.draft.copy.selection,outcomeDraftBinding:session.draft.copy.outcomeDraftBinding,ui:session.draft.copy.ui,actor:session.draft.actor});
 for(const s of v.sources){add('originals/'+safe(s.id)+'/Source_Context.json',s.context);
  for(let i=0;i<s.editions.length;i++){const e=s.editions[i],p='originals/'+safe(s.id)+'/edition-'+(i+1)+'/';add(p+'Edition.json',e);add(p+'Representation-'+safe(e.artifact.filename),e.artifact.text);if(e.artifact.originalFile)entries.push({name:p+'Original-'+safe(e.artifact.originalFile.filename),data:archive.base64Decode(e.artifact.originalFile.base64)});}
 }
 if(session.draft.copy.pendingFile){const p=session.draft.copy.pendingFile;entries.push({name:'working/pending-original/'+safe(p.filename),data:archive.base64Decode(p.base64)});}
 for(const b of v.batches){const p='batches/'+safe(b.id)+'/';add(p+'Frozen_Batch.json',b);if(b.file.sheets)entries.push({name:p+safe(b.file.filename),data:workbook.buildXlsx(b.file.sheets,UZIP.encode,archive.utf8Encode)});else add(p+safe(b.file.filename),b.file.text);}
 for(const b of session.backups)add('working/prior-sessions/'+safe(b.id)+'.json',sessions.pack({...sessions.clone(b.snapshot),backups:[]}));
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.orkyo-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.orkyo-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:C.sha256Bytes(e.data)}))});
 return zip.packStoredZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxEntries:10000});
}
