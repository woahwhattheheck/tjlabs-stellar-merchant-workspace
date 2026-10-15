// MIT. Full original editor, all source editions and selected dates, observed history and retained host records.
export function buildMakerProductionExport(files,state,records=[],editions=[],{codec:C,core,sessions,buildDesk,zip}){
 const session=sessions.receive(JSON.stringify(state.carrier)),w=core.reopen(session.workspace);
 const entries=Object.entries(files).map(([name,text])=>({name:'source/'+name,data:C.utf8Encode(text)})),add=(name,value)=>entries.push({name,data:C.utf8Encode(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')}),safe=x=>'item-'+encodeURIComponent(String(x)).replaceAll('*','%2A');
 add('working/Maker_Production_Working.json',state.carrier);add('working/Managed_Edition.json',state);add('working/Maker_Production_Original_Workspace.json',w);add('working/Maker_Production_Complete_Workspace.json',sessions.desk(session));add('working/Maker_Production_Editable.html',buildDesk(files,{carrier:state.carrier}));
 for(const e of w.editions){const path='editions/'+safe(e.id)+'/';add(path+'Edition.json',e);
 for(const [kind,source]of Object.entries(e.sources))add(path+'originals/'+kind+'/'+safe(source.name),source.text);
 const dates=new Set([e.settings.asOf,...core.parseCSV(e.sources.observations.text,'observations').map(o=>o.local_date),...w.decisions.filter(d=>d.editionId===e.id).map(d=>d.asOf)]);
 if(session.editor.editionId===e.id)dates.add(session.editor.asOf);
 for(const key of [...Object.keys(session.editor.decisionDrafts),...Object.keys(session.editor.observationDrafts)]){const [id,day]=JSON.parse(key);if(id===e.id)dates.add(day);}
 for(const asOf of [...dates].filter(d=>d>=e.settings.asOf).sort()){const selection={editionId:e.id,asOf},prefix=path+asOf+'/';add(prefix+'Plan.json',core.plan(w,selection));add(prefix+'Report.html',core.report(w,selection));for(const kind of ['orders','stages','capacity','observations','decisions'])add(prefix+kind+'.csv',core.csv(w,selection,kind));}
 }
 add('decisions/Complete_Maker_History.json',w.decisions);
 for(const b of session.backups)add('working/prior-sessions/'+safe(b.id)+'.json',sessions.pack({...sessions.clone(b.snapshot),backups:[]}));
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.makerproduction-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.makerproduction-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:C.sha256Bytes(e.data)}))});
 return zip.packStoredZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxEntries:10000});
}
