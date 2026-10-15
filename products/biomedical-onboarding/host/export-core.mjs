// MIT. Complete sources, original files, compact history, pending forms and native request lineage.
export function buildBiomedicalOnboardingExport(files,state,records=[],editions=[],{codec:C,core,originalSessions:M,sessions:S,buildDesk,zip}){
 const s=S.receive(JSON.stringify(state.carrier)),w=s.workspace,entries=[],names=new Set(),add=(name,value)=>{if(names.has(name))throw Error('Duplicate complete export path '+name);names.add(name);entries.push({name,data:value instanceof Uint8Array?value:C.utf8Encode(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n')});};
 for(const [p,t]of Object.entries(files))add('source/'+p,t);
 add('working/Biomedical_Onboarding_Working.json',state.carrier);add('working/Managed_Edition.json',state);add('working/Biomedical_Onboarding_Original_Session.json',w);add('working/Biomedical_Onboarding_Editable.html',buildDesk(files,{carrier:state.carrier}));
 const original=(prefix,items)=>{for(const e of items)add(prefix+e.path,e.content===undefined?Uint8Array.from(e.bytes):e.content);};
 original('current/',M.exports(w));add('working/emergency.json',{schema:'biomed.onboarding-emergency/v1',session:w,pending_forms:s.emergency.drafts,pending_imports:s.emergency.imports,reason:s.emergency.reason});add('working/retained-emergencies.json',s.retainedEmergency);
 const studies=new Map();studies.set(core.hash(w.study),w.study);for(const h of w.history){const study=M.historyStudy(w,h);studies.set(core.hash(study),study);}
 for(const b of w.backups){const branch=M.branchSession(w,b);add('working/prior/'+b.hash+'.json',branch);studies.set(core.hash(branch.study),branch.study);for(const h of branch.history){const study=M.historyStudy(branch,h);studies.set(core.hash(study),study);}}
 for(const [hash,study]of studies)original('editions/'+hash+'/',core.exports(study));
 for(const e of s.retainedEmergency)original('emergency-editions/'+e.sha256+'/',M.exports(e.session));
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.biomedical-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.biomedical-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:C.sha256Bytes(e.data)}))});
 return zip.packStoredZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxEntries:10000});
}
