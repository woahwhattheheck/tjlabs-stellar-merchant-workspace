// MIT. Exact complete source export, with resumable prepared compression.
const completeExportCodecs=new WeakMap();
function completeExportDeflate(files){const source=files['vendor/pako.cjs'];if(typeof source!=='string')throw Error('Complete export codec source is missing');const prior=completeExportCodecs.get(files);if(prior?.source===source)return prior.codec;const module={exports:{}};Function('module','exports',source)(module,module.exports);if(typeof module.exports.deflateRaw!=='function'||typeof module.exports.inflateRaw!=='function')throw Error('Complete export codec cannot process raw DEFLATE');completeExportCodecs.set(files,{source,codec:module.exports});return module.exports;}
// Complete exports advance by whole source groups. Persist checkpoint() between run() calls.
export function createPreparedExportJob(groupFactory,{zip,zipOptions,identity,checkpoint=null,manifest,observeEntry,checkpointMetadata}){
 if(typeof groupFactory!=='function'||!identity||typeof identity!=='string'||typeof manifest!=='function')throw TypeError('Complete export job requires its exact identity, group factory and manifest');
 if(observeEntry!==undefined&&typeof observeEntry!=='function')throw TypeError('Export observer must be a function');
 if(checkpointMetadata!==undefined&&typeof checkpointMetadata!=='function')throw TypeError('Checkpoint metadata must be a function');
 if(checkpoint&&(checkpoint.schema!=='commons.complete-export-job.v1'||checkpoint.identity!==identity||!Array.isArray(checkpoint.groups)||!Array.isArray(checkpoint.entries)||typeof checkpoint.done!=='boolean'))throw Error('Complete export checkpoint belongs to another exact input or implementation');
 const archive=zip.createZipBuilder(zipOptions,checkpoint?.archive||null),entries=(checkpoint?.entries||[]).map(x=>({...x})),groups=(checkpoint?.groups||[]).map(x=>({...x})),names=new Set(),seenGroups=new Set(),priorGroups=groups.length;
 let cursor=0,done=checkpoint?.done||false,iterator=null,cacheBytes=0,contentCache=new Map(),inGroup=false,failed=false;
 const prepared=archive.entries();
 if(prepared.length!==entries.length)throw Error('Complete export checkpoint manifest count differs');
 for(let i=0;i<entries.length;i++){const x=entries[i],p=prepared[i];if(typeof x.name!=='string'||names.has(x.name)||!Number.isSafeInteger(x.bytes)||x.bytes<0||!(/^[a-f0-9]{64}$/).test(x.sha256)||x.name!==p.name||x.bytes!==p.bytes)throw Error('Complete export checkpoint member metadata changed');names.add(x.name);}
 let position=0;for(const g of groups){if(typeof g.key!=='string'||!g.key||seenGroups.has(g.key)||g.start!==position||!Number.isSafeInteger(g.count)||g.count<0)throw Error('Complete export checkpoint group cursor changed');position+=g.count;seenGroups.add(g.key);}
 if(position+(done?1:0)!==entries.length||done&&entries.at(-1)?.name!=='EXPORT_MANIFEST.json')throw Error('Complete export checkpoint group coverage changed');
 function add(name,value){
  if(names.has(name))throw Error('Duplicate complete export path '+name);
  if(observeEntry)observeEntry({phase:'start',name,entries:entries.length});
  let meta,record;
  if(value instanceof Uint8Array){meta={bytes:value.length,sha256:zipOptions.codec.sha256Bytes(value)};record=archive.add({name,data:value});}
  else {const text=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';meta=contentCache.get(text);if(meta)record=archive.copy(name,meta.name);else{const data=zipOptions.codec.utf8Encode(text);meta={name,bytes:data.length,sha256:zipOptions.codec.sha256Bytes(data)};record=archive.add({name,data});const cost=text.length*2+record.compressedBytes;if(cost<=16*1024*1024){while(contentCache.size&&(cacheBytes+cost>16*1024*1024||contentCache.size>=4096)){const key=contentCache.keys().next().value;cacheBytes-=contentCache.get(key).cost;contentCache.delete(key);}contentCache.set(text,{...meta,cost});cacheBytes+=cost;}}}
  names.add(name);entries.push({name,bytes:meta.bytes,sha256:meta.sha256});if(observeEntry)observeEntry({phase:'done',name,bytes:meta.bytes,...archive.statistics()});
 }
 function run({maxGroups=1,maxMilliseconds=25000}={}){
  if(!Number.isSafeInteger(maxGroups)||maxGroups<1||!Number.isFinite(maxMilliseconds)||maxMilliseconds<=0)throw TypeError('Choose positive export progress limits');
  if(failed||inGroup)throw Error('Restore the last complete checkpoint after interrupted export progress');if(done)return status();const start=Date.now();let advanced=0;
  try{if(!iterator)iterator=groupFactory();while(advanced<maxGroups&&(advanced===0||Date.now()-start<maxMilliseconds)){
   const item=iterator.next();if(item.done){if(cursor<priorGroups)throw Error('Complete export source groups disappeared');inGroup=true;add('EXPORT_MANIFEST.json',manifest(entries.map(e=>({...e}))));done=true;inGroup=false;break;}
   const g=item.value;if(!g||typeof g.key!=='string'||typeof g.create!=='function')throw Error('Invalid complete source group');
   if(cursor<priorGroups){if(groups[cursor].key!==g.key)throw Error('Complete export source group order changed');cursor++;continue;}
   if(seenGroups.has(g.key))throw Error('Duplicate complete export group '+g.key);
   inGroup=true;const begin=entries.length,items=g.create();if(!Array.isArray(items))throw Error('Complete source group must return its full entry array');
   for(const e of items){if(!e||typeof e.name!=='string')throw Error('Invalid complete export entry');add(e.name,e.value);}
   groups.push({key:g.key,start:begin,count:entries.length-begin});seenGroups.add(g.key);cursor++;advanced++;inGroup=false;
  }}catch(error){failed=true;throw error;}
  return status();
 }
 function status(){return{done,completedGroups:groups.length,...archive.statistics()};}
 function snapshot(){if(failed||inGroup)throw Error('Checkpoint only after successful complete export progress');return{schema:'commons.complete-export-job.v1',identity,done,groups:groups.map(x=>({...x})),entries:entries.map(x=>({...x})),archive:archive.snapshot(),...(checkpointMetadata?{metadata:JSON.parse(JSON.stringify(checkpointMetadata()))}:{})};}
 return Object.freeze({run,checkpoint:snapshot,statistics:status,finish(){if(failed||inGroup||!done)throw Error('Complete all source groups successfully before final ZIP');return archive.finish();}});
}

export function createProcurementSavingsStudyExportJob(files,state,records=[],editions=[],dependencies={},options={}){
 const {codec:C,core,originalSessions:M,sessions:S,buildDesk,zip,observeEntry}=dependencies;
 if(!(/^[a-f0-9]{64}$/).test(options.verifiedInputSha256||''))throw Error('Resume needs the verified complete receiving-input SHA-256');
 const source=Object.entries(files).map(([path,text])=>{if(typeof text!=='string')throw Error('Complete source members must be text');const bytes=C.utf8Encode(text);return{path,bytes:bytes.length,sha256:C.sha256Bytes(bytes)};});
 const identity=C.sha256Bytes(C.utf8Encode(JSON.stringify({schema:'procurement-savings.complete-export-input.v1',implementation:'complete-export-job/v2-inventory',verifiedInputSha256:options.verifiedInputSha256,source,installationId:state.installationId,stateSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,records:records.map(r=>r.id),editions:editions.map(e=>e.id)})));
 const s=S.receive(JSON.stringify(state.carrier)),w=s.workspace,codec=completeExportDeflate(files);
 const asEntries=(prefix,items)=>items.map(e=>({name:prefix+e.path,value:e.content===undefined?Uint8Array.from(e.bytes):e.content}));
 const catalog=options.checkpoint?.metadata?JSON.parse(JSON.stringify(options.checkpoint.metadata)):{schema:'procurement-savings.export-inventory.v1',references:[],studies:[]};
 if(catalog.schema!=='procurement-savings.export-inventory.v1'||!Array.isArray(catalog.references)||!Array.isArray(catalog.studies))throw Error('Complete export inventory checkpoint changed');
 const referenceHashes=new Map(),studyRefs=new Map();
 for(const x of catalog.references){if(typeof x.ref!=='string'||referenceHashes.has(x.ref)||!(/^[a-f0-9]{64}$/).test(x.hash)||x.ref!=='current'&&w.archive[x.ref]?.kind!=='study')throw Error('Invalid retained study inventory reference');referenceHashes.set(x.ref,x.hash);}
 for(const x of catalog.studies){if(studyRefs.has(x.hash)||referenceHashes.get(x.ref)!==x.hash)throw Error('Invalid retained study inventory order');studyRefs.set(x.hash,x.ref);}
 const catalogSnapshot=()=>({schema:catalog.schema,references:[...referenceHashes].map(([ref,hash])=>({ref,hash})),studies:[...studyRefs].map(([hash,ref])=>({hash,ref}))});
 const studyAt=ref=>ref==='current'?w.study:M.historyStudy(w,{study_ref:ref});
 const inventory=ref=>{let hash=referenceHashes.get(ref);if(!hash){hash=core.hash(studyAt(ref));referenceHashes.set(ref,hash);}studyRefs.set(hash,ref);return[];};
 function* groups(){
  for(const[p,t]of Object.entries(files))yield{key:'source/'+p,create:()=>[{name:'source/'+p,value:t}]};
  yield{key:'working/carrier',create:()=>[{name:'working/Procurement_Savings_Reconciliation_Study_Working.json',value:state.carrier}]};
  yield{key:'working/managed',create:()=>[{name:'working/Managed_Edition.json',value:state}]};
  yield{key:'working/session',create:()=>[{name:'working/Procurement_Savings_Reconciliation_Study_Original_Session.json',value:w}]};
  yield{key:'working/desk',create:()=>[{name:'working/Procurement_Savings_Reconciliation_Study_Editable.html',value:buildDesk(files,{carrier:state.carrier})}]};
  yield{key:'current',create:()=>asEntries('current/',M.exports(w))};
  yield{key:'working/emergency',create:()=>[{name:'working/emergency.json',value:{schema:'procurement-savings.source-emergency/v1',session:w,pending_forms:s.emergency.drafts,pending_imports:s.emergency.imports,reason:s.emergency.reason}}]};
  yield{key:'working/retained-emergencies',create:()=>[{name:'working/retained-emergencies.json',value:s.retainedEmergency}]};
  const historyRoots=new Set();let inventoryIndex=0;
  const item=ref=>({key:'inventory/'+String(inventoryIndex++).padStart(6,'0')+'/'+ref,create:()=>inventory(ref)});
  yield item('current');
  for(const h of w.history){if(historyRoots.has(h.study_ref))continue;historyRoots.add(h.study_ref);yield item(h.study_ref);}
  for(const b of w.backups){
   yield{key:'working/prior/'+b.hash,create:()=>[{name:'working/prior/'+b.hash+'.json',value:M.branchSession(w,b)}]};
   const body=w.archive[b.session_ref||b.hash];if(!body||body.kind!=='session'||!Array.isArray(body.history)||w.archive[body.study_ref]?.kind!=='study')throw Error('Retained branch inventory is incomplete');
   yield item(body.study_ref);
   for(const h of body.history){if(historyRoots.has(h.study_ref))continue;historyRoots.add(h.study_ref);yield item(h.study_ref);}
  }
  for(const[hash,ref]of studyRefs)yield{key:'editions/'+hash,create:()=>asEntries('editions/'+hash+'/',core.exports(studyAt(ref)))};
  for(const e of s.retainedEmergency)yield{key:'emergency-editions/'+e.sha256,create:()=>asEntries('emergency-editions/'+e.sha256+'/',M.exports(e.session))};
  yield{key:'managed/index',create:()=>[{name:'managed/RETAINED_HISTORY_INDEX.json',value:{schema:'stellar-forge.procurement-savings-retained-history.v1',currentStateSha256:state.sha256,requests:records.map(r=>({sha256:r.id,requestId:r.value.request?.id,selection:state.receipts?.some(x=>x.recordSha256===r.id)?'COMMITTED':state.rejections?.some(x=>x.recordSha256===r.id)?'REJECTED_NOT_COMMITTED':'UNSELECTED_PREPARED_RECORD'})),editions:editions.map(r=>({sha256:r.id,sequence:r.value.sequence,selection:r.id===state.sha256?'CURRENT_EDITION':'RETAINED_EDITION'}))}}]};
  for(const r of records)yield{key:'managed/requests/'+r.id,create:()=>[{name:'managed/requests/'+r.id+'.json',value:r.value}]};
  for(const e of editions)yield{key:'managed/editions/'+e.id,create:()=>[{name:'managed/editions/'+e.id+'.json',value:e.value}]};
 }
 return createPreparedExportJob(groups,{zip,zipOptions:{timestamp:'2026-10-15T00:00:00Z',maxBytes:256*1024*1024,maxUncompressedBytes:512*1024*1024,maxEntries:60000,compression:'auto',deflateRaw:bytes=>codec.deflateRaw(bytes,{level:1}),inflateRaw:bytes=>codec.inflateRaw(bytes),codec:C},identity,checkpoint:options.checkpoint||null,observeEntry,checkpointMetadata:catalogSnapshot,manifest:entries=>({schema:'stellar-forge.procurement-savings-export.v1',installationId:state.installationId,editionSha256:state.sha256,sessionSha256:state.carrier.sha256,sequence:state.sequence,files:entries.map(e=>({path:e.name,bytes:e.bytes,sha256:e.sha256}))})});
}
export function buildProcurementSavingsStudyExport(files,state,records=[],editions=[],dependencies){
 // Ordinary callers already provide the complete in-memory inputs. The resumable
 // receiver supplies its independently verified compact input digest explicitly.
 const C=dependencies.codec,verifiedInputSha256=C.sha256Bytes(C.utf8Encode(JSON.stringify({state:state.sha256,carrier:state.carrier.sha256,records:records.map(x=>x.id),editions:editions.map(x=>x.id)})));
 const job=createProcurementSavingsStudyExportJob(files,state,records,editions,dependencies,{verifiedInputSha256});
 while(!job.run({maxGroups:1000000,maxMilliseconds:86400000}).done){}
 return job.finish();
}
