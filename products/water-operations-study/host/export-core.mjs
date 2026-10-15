// MIT. Complete sources, original files, compact history, pending forms and native request lineage.
// Cache the exact retained upstream source, not a network or environment dependency.
const completeExportCodecs=new WeakMap();
function completeExportDeflate(files){
 const source=files['vendor/pako.cjs'];if(typeof source!=='string')throw Error('Complete export codec source is missing');
 const prior=completeExportCodecs.get(files);if(prior?.source===source)return prior.codec;
 const module={exports:{}};Function('module','exports',source)(module,module.exports);
 if(typeof module.exports.deflateRaw!=='function')throw Error('Complete export codec cannot encode raw DEFLATE');
 completeExportCodecs.set(files,{source,codec:module.exports});return module.exports;
}
export function buildWaterOperationsStudyExport(files,state,records=[],editions=[],{codec:C,core,originalSessions:M,sessions:S,buildDesk,zip}){
 const s=S.receive(JSON.stringify(state.carrier)),w=s.workspace,entries=[],names=new Set(),contentCache=new Map();let cacheBytes=0;
 const add=(name,value)=>{if(names.has(name))throw Error('Duplicate complete export path '+name);names.add(name);let prepared;
  if(value instanceof Uint8Array)prepared={data:value,sha256:C.sha256Bytes(value)};
  else {const text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';prepared=contentCache.get(text);if(!prepared){const data=C.utf8Encode(text);prepared={data,sha256:C.sha256Bytes(data)};const cost=text.length*2+data.length;if(cost<=16*1024*1024){while(contentCache.size&&(cacheBytes+cost>16*1024*1024||contentCache.size>=4096)){const key=contentCache.keys().next().value;cacheBytes-=contentCache.get(key).cost;contentCache.delete(key);}contentCache.set(text,{...prepared,cost});cacheBytes+=cost;}}}
  entries.push({name,data:prepared.data,sha256:prepared.sha256});};
 for(const [p,t]of Object.entries(files))add('source/'+p,t);
 add('working/Water_Operations_Study_Working.json',state.carrier);add('working/Managed_Edition.json',state);add('working/Water_Operations_Study_Original_Session.json',w);add('working/Water_Operations_Study_Editable.html',buildDesk(files,{carrier:state.carrier}));
 const original=(prefix,items)=>{for(const e of items)add(prefix+e.path,e.content===undefined?Uint8Array.from(e.bytes):e.content);};
 original('current/',M.exports(w));add('working/emergency.json',{schema:'water-operations.source-emergency/v1',session:w,pending_forms:s.emergency.drafts,pending_imports:s.emergency.imports,reason:s.emergency.reason});add('working/retained-emergencies.json',s.retainedEmergency);
 const studies=new Map(),historyRoots=new Set(),addHistory=(session,h)=>{if(historyRoots.has(h.study_ref))return;const study=M.historyStudy(session,h);historyRoots.add(h.study_ref);studies.set(core.hash(study),study);};studies.set(core.hash(w.study),w.study);for(const h of w.history)addHistory(w,h);
 for(const b of w.backups){const branch=M.branchSession(w,b);add('working/prior/'+b.hash+'.json',branch);studies.set(core.hash(branch.study),branch.study);for(const h of branch.history)addHistory(branch,h);}
 for(const [hash,study]of studies)original('editions/'+hash+'/',core.exports(study));
 for(const e of s.retainedEmergency)original('emergency-editions/'+e.sha256+'/',M.exports(e.session));
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.water-operations-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.water-operations-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:e.sha256}))});
 const codec=completeExportDeflate(files);return zip.packZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxUncompressedBytes:256*1024*1024,maxEntries:10000,compression:'auto',deflateRaw:bytes=>codec.deflateRaw(bytes,{level:1})});
}
