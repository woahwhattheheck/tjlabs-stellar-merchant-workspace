// MIT. Exact original desk, every source/evidence body, reports and complete request history.
export function buildTurnoverExport(files,state,records=[],editions=[],{codec:C,core,sessions,buildDesk,zip}){
 const session=sessions.receive(JSON.stringify(state.carrier)),w=core.reopen(session.workspace);
 const entries=Object.entries(files).map(([name,text])=>({name:'source/'+name,data:C.utf8Encode(text)})),add=(name,value)=>entries.push({name,data:C.utf8Encode(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')}),safe=x=>'item-'+encodeURIComponent(String(x)).replaceAll('*','%2A');
 add('working/Turnover_Working.json',state.carrier);add('working/Managed_Edition.json',state);add('working/Turnover_Original_Workspace.json',w);add('working/Turnover_Complete_Workspace.json',sessions.desk(session));add('working/Turnover_Editable.html',buildDesk(files,{carrier:state.carrier}));
 for(const e of core.editions(w)){const path='editions/'+safe(e.id)+'/';add(path+'Edition.json',e);add(path+'Comparison.json',core.compare(w,e.id));add(path+'Review_Report.html',core.report(w,e.id));
  for(const kind of ['cues','events','added','reviews','receiving'])add(path+kind+'.csv',core.csv(w,e.id,kind));
  for(const kind of ['old','next','cues'])add(path+'originals/'+kind+'/'+safe(e[kind].name),e[kind].text);
 }
 for(const command of w.commands){add('commands/'+safe(command.id)+'.json',command);for(const kind of ['receivingEvidence','evidence']){const e=command.payload[kind];if(e)add('evidence/'+safe(command.id)+'/'+safe(e.name),e.text);}}
 for(const b of session.backups)add('working/prior-sessions/'+safe(b.id)+'.json',sessions.pack({...sessions.clone(b.snapshot),backups:[]}));
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.turnover-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.turnover-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:C.sha256Bytes(e.data)}))});
 return zip.packStoredZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxEntries:10000});
}
