/* MIT. Complete managed recovery proposals share immutable original workspace objects.
   The saved head changes in the same transaction that retains the full proposal.
   Earlier v1 recovery rows migrate on first successful publication and stay reopenable. */
export function createManagedRecoveryStore({C,A,workspaceSchema='tjlabs.telemetry-workspace.v1',indexedDB:factory=globalThis.indexedDB}){
 const hash=t=>C.sha256Bytes(C.utf8Encode(t)),copy=x=>JSON.parse(JSON.stringify(x)),need=(v,m)=>{if(!v)throw Error(m)},name='tjlabs.telemetry.managed.v1';
 const recordSchema='stellar-forge.telemetry-recovery-record.v1',headSchema='stellar-forge.telemetry-recovery-head.v1',refSchema='stellar-forge.telemetry-workspace-reference.v1';
 const objectCache=new WeakMap(),opened=new Map();
 function prepare(value,key){
  const objects=new Map();
  function visit(v){
   if(v&&typeof v==='object'&&v.schema===workspaceSchema){
    let o=objectCache.get(v);if(!o){const packed=A.serialize(v);o={id:v.rootSha256,content:packed.content,sha256:packed.sha256,bytes:packed.bytes,workspaceSha256:packed.workspace.sha256};if(Object.isFrozen(v))objectCache.set(v,o);}
    const old=objects.get(o.id);need(!old||old.sha256===o.sha256,'One workspace head has conflicting complete originals');objects.set(o.id,o);return {schema:refSchema,id:o.id};
   }
   if(Array.isArray(v))return v.map(visit);
   if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));
   return v;
  }
  const raw=JSON.stringify(value),expandedBytes=C.utf8Encode(raw).length;need(expandedBytes<=256*1024*1024,'Complete browser recovery exceeds 256 MiB; save all originals before beginning a separate installation');
  const body=visit(value),record={schema:recordSchema,installationId:key,body,bodySha256:hash(JSON.stringify(body)),expandedSha256:hash(raw),expandedBytes,objects:[...objects.values()].map(({content,...m})=>m)};record.id=hash(JSON.stringify(record));
  return {record,objects:[...objects.values()]};
 }
 function checkRecord(r,key){need(r?.schema===recordSchema&&r.installationId===key&&Array.isArray(r.objects)&&r.body&&typeof r.id==='string','Complete recovery proposal is missing');const {id,...body}=r;need(hash(JSON.stringify(body))===id&&hash(JSON.stringify(r.body))===r.bodySha256,'Complete recovery proposal identity differs');return r;}
 function expand(r,objects,key){
  checkRecord(r,key);const byId=new Map(objects.map(o=>[o?.id,o]));
  function visit(v){
   if(v&&typeof v==='object'&&v.schema===refSchema){
    need(Object.keys(v).length===2,'Workspace reference changed');const o=byId.get(v.id),binding=r.objects.find(x=>x.id===v.id);
    need(o&&binding&&o.sha256===binding.sha256&&o.bytes===binding.bytes&&o.workspaceSha256===binding.workspaceSha256&&C.utf8Encode(o.content).length===o.bytes&&hash(o.content)===o.sha256,'Complete original workspace object differs');
    let cached=opened.get(o.id);if(!cached||cached.sha256!==o.sha256){const w=A.receive(o.content);need(w.rootSha256===o.id,'Recovered workspace head differs');cached={sha256:o.sha256,workspace:w};opened.set(o.id,cached);while(opened.size>8)opened.delete(opened.keys().next().value);}
    return cached.workspace;
   }
   if(Array.isArray(v))return v.map(visit);
   if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));
   return v;
  }
  const value=visit(r.body),raw=JSON.stringify(value);need(C.utf8Encode(raw).length===r.expandedBytes&&hash(raw)===r.expandedSha256,'Reopened complete recovery differs');return copy(value);
 }
 function open(){return new Promise((resolve,reject)=>{if(!factory)return reject(Error('IndexedDB is unavailable; save the complete recovery JSON'));const q=factory.open(name,2);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains('sessions'))q.result.createObjectStore('sessions');for(const s of ['workspace-objects','recovery-proposals'])if(!q.result.objectStoreNames.contains(s))q.result.createObjectStore(s,{keyPath:'id'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Close older telemetry openings after saving their recovery JSON, then reopen this application'));});}
 function transaction(db,mode,body){return new Promise((resolve,reject)=>{let answer,failure;const tx=db.transaction(['sessions','workspace-objects','recovery-proposals'],mode);const fail=e=>{failure=e;try{tx.abort()}catch{}};tx.oncomplete=()=>resolve(answer);tx.onerror=tx.onabort=()=>reject(failure||tx.error||Error('Complete recovery transaction did not commit'));try{body(tx,v=>{answer=v},fail)}catch(e){fail(e)}});}
 function loadIn(tx,key,id,done,fail){
  const q=tx.objectStore('recovery-proposals').get(id);q.onsuccess=()=>{try{const r=checkRecord(q.result,key);need(r.id===id,'Requested proposal identity changed');const objects=[];let pending=r.objects.length;if(!pending){done({value:expand(r,objects,key),record:r});return;}for(const ref of r.objects){const get=tx.objectStore('workspace-objects').get(ref.id);get.onsuccess=()=>{try{objects.push(get.result);if(--pending===0)done({value:expand(r,objects,key),record:r});}catch(e){fail(e)}};}}catch(e){fail(e)}};
 }
 function headIn(tx,key,done,fail){const q=tx.objectStore('sessions').get(key);q.onsuccess=()=>{try{const h=q.result;if(!h){done({value:null,sha256:null});return;}if(h.schema===headSchema){need(h.installationId===key,'Browser installation head changed');loadIn(tx,key,h.recordId,r=>{need(r.record.expandedSha256===h.sha256,'Browser head identity changed');done({...r,sha256:h.sha256});},fail);}else done({value:h,sha256:hash(JSON.stringify(h)),legacy:true});}catch(e){fail(e)}};}
 function retainIn(tx,prepared,done,fail){
  let pending=prepared.objects.length;const finish=()=>{tx.objectStore('recovery-proposals').put(prepared.record);done();};if(!pending){finish();return;}
  for(const o of prepared.objects){const q=tx.objectStore('workspace-objects').get(o.id);q.onsuccess=()=>{try{const previous=q.result;if(previous)need(JSON.stringify(previous)===JSON.stringify(o),'Retained immutable workspace changed');else tx.objectStore('workspace-objects').add(o);if(--pending===0)finish();}catch(e){fail(e)}};}
 }
 function read(db,key){return transaction(db,'readonly',(tx,done,fail)=>headIn(tx,key,done,fail));}
 function load(db,key,id){return transaction(db,'readonly',(tx,done,fail)=>loadIn(tx,key,id,done,fail));}
 function commit(db,key,value,expectedSha256,transform){
  return transaction(db,'readwrite',(tx,done,fail)=>headIn(tx,key,prior=>{try{
   const next=transform?transform(copy(value),prior.value?copy(prior.value):null):value,prepared=prepare(next,key),conflict=!transform&&prior.sha256!==expectedSha256;
   const publish=()=>retainIn(tx,prepared,()=>{if(!conflict)tx.objectStore('sessions').put({schema:headSchema,installationId:key,recordId:prepared.record.id,sha256:prepared.record.expandedSha256},key);done({value:next,sha256:prepared.record.expandedSha256,recordId:prepared.record.id,conflict,currentSha256:prior.sha256});},fail);
   if(prior.legacy)retainIn(tx,prepare(prior.value,key),publish,fail);else publish();
  }catch(e){fail(e)}},fail));
 }
 function list(db,key){return transaction(db,'readonly',(tx,done,fail)=>{const rows=[],q=tx.objectStore('recovery-proposals').openCursor();q.onsuccess=()=>{try{const c=q.result;if(!c){done(rows);return;}const r=c.value;if(r.installationId===key){checkRecord(r,key);rows.push({id:r.id,sha256:r.expandedSha256,bytes:r.expandedBytes,sequence:r.body.baseState?.sequence,pendingId:r.body.pending?.id||null,objects:r.objects.length});}c.continue();}catch(e){fail(e)}};});}
 return {name,open,read,load,list,prepare,expand,save:(db,key,value,expected)=>commit(db,key,value,expected),adopt:(db,key,value,transform)=>commit(db,key,value,null,transform)};
}
