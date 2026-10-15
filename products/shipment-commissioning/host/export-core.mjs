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
export function buildShipmentCommissioningExport(files,state,records=[],editions=[],{codec:C,core,originalSessions:M,sessions:S,buildDesk,zip}){
 const s=S.receive(JSON.stringify(state.carrier)),w=s.workspace,entries=[],names=new Set(),contentCache=new Map();let cacheBytes=0;
 const add=(name,value)=>{if(names.has(name))throw Error('Duplicate complete export path '+name);names.add(name);let prepared;
  if(value instanceof Uint8Array)prepared={data:value,sha256:C.sha256Bytes(value)};
  else {const text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';prepared=contentCache.get(text);if(!prepared){const data=C.utf8Encode(text);prepared={data,sha256:C.sha256Bytes(data)};const cost=text.length*2+data.length;if(cost<=16*1024*1024){while(contentCache.size&&(cacheBytes+cost>16*1024*1024||contentCache.size>=4096)){const key=contentCache.keys().next().value;cacheBytes-=contentCache.get(key).cost;contentCache.delete(key);}contentCache.set(text,{...prepared,cost});cacheBytes+=cost;}}}
  entries.push({name,data:prepared.data,sha256:prepared.sha256});};
 for(const [p,t]of Object.entries(files))add('source/'+p,t);
 add('working/Shipment_Commissioning_Working.json',state.carrier);add('working/Managed_Edition.json',state);add('working/Shipment_Commissioning_Original_Session.json',w);add('working/Shipment_Commissioning_Editable.html',buildDesk(files,{carrier:state.carrier}));
 const exportWorkspace=(prefix,workspace)=>{for(const [path,content]of Object.entries(core.exportFiles(workspace)))add(prefix+path,content);add(prefix+'originals/raw-index.json',workspace.originals.map(o=>({id:o.id,name:o.name,bytes:o.bytes,sha256:o.sha256,path:'originals/raw/'+core.hash(o.id)})));for(const o of workspace.originals)add(prefix+'originals/raw/'+core.hash(o.id),C.fromBase64(o.data));};
 exportWorkspace('current/',w.workspace);const journals=new Map([[core.hash(w.workspace),w.workspace]]);
 for(const b of w.backups){add('working/prior/'+b.sha256+'.json',b);journals.set(core.hash(b.snapshot.workspace),b.snapshot.workspace);}
 for(const [sha,workspace]of journals)exportWorkspace('editions/'+sha+'/',workspace);
 add('managed/RETAINED_HISTORY_INDEX.json',{schema:'stellar-forge.shipment-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))});
 for(const r of records)add('managed/requests/'+r.id+'.json',r.value);for(const e of editions)add('managed/editions/'+e.id+'.json',e.value);
 add('EXPORT_MANIFEST.json',{schema:'stellar-forge.shipment-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.data.length,sha256:e.sha256}))});
 const codec=completeExportDeflate(files);return zip.packZip(entries,{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxUncompressedBytes:256*1024*1024,maxEntries:10000,compression:'auto',deflateRaw:bytes=>codec.deflateRaw(bytes,{level:1})});
}
