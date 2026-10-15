// MIT. Complete source, original capture bodies, editor, frozen plans and retained host history.
export function buildRoasteryExport(files,state,records=[],editions=[],{codec:C,core,sessions,buildDesk,zip}){
 const session=sessions.receive(JSON.stringify(state.carrier)),w=core.reopen(session.workspace),plan=core.analyse(w);
 const entries=Object.entries(files).map(([name,text])=>({name:'source/'+name,data:C.utf8Encode(text)})),add=(name,value)=>entries.push({name,data:C.utf8Encode(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')}),safe=x=>'item-'+encodeURIComponent(String(x)).replaceAll('*','%2A');
 add('working/Roastery_Working.json',state.carrier);add('working/Managed_Edition.json',state);add('working/Roastery_Complete_Workspace.json',w);add('working/Roastery_Editable.html',buildDesk(files,{carrier:state.carrier}));
 add('reports/Current_Plan.json',plan);add('reports/Roast_Batches.csv',core.csv(plan.batches,['batch_id','lot_id','profile_id','green_g','planned_roasted_g','planned_loss_g','unallocated_roasted_g','earliest_due']));
 add('reports/Working_Report.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roastery production report</title><style>'+files['src/style.css']+'</style></head><body><main class="roastery-root">'+core.report(w)+'</main></body></html>');
 for(const capture of w.captures){add('originals/'+safe(capture.id)+'/Original-'+safe(capture.filename),capture.text);add('originals/'+safe(capture.id)+'/Capture.json',capture);}
 for(const p of w.frozenPlans){add('plans/'+safe(p.id)+'/Frozen_Plan.json',p);add('plans/'+safe(p.id)+'/Measured_Outcomes.json',core.outcomes(w,p.id));}
 for(const b of session.backups)add('working/prior-sessions/'+safe(b.id)+'.json',sessions.pack({...sessions.clone(b.snapshot),backups:[]}));
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.roastery-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.roastery-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:C.sha256Bytes(e.data)}))});
 return zip.packStoredZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxEntries:10000});
}
